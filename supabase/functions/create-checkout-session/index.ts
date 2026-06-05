// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// ──────────────────────────────────────────────────
// Stripe + CORS
// ──────────────────────────────────────────────────

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cds-ref",
};

// ──────────────────────────────────────────────────
// Affiliate Attribution Helper
// Reads the cds_ref cookie from the Cookie header.
// The cookie value is an opaque session_token from
// affiliate_clicks — it reveals nothing about the
// affiliate. Only this token is stored in the browser.
// ──────────────────────────────────────────────────

function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ──────────────────────────────────────────────────
// PRODUCT_MAP — server-side source of truth
// Price IDs come exclusively from Supabase secrets.
// ──────────────────────────────────────────────────

type CheckoutMode = "payment" | "subscription";

interface ProductConfig {
  envKey: string;
  mode: CheckoutMode;
  purchase_kind: string;
  credits?: number;
  monthly_credits?: number;
  requiresAuth?: boolean;
}

const PRODUCT_MAP: Record<string, ProductConfig> = {
  starter_monthly: {
    envKey: "STRIPE_PRICE_STARTER_MONTHLY",
    mode: "subscription",
    purchase_kind: "HOSTED_SUBSCRIPTION",
    monthly_credits: 600,
  },
  pro_monthly: {
    envKey: "STRIPE_PRICE_PRO_MONTHLY",
    mode: "subscription",
    purchase_kind: "HOSTED_SUBSCRIPTION",
    monthly_credits: 1200,
  },
  indie_desktop_byok: {
    envKey: "STRIPE_PRICE_INDIE_DESKTOP_BYOK",
    mode: "payment",
    purchase_kind: "BYOK_LICENSE",
  },
  agency_commercial_byok: {
    envKey: "STRIPE_PRICE_AGENCY_DESKTOP_BYOK",
    mode: "payment",
    purchase_kind: "BYOK_LICENSE",
  },
  indie_updates_support: {
    envKey: "STRIPE_PRICE_INDIE_UPDATES_SUPPORT",
    mode: "subscription",
    purchase_kind: "SUPPORT_RENEWAL",
  },
  agency_updates_support: {
    envKey: "STRIPE_PRICE_AGENCY_UPDATES_SUPPORT",
    mode: "subscription",
    purchase_kind: "SUPPORT_RENEWAL",
  },
  credit_pack_100: {
    envKey: "STRIPE_PRICE_CREDIT_PACK_100",
    mode: "payment",
    purchase_kind: "TOPUP_PURCHASE",
    credits: 100,
    requiresAuth: true,
  },
  credit_pack_500: {
    envKey: "STRIPE_PRICE_CREDIT_PACK_500",
    mode: "payment",
    purchase_kind: "TOPUP_PURCHASE",
    credits: 500,
    requiresAuth: true,
  },
};

// Alias normalization
const ALIASES: Record<string, string> = {
  agency_desktop_byok: "agency_commercial_byok",
  starter: "starter_monthly",
  pro: "pro_monthly",
};

// Non-repeatable product keys — duplicates are blocked for authenticated users
const NON_REPEATABLE_KEYS = new Set([
  "starter_monthly",
  "pro_monthly",
  "indie_desktop_byok",
  "agency_commercial_byok",
]);

// ──────────────────────────────────────────────────
// Duplicate Purchase Guard (helper)
// ──────────────────────────────────────────────────

