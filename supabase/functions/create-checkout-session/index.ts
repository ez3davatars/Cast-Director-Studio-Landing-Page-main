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

// ──────────────────────────────────────────────────
// Type Definitions
// ──────────────────────────────────────────────────

type CheckoutMode = "payment" | "subscription";

interface CheckoutRequest {
  // Price identification (accept multiple naming conventions)
  priceId?: string;
  price_id?: string;
  stripe_price_id?: string;
  // Product key (accept both casing conventions)
  productKey?: string;
  product_key?: string;
  // Checkout mode
  mode?: string;
  // URLs
  successUrl?: string;
  cancelUrl?: string;
  return_url?: string;
  // Flags
  guestCheckout?: boolean;
  allowDuplicatePurchase?: boolean;
}

interface CheckoutProductConfig {
  stripePriceId: string;
  mode: CheckoutMode;
  productKey: string;
}

// ──────────────────────────────────────────────────
// Product catalog (server-side source of truth)
// ──────────────────────────────────────────────────

const PRODUCT_CONFIGS: Record<string, CheckoutProductConfig> = {
  starter_monthly: {
    stripePriceId: "price_1TRiI1DETDyl6ph1Hv32GRBU",
    mode: "subscription",
    productKey: "starter_monthly",
  },
  pro_monthly: {
    stripePriceId: "price_1TRifODETDyl6ph1jkZefNuv",
    mode: "subscription",
    productKey: "pro_monthly",
  },
  indie_desktop_byok: {
    stripePriceId: "price_1TC6vuDETDyl6ph1S1HnhYPM",
    mode: "payment",
    productKey: "indie_desktop_byok",
  },
  agency_commercial_byok: {
    stripePriceId: "price_1TRiIDDETDyl6ph1oltjWtaM",
    mode: "payment",
    productKey: "agency_commercial_byok",
  },
  indie_updates_support: {
    stripePriceId: "price_1TRiIDDETDyl6ph1fH7tNwvd",
    mode: "subscription",
    productKey: "indie_updates_support",
  },
  agency_updates_support: {
    stripePriceId: "price_1TRiIEDETDyl6ph1K2Rsnrpf",
    mode: "subscription",
    productKey: "agency_updates_support",
  },
  credit_pack_100: {
    stripePriceId: "price_1TRiIEDETDyl6ph1OIY2Kw3v",
    mode: "payment",
    productKey: "credit_pack_100",
  },
  credit_pack_500: {
    stripePriceId: "price_1TRiIFDETDyl6ph1mOZYr8zc",
    mode: "payment",
    productKey: "credit_pack_500",
  },
};

// Credit pack product keys that require authenticated checkout
const AUTHENTICATED_ONLY_KEYS = new Set(["credit_pack_100", "credit_pack_500"]);

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

const normalizeMode = (value: unknown): CheckoutMode => {
  return value === "subscription" ? "subscription" : "payment";
};

/**
 * Resolve a CheckoutProductConfig from the request body.
 * Priority: explicit product_key lookup → legacy priceId with mode from body.
 */
function resolveProductConfig(body: CheckoutRequest): CheckoutProductConfig | null {
  const requestedKey = body.productKey || body.product_key;
  const legacyPriceId = body.priceId || body.price_id || body.stripe_price_id;

  // 1. Direct product_key lookup
  if (requestedKey && PRODUCT_CONFIGS[requestedKey]) {
    return PRODUCT_CONFIGS[requestedKey];
  }

  // 2. Try to find config by matching Stripe price ID across known products
  if (legacyPriceId) {
    const matchedConfig = Object.values(PRODUCT_CONFIGS).find(
      (c) => c.stripePriceId === legacyPriceId
    );
    if (matchedConfig) {
      return matchedConfig;
    }

    // 3. Legacy priceId checkout — use body.mode instead of defaulting blindly to payment
    const requestedMode = normalizeMode(body.mode);
    return {
      stripePriceId: legacyPriceId,
      mode: requestedMode,
      productKey: String(requestedKey || "legacy_price_checkout"),
    };
  }

  return null;
}

