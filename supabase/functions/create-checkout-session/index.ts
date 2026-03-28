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
    // 1. Initialize User-Bound Supabase Client
    // This allows us to securely interact with the DB acting exactly as the authenticated user.
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 2. Read Authenticated User directly from the incoming JWT Authorization Header
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      // Intentionally surfacing 401 if the JWT was somehow bypassed, tampered, or expired.
      return new Response(JSON.stringify({ error: "Unauthorized access or missing valid JWT token", details: userError }), {
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Validate Request Payload
    const { priceId, successUrl, cancelUrl, allowDuplicatePurchase } = await req.json();

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Missing required metadata: stripe_price_id" }), {
        status: 400, // 400 Bad Request
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Deno.env.get("STRIPE_SECRET_KEY")) {
      return new Response(JSON.stringify({ error: "Backend Configuration Error: Missing STRIPE_SECRET_KEY" }), {
        status: 500, // Explicitly surfacing missing keys as 500, not 401
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Initialize Service Role Client for administrative lookups bypassing RLS constraint paths
    // We only use this when absolutely necessary (e.g. cross-referencing global contacts).
    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 4b. Backend Duplicate Guard
    const { data: product } = await supabaseAdmin.from('products').select('id, name, product_key').eq('stripe_price_id', priceId).maybeSingle();
    
    if (product) {
       const { data: activeLicenses } = await supabaseAdmin.from('licenses')
           .select('*, products ( name )')
           .eq('user_id', user.id)
           .ilike('status', 'active');
           
       const hasActiveLicense = activeLicenses?.some((l: any) => {
           const pName = product.name || '';
           const ownedName = (l.license_name || l.products?.name || '').toLowerCase().trim();
           const targetName = pName.toLowerCase().trim();
           
           return l.product_id === product.id || 
                  l.stripe_price_id === priceId ||
                  (ownedName && targetName && ownedName === targetName);
       });
           
       const { data: activeSubs } = await supabaseAdmin.from('subscriptions')
           .select('id').eq('user_id', user.id).ilike('status', 'active').eq('metadata->>stripe_price_id', priceId).limit(1);

       if (hasActiveLicense || (activeSubs && activeSubs.length > 0)) {
           // We found an active overlap. Check override intent.
           if (allowDuplicatePurchase !== true) {
               return new Response(JSON.stringify({ 
                   error: "duplicate_purchase",
                   productKey: product.product_key,
                   productName: "Requested Product",
                   reason: "active_license_exists"
               }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
           }
       }
    }

    // 5. Safely Recover or Bind Stripe Customer Metadata
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("stripe_customer_id")
      .eq("email", user.email)
      .maybeSingle();

    let customerId = contact?.stripe_customer_id;

    if (!customerId) {
      // Create a new Stripe Customer expressly configured with this verified user's ID
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;
      
      // Upsert the new mapping back into the backend using the isolated Service Role
      await supabaseAdmin.from("contacts").upsert({
        email: user.email,
        stripe_customer_id: customerId,
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'email' });
    }

    // 6. Execute Stripe Checkout explicitly linking the payload payload
    const price = await stripe.prices.retrieve(priceId);
    const mode = price.type === 'recurring' ? 'subscription' : 'payment';

    const sessionParams: any = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
      },
    };

    if (mode === 'subscription') {
      sessionParams.subscription_data = {
          metadata: {
              user_id: user.id,
          }
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    if (err.raw?.statusCode === 401 || err.statusCode === 401 || err.type === "StripeAuthenticationError") {
       // STRIPE IS RETURNING 401
       console.error("CRITICAL: Stripe API rejected the backend request! 401 Unauthorized.");
       return new Response(JSON.stringify({ error: "Stripe API Key Invalid or Missing Permissions" }), {
         status: 500, // Rebranding remote 401 to local 500 so frontend doesn't falsely drop the user's session
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
    }

    console.error("Internal Edge Function Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