async function checkDuplicatePurchase(
  supabaseAdmin: any,
  userId: string,
  productKey: string,
  priceId: string
): Promise<string | null> {
  if (!NON_REPEATABLE_KEYS.has(productKey)) return null;

  // Check active subscriptions
  const { data: activeSubs } = await supabaseAdmin
    .from("subscriptions")
    .select("id, metadata, status")
    .eq("user_id", userId)
    .ilike("status", "active");

  // Check active licenses
  const { data: activeLicenses } = await supabaseAdmin
    .from("licenses")
    .select("id, stripe_price_id, product_id, products ( product_key )")
    .eq("user_id", userId)
    .ilike("status", "active");

  // Subscription products: starter_monthly, pro_monthly
  if (productKey === "starter_monthly" || productKey === "pro_monthly") {
    const hasMatch = activeSubs?.some(
      (s: any) =>
        s.metadata?.product_key === productKey ||
        s.metadata?.stripe_price_id === priceId
    );
    if (hasMatch) return "active_subscription_exists";
  }

  // License products: indie_desktop_byok, agency_commercial_byok
  if (
    productKey === "indie_desktop_byok" ||
    productKey === "agency_commercial_byok"
  ) {
    const matchKey =
      productKey === "agency_commercial_byok"
        ? "agency_desktop_byok"
        : productKey;
    const hasMatch = activeLicenses?.some(
      (l: any) =>
        l.products?.product_key === productKey ||
        l.products?.product_key === matchKey ||
        l.stripe_price_id === priceId
    );
    if (hasMatch) return "active_license_exists";

    // Cross-tier: block indie if agency is already owned
    if (productKey === "indie_desktop_byok") {
      const hasAgency = activeLicenses?.some(
        (l: any) =>
          l.products?.product_key === "agency_desktop_byok" ||
          l.products?.product_key === "agency_commercial_byok"
      );
      if (hasAgency) return "higher_tier_owned";
    }
  }

  return null;
}

// ──────────────────────────────────────────────────
// Stripe Customer Resolution (helper)
// ──────────────────────────────────────────────────

