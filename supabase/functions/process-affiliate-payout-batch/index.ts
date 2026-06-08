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

const stripeError = (err: any) => ({
  type: err?.type || err?.raw?.type || null,
  code: err?.code || err?.raw?.code || "stripe_error",
  message: err?.message || "Stripe transfer failed",
  requestId: err?.requestId || err?.raw?.requestId || err?.raw?.request_id || null,
});

const requireAdmin = async (req: Request) => {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return { error: json({ error: "Unauthorized" }, 401) };

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: json({ error: "Unauthorized" }, 401) };
  if (user.app_metadata?.is_admin !== true) return { error: json({ error: "Forbidden: admin only" }, 403) };

  return { supabaseAdmin, user };
};

const getAffiliate = (item: any) => Array.isArray(item.affiliates) ? item.affiliates[0] : item.affiliates;
const RETRYABLE_ITEM_STATUSES = ["pending", "failed", "processing"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { supabaseAdmin } = auth;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) return json({ error: "Stripe is not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const payoutBatchId = body.payout_batch_id;
    const payoutItemIds = Array.isArray(body.payout_item_ids) ? body.payout_item_ids.filter(Boolean) : null;
    if (!payoutBatchId) return json({ error: "payout_batch_id is required" }, 400);

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("payout_batches")
      .select("id, status")
      .eq("id", payoutBatchId)
      .maybeSingle();

    if (batchError) return json({ error: batchError.message }, 500);
    if (!batch) return json({ error: "Payout batch not found" }, 404);
    if (batch.status !== "approved") {
      return json({ error: "Payout batch must be approved before Stripe Connect transfers are sent" }, 400);
    }

    let itemsQuery = supabaseAdmin
      .from("payout_items")
      .select(`
        id,
        payout_batch_id,
        affiliate_id,
        amount_cents,
        status,
        stripe_transfer_id,
        affiliates(
          id,
          code,
          payout_method,
          stripe_connect_account_id,
          stripe_connect_payouts_enabled
        )
      `)
      .eq("payout_batch_id", payoutBatchId);

    if (payoutItemIds) itemsQuery = itemsQuery.in("id", payoutItemIds);

    const { data: items, error: itemsError } = await itemsQuery;
    if (itemsError) return json({ error: itemsError.message }, 500);

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const results = [];

    for (const item of items || []) {
      const affiliate = getAffiliate(item);
      const baseResult = {
        payout_item_id: item.id,
        affiliate_id: item.affiliate_id,
        affiliate_code: affiliate?.code || null,
      };

      if (item.stripe_transfer_id) {
        results.push({ ...baseResult, status: "already_transferred", stripe_transfer_id: item.stripe_transfer_id });
        continue;
      }

      if (!RETRYABLE_ITEM_STATUSES.includes(item.status)) {
        results.push({ ...baseResult, status: "skipped_not_retryable", item_status: item.status });
        continue;
      }

      if (affiliate?.payout_method !== "stripe_connect") {
        results.push({ ...baseResult, status: "skipped_manual" });
        continue;
      }

      if (!affiliate?.stripe_connect_account_id || affiliate?.stripe_connect_payouts_enabled !== true) {
        results.push({ ...baseResult, status: "skipped_not_ready" });
        continue;
      }

      if (!item.amount_cents || item.amount_cents <= 0) {
        await supabaseAdmin
          .from("payout_items")
          .update({
            status: "failed",
            payout_failure_code: "invalid_amount",
            payout_failure_message: "Payout amount must be greater than zero",
          })
          .eq("id", item.id);
        results.push({ ...baseResult, status: "failed", code: "invalid_amount" });
        continue;
      }

      const { data: claimedRows, error: claimError } = await supabaseAdmin
        .from("payout_items")
        .update({
          status: "processing",
          payout_failure_code: null,
          payout_failure_message: null,
        })
        .eq("id", item.id)
        .is("stripe_transfer_id", null)
        .in("status", RETRYABLE_ITEM_STATUSES)
        .select("id")
        .limit(1);

      if (claimError) {
        results.push({ ...baseResult, status: "failed", code: "claim_failed", message: claimError.message });
        continue;
      }

      if (!claimedRows || claimedRows.length === 0) {
        results.push({ ...baseResult, status: "skipped_concurrent_or_already_processed" });
        continue;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: item.amount_cents,
          currency: "usd",
          destination: affiliate.stripe_connect_account_id,
          metadata: {
            payout_batch_id: payoutBatchId,
            payout_item_id: item.id,
            affiliate_id: item.affiliate_id,
            affiliate_code: affiliate.code || "",
          },
        }, {
          idempotencyKey: `affiliate_payout_item_${item.id}`,
        });

        await supabaseAdmin
          .from("payout_items")
          .update({
            status: "transferred",
            payment_provider: "stripe",
            payment_method: "stripe_connect",
            payment_reference: transfer.id,
            stripe_transfer_id: transfer.id,
            stripe_transfer_status: transfer.status || "created",
            stripe_destination_account_id: affiliate.stripe_connect_account_id,
            stripe_transfer_created_at: new Date().toISOString(),
            payout_failure_code: null,
            payout_failure_message: null,
          })
          .eq("id", item.id);

        console.log("[process-affiliate-payout-batch] transfer created", {
          payout_batch_id: payoutBatchId,
          payout_item_id: item.id,
          affiliate_id: item.affiliate_id,
          stripe_transfer_id: transfer.id,
          destination_account_id: affiliate.stripe_connect_account_id,
        });

        results.push({ ...baseResult, status: "sent", stripe_transfer_id: transfer.id });
      } catch (err) {
        const safeError = stripeError(err);
        console.error("[process-affiliate-payout-batch] transfer failed", {
          payout_batch_id: payoutBatchId,
          payout_item_id: item.id,
          affiliate_id: item.affiliate_id,
          destination_account_id: affiliate.stripe_connect_account_id,
          stripe_error: safeError,
        });

        await supabaseAdmin
          .from("payout_items")
          .update({
            status: "failed",
            payout_failure_code: safeError.code,
            payout_failure_message: safeError.message,
          })
          .eq("id", item.id);

        results.push({ ...baseResult, status: "failed", code: safeError.code, message: safeError.message });
      }
    }

    const { data: batchItems } = await supabaseAdmin
      .from("payout_items")
      .select("status")
      .eq("payout_batch_id", payoutBatchId);

    const statuses = (batchItems || []).map((row: any) => row.status);
    if (statuses.length > 0 && statuses.every((status: string) => ["transferred", "paid"].includes(status))) {
      await supabaseAdmin.from("payout_batches").update({ status: "transferred" }).eq("id", payoutBatchId);
    } else if (statuses.length > 0 && statuses.every((status: string) => status === "failed")) {
      await supabaseAdmin.from("payout_batches").update({ status: "failed" }).eq("id", payoutBatchId);
    }

    return json({
      payout_batch_id: payoutBatchId,
      results,
    });
  } catch (err) {
    console.error("[process-affiliate-payout-batch] failed", err?.message || err);
    return json({ error: "Unable to process Stripe Connect payout batch" }, 500);
  }
});
