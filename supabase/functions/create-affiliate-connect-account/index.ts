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

const getAuthenticatedAffiliate = async (req: Request) => {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return { error: json({ error: "Unauthorized" }, 401) };

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return { error: json({ error: "Unauthorized" }, 401) };

  const { data: affiliate, error: affiliateError } = await supabaseAdmin
    .from("affiliates")
    .select("id, user_id, contact_email, payout_method, stripe_connect_account_id, stripe_connect_onboarding_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (affiliateError) return { error: json({ error: affiliateError.message }, 500) };
  if (!affiliate) return { error: json({ error: "Affiliate account not found" }, 404) };

  return { supabaseAdmin, user, affiliate };
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await getAuthenticatedAffiliate(req);
    if (auth.error) return auth.error;

    const { supabaseAdmin, user, affiliate } = auth;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) return json({ error: "Stripe is not configured" }, 500);

    if (affiliate.stripe_connect_account_id) {
      return json({
        stripe_connect_account_id: affiliate.stripe_connect_account_id,
        stripe_connect_onboarding_status: affiliate.stripe_connect_onboarding_status || "created",
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email || affiliate.contact_email || undefined,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        affiliate_id: affiliate.id,
        user_id: user.id,
        source: "affiliate_dashboard",
      },
    });

    const requirementsDue = account.requirements?.currently_due || [];
    const onboardingStatus = account.details_submitted
      ? account.payouts_enabled && requirementsDue.length === 0 ? "ready" : "restricted"
      : "created";

    const { error: updateError } = await supabaseAdmin
      .from("affiliates")
      .update({
        payout_method: "stripe_connect",
        stripe_connect_account_id: account.id,
        stripe_connect_onboarding_status: onboardingStatus,
        stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
        stripe_connect_charges_enabled: Boolean(account.charges_enabled),
        stripe_connect_requirements_due: requirementsDue,
      })
      .eq("id", affiliate.id);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({
      stripe_connect_account_id: account.id,
      stripe_connect_onboarding_status: onboardingStatus,
      stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_connect_charges_enabled: Boolean(account.charges_enabled),
      stripe_connect_requirements_due: requirementsDue,
    });
  } catch (err) {
    console.error("[create-affiliate-connect-account] failed", err?.message || err);
    return json({ error: "Unable to create Stripe direct deposit account" }, 500);
  }
});