serve(async (req: Request) => {
  // Handle CORS preflight explicitly
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ──────────────────────────────────────────────────
    // 1. PARSE REQUEST BODY
    // ──────────────────────────────────────────────────
    const body: CheckoutRequest = await req.json();

    console.log("[create-checkout-session] Incoming request:", {
      priceId: body.priceId || body.price_id || body.stripe_price_id,
      productKey: body.productKey || body.product_key,
      mode: body.mode,
      guestCheckout: body.guestCheckout,
    });

    // ──────────────────────────────────────────────────
    // 2. RESOLVE PRODUCT CONFIG
    // ──────────────────────────────────────────────────
    const productConfig = resolveProductConfig(body);

    if (!productConfig || !productConfig.stripePriceId) {
      return new Response(JSON.stringify({
        error: "Missing required metadata: stripe_price_id or product_key",
        code: "bad_request",
        message: "Missing required metadata: stripe_price_id or product_key",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { stripePriceId, mode, productKey } = productConfig;

    console.log("[create-checkout-session] Resolved product config:", {
      stripePriceId,
      mode,
      productKey,
    });

    if (!Deno.env.get("STRIPE_SECRET_KEY")) {
      return new Response(JSON.stringify({
        error: "Backend Configuration Error",
        code: "server_configuration_error",
        message: "Missing STRIPE_SECRET_KEY",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──────────────────────────────────────────────────
    // 3. DETERMINE AUTH MODE
    //    - Credit packs always require authentication
    //    - guestCheckout === true → skip JWT, proceed as guest
    //    - Otherwise → validate JWT strictly, 401 on failure
    // ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    let user = null;
    let isGuestCheckout = body.guestCheckout === true;

    // Credit packs must always be authenticated
    if (AUTHENTICATED_ONLY_KEYS.has(productKey)) {
      isGuestCheckout = false;
    }

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
          details: userError,
        }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      user = authUser;
    }

    // 4. Initialize Service Role Client for administrative lookups
    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 5. Resolve product metadata from DB for session params
    const { data: product } = await supabaseAdmin.from('products').select('id, name, product_key').eq('stripe_price_id', stripePriceId).maybeSingle();
    const resolvedProductKey = product?.product_key || productKey;

    // Determine success type from product
    let successType = 'byok';
    const productType = (resolvedProductKey || '').toLowerCase();
    if (productType.includes('starter') || productType.includes('pro')) successType = 'hosted';
    else if (productType.includes('updates') || productType.includes('support')) successType = 'renewal';
    else if (productType.includes('credit')) successType = 'topup';

    // Resolve success/cancel URLs
    const successUrl = body.successUrl || body.return_url;
    const cancelUrl = body.cancelUrl;

    // ──────────────────────────────────────────────────
    // AUTHENTICATED CHECKOUT PATH
    // ──────────────────────────────────────────────────
    if (!isGuestCheckout && user) {
      // 5a. Account Status Guard (block paused/canceled accounts)
      const { data: profileCheck } = await supabaseAdmin.from('profiles').select('account_status').eq('id', user.id).maybeSingle();
      if (profileCheck && profileCheck.account_status !== 'active') {
        return new Response(JSON.stringify({
          error: "Your account is not currently eligible for checkout. Please contact support.",
          code: "account_blocked",
          message: "Your account is not currently eligible for checkout. Please contact support.",
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 5b. Backend Duplicate Guard (authenticated only)
      if (product) {
        const { data: activeLicenses } = await supabaseAdmin.from('licenses')
            .select('*, products ( name, product_key )')
            .eq('user_id', user.id)
            .ilike('status', 'active');
            
        const { data: activeSubs } = await supabaseAdmin.from('subscriptions')
            .select('id, metadata').eq('user_id', user.id).ilike('status', 'active');
            
        const dupProductKey = product.product_key || product.metadata?.product_key || '';
        
        let blockReason = null;
        let errorMessage = `You already own an active license or subscription for ${product.name || 'this product'}.`;

        // Check 1: Exact Match (Subscription)
        if (activeSubs?.some(s => s.metadata?.stripe_price_id === stripePriceId)) {
            blockReason = "exact_subscription_exists";
        }
        
        // Check 2: Exact Match (License)
        if (!blockReason && activeLicenses?.some((l: any) => {
            const pName = product.name || '';
            const ownedName = (l.license_name || l.products?.name || '').toLowerCase().trim();
            const targetName = pName.toLowerCase().trim();
            return l.product_id === product.id || 
                   l.stripe_price_id === stripePriceId ||
                   (ownedName && targetName && ownedName === targetName);
        })) {
            blockReason = "exact_license_exists";
        }

        // Check 3: Cross-tier Blocks
        if (!blockReason) {
            if (dupProductKey === 'indie_desktop_byok') {
                if (activeLicenses?.some((l: any) => l.products?.product_key === 'agency_desktop_byok')) {
                    blockReason = "higher_tier_owned";
                    errorMessage = "You already own the Agency Commercial tier, which includes all Indie features.";
                }
            } else if (dupProductKey === 'starter') {
                const hasPro = activeSubs?.some(s => s.metadata?.product_key === 'pro' || s.metadata?.stripe_price_id !== stripePriceId);
                if (activeSubs && activeSubs.length > 0 && hasPro) {
                    blockReason = "higher_tier_owned";
                    errorMessage = "You already have an active Pro subscription.";
                }
            }
        }

        // Check 4: Renewal Prerequisites
        if (!blockReason && (dupProductKey.includes('updates') || dupProductKey.includes('support'))) {
            const isIndieRenewal = dupProductKey.includes('indie');
            const isAgencyRenewal = dupProductKey.includes('agency');
            
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

        if (blockReason && body.allowDuplicatePurchase !== true) {
            console.log(`[create-checkout-session] Blocking duplicate purchase for user ${user.id}:`, {
              blockReason,
              productKey: resolvedProductKey,
              productName: product.name,
              priceId: stripePriceId,
            });
            return new Response(JSON.stringify({ 
                error: "duplicate_purchase",
                code: "duplicate_purchase",
                message: errorMessage,
                productKey: resolvedProductKey,
                productName: product.name,
                reason: blockReason
            }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // 6. Stripe Customer Resolution (authenticated)
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

      // 7. Create Authenticated Stripe Checkout Session
      const sessionMetadata = {
        user_id: user.id,
        checkout_mode: "authenticated",
        product_key: resolvedProductKey,
        price_id: stripePriceId,
        success_type: successType,
      };

      const sessionParams: any = {
        customer: customerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        mode: mode,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: user.id,
        metadata: sessionMetadata,
      };

      // Mode-specific metadata propagation
      if (mode === 'subscription') {
        sessionParams.subscription_data = {
          metadata: { user_id: user.id, product_key: resolvedProductKey },
        };
      } else if (mode === 'payment') {
        sessionParams.payment_intent_data = {
          metadata: { user_id: user.id, product_key: resolvedProductKey },
        };
      }

      console.log("[create-checkout-session] Creating authenticated Stripe session:", {
        mode,
        productKey: resolvedProductKey,
        priceId: stripePriceId,
        customerId,
        userId: user.id,
      });

      try {
        const session = await stripe.checkout.sessions.create(sessionParams);

        return new Response(JSON.stringify({ url: session.url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (stripeErr: any) {
        console.error("[create-checkout-session] Stripe checkout creation failed:", stripeErr);

        const stripeCode = stripeErr.code || stripeErr.raw?.code || "unknown";
        const stripeMessage = stripeErr.message || stripeErr.raw?.message || "Stripe checkout session creation failed";

        return new Response(JSON.stringify({
          error: "Stripe checkout session creation failed",
          code: "STRIPE_CHECKOUT_FAILED",
          stripeCode,
          stripeMessage,
          productKey: resolvedProductKey,
          mode,
        }), {
          status: stripeErr.statusCode || 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ──────────────────────────────────────────────────
    // GUEST CHECKOUT PATH
    // ──────────────────────────────────────────────────
    const guestMetadata = {
      checkout_mode: "guest",
      product_key: resolvedProductKey,
      price_id: stripePriceId,
      success_type: successType,
    };

    const guestSessionParams: any = {
      // No customer pre-set — Stripe collects email natively
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: guestMetadata,
    };

    // Mode-specific metadata propagation
    if (mode === 'subscription') {
      guestSessionParams.subscription_data = {
        metadata: {
          checkout_mode: "guest",
          product_key: resolvedProductKey,
        },
      };
    } else if (mode === 'payment') {
      guestSessionParams.payment_intent_data = {
        metadata: {
          checkout_mode: "guest",
          product_key: resolvedProductKey,
        },
      };
    }

    console.log("[create-checkout-session] Creating guest Stripe session:", {
      mode,
      productKey: resolvedProductKey,
      priceId: stripePriceId,
    });

    try {
      const session = await stripe.checkout.sessions.create(guestSessionParams);

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (stripeErr: any) {
      console.error("[create-checkout-session] Stripe guest checkout creation failed:", stripeErr);

      const stripeCode = stripeErr.code || stripeErr.raw?.code || "unknown";
      const stripeMessage = stripeErr.message || stripeErr.raw?.message || "Stripe checkout session creation failed";

      return new Response(JSON.stringify({
        error: "Stripe checkout session creation failed",
        code: "STRIPE_CHECKOUT_FAILED",
        stripeCode,
        stripeMessage,
        productKey: resolvedProductKey,
        mode,
      }), {
        status: stripeErr.statusCode || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err: any) {
    if (err.raw?.statusCode === 401 || err.statusCode === 401 || err.type === "StripeAuthenticationError") {
       console.error("CRITICAL: Stripe API rejected the backend request! 401 Unauthorized.");
       return new Response(JSON.stringify({ error: "Stripe API Error", code: "stripe_auth_error", message: "Stripe API Key Invalid or Missing Permissions" }), {
         status: 500,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
    }

    console.error("[create-checkout-session] Internal Edge Function Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", code: "internal_error", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
