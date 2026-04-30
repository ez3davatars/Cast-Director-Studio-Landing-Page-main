// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@14.14.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight explicitly
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ──────────────────────────────────────────────────
    // 1. PARSE REQUEST BODY FIRST (needed to check guestCheckout flag)
    // ──────────────────────────────────────────────────
    const { priceId, successUrl, cancelUrl, allowDuplicatePurchase, guestCheckout } = await req.json();

    // ──────────────────────────────────────────────────
    // 2. DETERMINE CHECKOUT MODE: Authenticated vs Guest
    //    - guestCheckout === true → skip JWT, proceed as guest
    //    - guestCheckout !== true → validate JWT strictly, 401 on failure
    // ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    let user = null;
    let isGuestCheckout = guestCheckout === true;

    if (!isGuestCheckout) {
      // Authenticated path: require valid JWT
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          auth: { persistSession: false },
          global: { headers: { Authorization: authHeader! } },
        }
      );

      const { data: { user: authUser }, error: userError } = await supabaseClient.auth.getUser();

      if (userError || !authUser) {
        // Invalid JWT → hard 401
        return new Response(JSON.stringify({
          error: "Unauthorized access or missing valid JWT token",
          code: "unauthorized",
          message: "Unauthorized access or missing valid JWT token",
          details: userError
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      user = authUser;
    }

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Missing required metadata: stripe_price_id", code: "bad_request", message: "Missing required metadata: stripe_price_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Deno.env.get("STRIPE_SECRET_KEY")) {
      return new Response(JSON.stringify({ error: "Backend Configuration Error", code: "server_configuration_error", message: "Missing STRIPE_SECRET_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Initialize Service Role Client for administrative lookups
    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 4. Resolve product metadata for session params
    const { data: product } = await supabaseAdmin.from('products').select('id, name, product_key').eq('stripe_price_id', priceId).maybeSingle();
    const productKey = product?.product_key || "unknown";

    // Determine success type from product
    let successType = 'byok';
    const productType = (product?.product_key || '').toLowerCase();
    if (productType.includes('starter') || productType.includes('pro')) successType = 'hosted';
    else if (productType.includes('updates') || productType.includes('support')) successType = 'renewal';

    // ──────────────────────────────────────────────────
    // AUTHENTICATED CHECKOUT PATH
    // ──────────────────────────────────────────────────
    if (!isGuestCheckout && user) {
      // 4b. Backend Duplicate Guard (authenticated only)
      if (product) {
        const { data: activeLicenses } = await supabaseAdmin.from('licenses')
            .select('*, products ( name, product_key )')
            .eq('user_id', user.id)
            .ilike('status', 'active');
            
        const { data: activeSubs } = await supabaseAdmin.from('subscriptions')
            .select('id, metadata').eq('user_id', user.id).ilike('status', 'active');
            
        const productKey = product.product_key || product.metadata?.product_key || '';
        
        let blockReason = null;
        let errorMessage = `You already own an active license or subscription for ${product.name || 'this product'}.`;

        // Check 1: Exact Match (Subscription)
        if (activeSubs?.some(s => s.metadata?.stripe_price_id === priceId)) {
            blockReason = "exact_subscription_exists";
        }
        
        // Check 2: Exact Match (License)
        if (!blockReason && activeLicenses?.some((l: any) => {
            const pName = product.name || '';
            const ownedName = (l.license_name || l.products?.name || '').toLowerCase().trim();
            const targetName = pName.toLowerCase().trim();
            return l.product_id === product.id || 
                   l.stripe_price_id === priceId ||
                   (ownedName && targetName && ownedName === targetName);
        })) {
            blockReason = "exact_license_exists";
        }

        // Check 3: Cross-tier Blocks
        if (!blockReason) {
            if (productKey === 'indie_desktop_byok') {
                if (activeLicenses?.some((l: any) => l.products?.product_key === 'agency_desktop_byok')) {
                    blockReason = "higher_tier_owned";
                    errorMessage = "You already own the Agency Commercial tier, which includes all Indie features.";
                }
            } else if (productKey === 'starter') {
                // Determine if user has Pro by checking activeSubs metadata against products
                // (Optimized: we can fetch all pro price IDs or just check if they have a sub with 'pro' in the name/metadata if available)
                // For simplicity, we block Starter if any active subscription is NOT Starter (i.e. they have Pro)
                // We'll rely on the frontend passing the correct intent, but backend will block if they have a sub with a different price ID (which means Pro, since there are only 2)
                const hasPro = activeSubs?.some(s => s.metadata?.product_key === 'pro' || s.metadata?.stripe_price_id !== priceId);
                if (activeSubs && activeSubs.length > 0 && hasPro) {
                    blockReason = "higher_tier_owned";
                    errorMessage = "You already have an active Pro subscription.";
                }
            }
        }

        // Check 4: Renewal Prerequisites
        if (!blockReason && (productKey.includes('updates') || productKey.includes('support'))) {
            const isIndieRenewal = productKey.includes('indie');
            const isAgencyRenewal = productKey.includes('agency');
            
            const ownsIndie = activeLicenses?.some((l: any) => l.products?.product_key === 'indie_desktop_byok');
            const ownsAgency = activeLicenses?.some((l: any) => l.products?.product_key === 'agency_desktop_byok');
            
            if (isIndieRenewal && !ownsIndie) {
                blockReason = "missing_base_license";
                errorMessage = "You must own the Indie Desktop BYOK license to purchase this renewal.";
            } else if (isAgencyRenewal && !ownsAgency) {
                blockReason = "missing_base_license";
                errorMessage = "You must own the Agency Commercial BYOK license to purchase this renewal.";
            }
        }

        if (blockReason && allowDuplicatePurchase !== true) {
            return new Response(JSON.stringify({ 
                error: "duplicate_purchase",
                code: "duplicate_purchase",
                message: errorMessage,
                productKey: product.product_key,
                productName: product.name,
                reason: blockReason
            }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // 5. Stripe Customer Resolution (authenticated)
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("stripe_customer_id")
        .eq("email", user.email)
        .maybeSingle();

      let customerId = contact?.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;
        
        await supabaseAdmin.from("contacts").upsert({
          email: user.email,
          stripe_customer_id: customerId,
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'email' });
      }

      // 6. Create Authenticated Stripe Checkout Session
      const price = await stripe.prices.retrieve(priceId);
      const mode = price.type === 'recurring' ? 'subscription' : 'payment';

      const sessionParams: any = {
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: mode,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: user.id,
        metadata: {
          user_id: user.id,
          checkout_mode: "authenticated",
          product_key: productKey,
          price_id: priceId,
          success_type: successType,
        },
      };

      if (mode === 'subscription') {
        sessionParams.subscription_data = {
            metadata: { user_id: user.id }
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──────────────────────────────────────────────────
    // GUEST CHECKOUT PATH
    // ──────────────────────────────────────────────────
    const price = await stripe.prices.retrieve(priceId);
    const mode = price.type === 'recurring' ? 'subscription' : 'payment';

    const guestSessionParams: any = {
      // No customer pre-set — Stripe collects email natively
      line_items: [{ price: priceId, quantity: 1 }],
      mode: mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      // No client_reference_id — no user yet
      // No user_id in metadata
      metadata: {
        checkout_mode: "guest",
        product_key: productKey,
        price_id: priceId,
        success_type: successType,
      },
    };

    if (mode === 'subscription') {
      guestSessionParams.subscription_data = {
        metadata: {
          checkout_mode: "guest",
          product_key: productKey,
        }
      };
    }

    const session = await stripe.checkout.sessions.create(guestSessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    if (err.raw?.statusCode === 401 || err.statusCode === 401 || err.type === "StripeAuthenticationError") {
       console.error("CRITICAL: Stripe API rejected the backend request! 401 Unauthorized.");
       return new Response(JSON.stringify({ error: "Stripe API Error", code: "stripe_auth_error", message: "Stripe API Key Invalid or Missing Permissions" }), {
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
    }

    console.error("Internal Edge Function Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", code: "internal_error", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