async function resolveStripeCustomer(
  supabaseAdmin: any,
  userId: string,
  email: string
): Promise<string | null> {
  try {
    // 1. Check contacts table for existing Stripe customer
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("stripe_customer_id")
      .eq("email", email)
      .maybeSingle();

    if (contact?.stripe_customer_id) return contact.stripe_customer_id;

    // 2. Create new Stripe customer
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });

    // 3. Upsert into contacts table
    await supabaseAdmin.from("contacts").upsert(
      {
        email,
        stripe_customer_id: customer.id,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

    return customer.id;
  } catch (err) {
    console.error("[Customer Resolution] Non-fatal error:", err);
    // Don't block checkout — Stripe will create an ad-hoc customer
    return null;
  }
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // POST only
  if (req.method !== "POST") {
    return json({ code: "METHOD_NOT_ALLOWED", error: "POST only." }, 405);
  }

  try {
    // ── 1. Parse body ──
    const body = await req.json();
    const rawProductKey: string | undefined = body.productKey || body.product_key;

    if (!rawProductKey || typeof rawProductKey !== "string") {
      return json(
        { code: "UNKNOWN_PRODUCT", error: "Unknown checkout product." },
        400
      );
    }

    // ── 2. Normalize alias ──
    const productKey = ALIASES[rawProductKey.trim().toLowerCase()] || rawProductKey.trim().toLowerCase();

    // ── 3. Look up product config ──
    const config = PRODUCT_MAP[productKey];
    if (!config) {
      return json(
        { code: "UNKNOWN_PRODUCT", error: "Unknown checkout product." },
        400
      );
    }

    // ── 4. Read Stripe price ID from secret ──
    const priceId = Deno.env.get(config.envKey);
    if (!priceId) {
      console.error(
        `[Checkout] Missing secret ${config.envKey} for product ${productKey}`
      );
      return json(
        {
          code: "PRICE_NOT_CONFIGURED",
          error: "Stripe price is not configured for this product.",
        },
        500
      );
    }

    // ── 5. Auth resolution ──
    const authHeader = req.headers.get("Authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    let userId: string | null = null;
    let userEmail: string | null = null;

    // Determine if the token is a real user JWT (not just the anon key)
    const token = authHeader?.replace("Bearer ", "");
    const isRealToken = token && token !== anonKey && token.length > 40;

    if (config.requiresAuth) {
      // Credit packs: require valid auth
      if (!isRealToken) {
        return json(
          {
            code: "AUTH_REQUIRED",
            error:
              "Authentication is required for credit pack purchases. Please sign in.",
          },
          401
        );
      }

      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        anonKey,
        { auth: { persistSession: false } }
      );
      const {
        data: { user },
        error: authErr,
      } = await supabaseAuth.auth.getUser(token);

      if (authErr || !user) {
        return json(
          {
            code: "AUTH_REQUIRED",
            error: "Invalid or expired authentication token.",
          },
          401
        );
      }

      userId = user.id;
      userEmail = user.email ?? null;
    } else {
      // Public products: auth is optional
      if (isRealToken) {
        try {
          const supabaseAuth = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            anonKey,
            { auth: { persistSession: false } }
          );
          const {
            data: { user },
          } = await supabaseAuth.auth.getUser(token);

          if (user) {
            userId = user.id;
            userEmail = user.email ?? null;
          }
        } catch {
          // Non-fatal: proceed as guest
          console.warn("[Checkout] Optional auth validation failed, continuing as guest.");
        }
      }
    }

    // ── 6. Account status guard (authenticated only) ──
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (userId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("account_status")
        .eq("id", userId)
        .maybeSingle();

      if (profile && profile.account_status !== "active") {
        return json(
          {
            code: "ACCOUNT_BLOCKED",
            error:
              "Your account is not currently eligible for checkout. Please contact support.",
          },
          403
        );
      }
    }

    // ── 7. Duplicate purchase guard (authenticated + non-repeatable only) ──
    if (userId) {
      const dupReason = await checkDuplicatePurchase(
        supabaseAdmin,
        userId,
        productKey,
        priceId
      );
      if (dupReason) {
        console.log(
          `[Checkout] Duplicate blocked: user=${userId}, product=${productKey}, reason=${dupReason}`
        );
        return json(
          {
            code: "DUPLICATE_PURCHASE",
            error: "You already have access to this product.",
          },
          409
        );
      }
    }

    // ── 8. Stripe customer resolution (authenticated only) ──
    let customerId: string | null = null;
    if (userId && userEmail) {
      customerId = await resolveStripeCustomer(
        supabaseAdmin,
        userId,
        userEmail
      );
    }

    // ── 9. Affiliate attribution — token pickup, validation, self-referral guard ──
    //
    // Reading priority: request body → x-cds-ref header → cds_ref cookie.
    // The token is an opaque session_token stored in affiliate_clicks.
    // It reveals nothing about the affiliate identity.
    //
    // This is a Vite + React SPA. The Edge Function runs cross-origin at
    // *.supabase.co, so it cannot set an HttpOnly first-party cookie on the
    // app domain. Cookies are set by the frontend after it receives the token
    // from record-affiliate-click. We therefore read them back via the Cookie
    // header (SameSite=Lax cookies are sent on same-site navigations and on
    // cross-site POST/fetch when the site initiates them, so this works in
    // practice for logged-in users on modern browsers).
    //
    // CRITICAL: every branch is wrapped in a single try/catch.
    //           Attribution failure MUST NOT block or fail checkout under any
    //           circumstance — including DB timeouts, missing rows, or schema
    //           mismatches.
    let affiliateSessionToken: string | null = null;
    try {
      const tokenFromBody   = typeof body.affiliate_session_token === "string"
        ? body.affiliate_session_token.trim() : null;
      const tokenFromHeader = req.headers.get("x-cds-ref")?.trim() ?? null;
      const tokenFromCookie = parseCookieValue(req.headers.get("cookie"), "cds_ref");
      const rawToken        = (tokenFromBody || tokenFromHeader || tokenFromCookie) ?? null;

      if (rawToken && rawToken.length > 0) {
        // ── Validate: token must exist, be unexpired, and not yet converted ──
        const { data: clickRow } = await supabaseAdmin
          .from("affiliate_clicks")
          .select("id, affiliate_id, expires_at, converted")
          .eq("session_token", rawToken)
          .maybeSingle();

        if (!clickRow) {
          console.log("[Checkout] Affiliate token not found in affiliate_clicks — skipping.");
        } else if (clickRow.converted) {
          console.log("[Checkout] Affiliate token already converted — skipping.");
        } else if (new Date(clickRow.expires_at) <= new Date()) {
          console.log("[Checkout] Affiliate token expired — skipping.");
        } else if (userId) {
          // ── Self-referral guard (authenticated user) ──
          // Check whether the logged-in buyer owns the affiliate account that
          // generated this click. Definitive check also runs in stripe-webhook
          // after full identity resolution, so this is belt-and-suspenders.
          const { data: affiliateRow } = await supabaseAdmin
            .from("affiliates")
            .select("user_id")
            .eq("id", clickRow.affiliate_id)
            .maybeSingle();

          if (affiliateRow?.user_id === userId) {
            console.log("[Checkout] Self-referral detected at checkout — stripping token.");
          } else {
            affiliateSessionToken = rawToken;
            console.log("[Checkout] Affiliate token valid (authenticated) — will embed in metadata.");
          }
        } else {
          // Guest checkout: identity not yet known.
          // Self-referral check runs again in stripe-webhook after resolution.
          affiliateSessionToken = rawToken;
          console.log("[Checkout] Affiliate token valid (guest) — will embed in metadata.");
        }
      }
    } catch (affTokenErr) {
      // Non-fatal — swallow and continue without attribution
      console.warn("[Checkout] Affiliate token handling failed (non-fatal):", affTokenErr);
    }

    // ── 10. Build metadata ──
    const metadata: Record<string, string> = {
      product_key: productKey,
      purchase_kind: config.purchase_kind,
      source: "checkout_session",
    };
    if (userId) metadata.user_id = userId;
    if (userEmail) metadata.email = userEmail;
    if (config.credits) metadata.credits = String(config.credits);
    if (config.monthly_credits)
      metadata.monthly_credits = String(config.monthly_credits);
    // Affiliate token — embedded last so it never overwrites commerce fields.
    // stripe-webhook reads this to attribute the conversion.
    if (affiliateSessionToken) {
      metadata.affiliate_session_token = affiliateSessionToken;
    }

    // ── 11. Build Stripe Checkout Session params ──
    const success_url =
      body.successUrl ||
      body.success_url ||
      `${Deno.env.get("SITE_URL") || "https://castdirectorstudio.com"}/get-started#session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url =
      body.cancelUrl ||
      body.cancel_url ||
      `${Deno.env.get("SITE_URL") || "https://castdirectorstudio.com"}/#pricing`;

    const sessionParams: any = {
      mode: config.mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      metadata,
    };

    // Attach customer if resolved
    if (customerId) {
      sessionParams.customer = customerId;
    }

    // Client reference for webhook identity resolution
    if (userId) {
      sessionParams.client_reference_id = userId;
    }

    // Mode-specific metadata propagation
    // affiliate_session_token is already in `metadata` from step 9, so it flows
    // automatically into both payment_intent_data and subscription_data here.
    if (config.mode === "payment") {
      sessionParams.payment_intent_data = { metadata };
    }
    if (config.mode === "subscription") {
      sessionParams.subscription_data = { metadata };
    }

    // ── 12. Safe logging ──
    console.log("[Checkout] Creating session:", {
      productKey,
      mode: config.mode,
      purchaseKind: config.purchase_kind,
      allowPromotionCodes: true,
      pricePrefix: priceId.slice(0, 12),
      hasUserId: Boolean(userId),
      hasAffiliateToken: Boolean(affiliateSessionToken),
    });

    // ── 13. Create Stripe Checkout Session ──
    const session = await stripe.checkout.sessions.create(sessionParams);

    return json({
      url: session.url,
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (err: any) {
    // Stripe-specific errors
    if (err.type?.startsWith("Stripe") || err.raw) {
      const stripeCode = err.code || err.raw?.code || "unknown";
      const stripeMessage =
        err.message ||
        err.raw?.message ||
        "Stripe checkout session creation failed";
      const stripeParam = err.param || err.raw?.param || null;

      let productKey = "unknown";
      let mode = "unknown";
      try {
        productKey = err._productKey || "unknown";
        mode = err._mode || "unknown";
      } catch (_) {
        // Best-effort cleanup only; failure is non-blocking.
      }

      console.error("[Checkout] Stripe error:", {
        stripeCode,
        stripeMessage,
        stripeParam,
      });

      return json(
        {
          code: "STRIPE_CHECKOUT_FAILED",
          error: "Stripe checkout session creation failed",
          stripeCode,
          stripeMessage,
          stripeParam,
          productKey,
          mode,
        },
        err.statusCode || 500
      );
    }

    // Stripe auth error (bad API key)
    if (
      err.raw?.statusCode === 401 ||
      err.statusCode === 401 ||
      err.type === "StripeAuthenticationError"
    ) {
      console.error("CRITICAL: Stripe API rejected the backend request!");
      return json(
        {
          code: "STRIPE_AUTH_ERROR",
          error: "Stripe API key invalid or missing permissions.",
        },
        500
      );
    }

    console.error("[Checkout] Internal error:", err);
    return json(
      { code: "INTERNAL_ERROR", error: "Internal server error." },
      500
    );
  }
});
