// @ts-nocheck: Supabase Edge Function runtime provides Deno, Stripe, and Supabase types.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@^17.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getSiteUrl = () => {
  const siteUrl = Deno.env.get("SITE_URL")?.trim();
  return siteUrl ? siteUrl.replace(/\/+$/, "") : null;
};

const getStripeErrorDiagnostics = (err: any) => ({
  type: err?.type || null,
  code: err?.code || err?.raw?.code || null,
  message: err?.message || "Stripe request failed",
  requestId: err?.requestId || err?.raw?.requestId || err?.raw?.request_id || null,
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: affiliate, error: affiliateError } = await supabaseAdmin
      .from("affiliates")
      .select("id, stripe_connect_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (affiliateError) return json({ error: affiliateError.message }, 500);
    if (!affiliate) return json({ error: "Affiliate account not found" }, 404);
    if (!affiliate.stripe_connect_account_id) {
      return json({ error: "Direct deposit account has not been created yet" }, 400);
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) return json({ error: "Stripe is not configured" }, 500);

    const siteUrl = getSiteUrl();
    if (!siteUrl) {
      return json({
        error: "SITE_URL is required to create Stripe onboarding links",
      }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const accountLink = await stripe.accountLinks.create({
      account: affiliate.stripe_connect_account_id,
      return_url: `${siteUrl}/affiliate/payouts/return`,
      refresh_url: `${siteUrl}/affiliate/payouts/refresh`,
      type: "account_onboarding",
    });

    return json({ url: accountLink.url });
  } catch (err) {
    const stripeError = getStripeErrorDiagnostics(err);
    console.error("[create-affiliate-connect-onboarding-link] failed", stripeError);
    return json({
      error: "Unable to create Stripe onboarding link",
      stripe_error: stripeError,
    }, 500);
  }
});
