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

const resolveOnboardingStatus = (account: any, requirementsDue: string[]) => {
  if (account.payouts_enabled && requirementsDue.length === 0) return "ready";
  if (account.details_submitted) return requirementsDue.length > 0 ? "restricted" : "submitted";
  return "incomplete";
};

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
      return json({
        stripe_connect_onboarding_status: "not_started",
        stripe_connect_payouts_enabled: false,
        stripe_connect_charges_enabled: false,
        stripe_connect_requirements_due: [],
      });
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) return json({ error: "Stripe is not configured" }, 500);

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const account = await stripe.accounts.retrieve(affiliate.stripe_connect_account_id);
    const requirementsDue = account.requirements?.currently_due || [];
    const onboardingStatus = resolveOnboardingStatus(account, requirementsDue);

    const updates = {
      payout_method: "stripe_connect",
      stripe_connect_onboarding_status: onboardingStatus,
      stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_connect_charges_enabled: Boolean(account.charges_enabled),
      stripe_connect_requirements_due: requirementsDue,
    };

    const { error: updateError } = await supabaseAdmin
      .from("affiliates")
      .update(updates)
      .eq("id", affiliate.id);

    if (updateError) return json({ error: updateError.message }, 500);

    return json(updates);
  } catch (err) {
    console.error("[sync-affiliate-connect-account] failed", err?.message || err);
    return json({ error: "Unable to sync Stripe payout account status" }, 500);
  }
});
