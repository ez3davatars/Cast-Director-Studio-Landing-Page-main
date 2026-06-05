// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // 1. Handle preflight OPTIONS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2. Require authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Missing authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // 3. Connect using service role key internally
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid authorization token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body for reason/customer_message
    const body = await req.json().catch(() => ({}));
    const reasonInput = body.reason || body.customer_message || "";
    const customerMessageInput = body.customer_message || body.reason || "";

    // 4. Find user's active hosted subscription
    const { data: activeSub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("*, product:products(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (subErr || !activeSub) {
      return new Response(
        JSON.stringify({ error: "no_subscription", message: "No active subscription found for this user." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const productKey = activeSub.product?.product_key || activeSub.product?.metadata?.product_key || "unknown";
    const isHosted =
      activeSub.product?.product_type === "subscription" ||
      activeSub.product?.product_type === "hosted" ||
      ["starter", "pro"].includes(productKey);

    if (!isHosted) {
      return new Response(
        JSON.stringify({ error: "ineligible_plan", message: "Your plan is not eligible for a Fit Guarantee refund." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Confirm subscription is within the 7-day guarantee window
    const createdTime = new Date(activeSub.created_at).getTime();
    const ageInMs = Date.now() - createdTime;
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const isWithinWindow = ageInMs <= sevenDaysInMs;

    if (!isWithinWindow) {
      return new Response(
        JSON.stringify({ error: "window_expired", message: "The 7-day Fit Guarantee window has expired for this subscription." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Reject if there is already a pending, approved, or refunded review
    const { data: existingReview, error: reviewCheckError } = await supabaseAdmin
      .from("refund_reviews")
      .select("id, status")
      .eq("stripe_subscription_id", activeSub.stripe_subscription_id)
      .in("status", ["pending", "approved", "refunded"])
      .maybeSingle();

    if (reviewCheckError) {
      console.error("[Refund] Error checking existing reviews:", reviewCheckError);
    }

    if (existingReview) {
      return new Response(
        JSON.stringify({ error: "already_exists", message: "A refund review is already in progress or completed for this subscription." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Calculate net hosted credits used during current subscription period
    const { data: txs, error: txError } = await supabaseAdmin
      .from("credit_transactions")
      .select("kind, amount")
      .eq("user_id", user.id)
      .gte("created_at", activeSub.current_period_start);

    if (txError) {
      console.error("[Refund] Error checking credit ledger:", txError);
      return new Response(
        JSON.stringify({ error: "ledger_error", message: "Failed to verify credit ledger." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let debited = 0;
    let refunded = 0;
    if (txs) {
      for (const tx of txs) {
        if (tx.kind === "GENERATION_DEBIT") {
          debited += Math.abs(tx.amount);
        } else if (tx.kind === "GENERATION_REFUND") {
          refunded += Math.abs(tx.amount);
        }
      }
    }
    const net_credits_used = Math.max(0, debited - refunded);

    // 8. Determine plan_price_cents and included_credits
    let plan_price_cents = 0;
    let included_credits = 0;

    if (productKey === "starter" || productKey === "starter_monthly") {
      plan_price_cents = 4900;
      included_credits = 600;
    } else if (productKey === "pro" || productKey === "pro_monthly") {
      plan_price_cents = 9900;
      included_credits = 1200;
    } else {
      // Robust DB fallbacks
      const { data: orderItem } = await supabaseAdmin
        .from("order_items")
        .select("*, order:orders!inner(*)")
        .eq("product_id", activeSub.product_id)
        .eq("orders.user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderItem) {
        plan_price_cents = Math.round((orderItem.amount || orderItem.total_price || 0) * 100);
      }

      const { data: renewalTx } = await supabaseAdmin
        .from("credit_transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("kind", "SUBSCRIPTION_RENEWAL")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (renewalTx) {
        included_credits = Math.abs(renewalTx.amount);
      }
    }

    if (plan_price_cents === 0) plan_price_cents = 4900; // default Starter price
    if (included_credits === 0) included_credits = 600; // default Starter credits

    // 9. Calculate financials and credit details
    const used_credit_cost_cents = Math.round(net_credits_used * (plan_price_cents / included_credits));
    const refundable_amount_cents = Math.max(0, plan_price_cents - used_credit_cost_cents);
    const remaining_credits_to_revoke = Math.max(0, included_credits - net_credits_used);

    // 10. Insert record into public.refund_reviews
    const { error: insertError } = await supabaseAdmin
      .from("refund_reviews")
      .insert([
        {
          user_id: user.id,
          stripe_customer_id: activeSub.stripe_customer_id,
          stripe_subscription_id: activeSub.stripe_subscription_id,
          plan_key: productKey,
          plan_price_cents,
          included_credits,
          credits_used: net_credits_used,
          used_credit_cost_cents,
          refundable_amount_cents,
          remaining_credits_to_revoke,
          status: "pending",
          reason: reasonInput,
          customer_message: customerMessageInput,
          request_source: "customer_portal",
        },
      ]);

    if (insertError) {
      console.error("[Refund] Error logging refund review request:", insertError);
      return new Response(
        JSON.stringify({ error: "insert_error", message: "Failed to record refund review request." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Return customer-safe JSON response
    return new Response(
      JSON.stringify({
        status: "pending",
        plan_key: productKey,
        credits_used: net_credits_used,
        used_credit_cost_cents,
        refundable_amount_cents,
        remaining_credits_to_revoke,
        message: "Your Fit Guarantee refund review request has been logged successfully.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Refund Fatal] Crash in request-refund-review:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: "An unexpected architecture fault occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
