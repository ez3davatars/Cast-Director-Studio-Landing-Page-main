// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.14.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Authenticate user (JWT required) ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Authentication required.',
        code: 'AUTH_REQUIRED',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'Authentication required. Please sign in.',
        code: 'AUTH_REQUIRED',
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Validate environment ──
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[BillingPortal] STRIPE_SECRET_KEY not configured');
      return new Response(JSON.stringify({
        error: 'Billing portal is temporarily unavailable.',
        code: 'SERVER_CONFIG_ERROR',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const returnUrl = Deno.env.get('STRIPE_CUSTOMER_PORTAL_RETURN_URL');
    if (!returnUrl || !(returnUrl.startsWith('https://') || returnUrl.startsWith('http://'))) {
      console.error('[BillingPortal] STRIPE_CUSTOMER_PORTAL_RETURN_URL missing or invalid:', returnUrl);
      return new Response(JSON.stringify({
        error: 'Billing portal is temporarily unavailable.',
        code: 'SERVER_CONFIG_ERROR',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Resolve Stripe customer ID server-side only ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let stripeCustomerId: string | null = null;

    // Lookup 1: contacts table (primary — used by checkout)
    if (!stripeCustomerId) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .not('stripe_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (contact?.stripe_customer_id) stripeCustomerId = contact.stripe_customer_id;
    }

    // Lookup 2: crm_contacts table (fallback if contacts doesn't have it)
    if (!stripeCustomerId) {
      const { data: crmContact } = await supabaseAdmin
        .from('crm_contacts')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .not('stripe_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (crmContact?.stripe_customer_id) stripeCustomerId = crmContact.stripe_customer_id;
    }

    // Lookup 3: subscriptions table (secondary)
    if (!stripeCustomerId) {
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .not('stripe_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (sub?.stripe_customer_id) stripeCustomerId = sub.stripe_customer_id;
    }

    if (!stripeCustomerId) {
      return new Response(JSON.stringify({
        error: 'No Stripe customer was found for this account. If you have made a purchase, please contact support.',
        code: 'STRIPE_CUSTOMER_NOT_FOUND',
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Create Stripe Billing Portal session ──
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    // ── 5. Return portal URL only ──
    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[BillingPortal] Unexpected error:', error);
    return new Response(JSON.stringify({
      error: 'An unexpected error occurred while creating the billing portal session.',
      code: 'INTERNAL_ERROR',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
