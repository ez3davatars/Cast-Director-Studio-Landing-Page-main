// @ts-nocheck: Supabase Edge Function runtime provides Deno, Stripe, and Supabase types.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@^17.7.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const safeStripeObjectStatus = (object: any) => {
  if (object?.object === "transfer" && object?.reversed) return "reversed";
  return object?.status || object?.object || "updated";
};

const safeFailureMessage = (object: any) =>
  object?.failure_message || object?.failure_code || object?.status || null;

const verifyStripeEvent = async (body: string, signature: string) => {
  const secrets = [
    { name: "STRIPE_CONNECT_WEBHOOK_SECRET", value: Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") },
    { name: "STRIPE_PLATFORM_TRANSFER_WEBHOOK_SECRET", value: Deno.env.get("STRIPE_PLATFORM_TRANSFER_WEBHOOK_SECRET") },
  ].filter(secret => Boolean(secret.value));

  if (secrets.length === 0) {
    return {
      error: json({ error: "Stripe Connect webhook secrets are not configured" }, 500),
    };
  }

  const failures = [];
  for (const secret of secrets) {
    try {
      const event = await stripe.webhooks.constructEventAsync(body, signature, secret.value);
      return { event, secretName: secret.name };
    } catch (err) {
      failures.push({
        secretName: secret.name,
        message: err?.message || "signature verification failed",
      });
    }
  }

  console.error("[stripe-connect-webhook] signature verification failed", {
    attempted_secrets: failures.map(failure => failure.secretName),
    errors: failures.map(failure => failure.message),
  });

  return {
    error: json({ error: "Invalid Stripe signature" }, 400),
  };
};

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Missing Stripe signature" }, 400);

  const verified = await verifyStripeEvent(body, signature);
  if (verified.error) return verified.error;

  const event = verified.event;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const object = event.data?.object || {};
  const connectedAccountId = event.account || object.account || null;
  const objectId = object.id || null;

  const { error: insertError } = await supabaseAdmin
    .from("stripe_connect_webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      connected_account_id: connectedAccountId,
      object_id: objectId,
      payload: event,
    });

  if (insertError?.code === "23505") {
    return json({ received: true, duplicate: true });
  }

  if (insertError) {
    console.error("[stripe-connect-webhook] event insert failed", {
      event_id: event.id,
      event_type: event.type,
      error: insertError.message,
    });
    return json({ error: "Unable to store Stripe Connect webhook event" }, 500);
  }

  let processed = false;
  let errorMessage = null;

  try {
    if (["transfer.created", "transfer.updated", "transfer.reversed"].includes(event.type)) {
      const transferStatus = safeStripeObjectStatus(object);
      const updates: Record<string, unknown> = {
        stripe_transfer_status: transferStatus,
      };

      if (event.type === "transfer.reversed" || object.reversed === true) {
        updates.status = "failed";
        updates.payout_failure_code = "transfer_reversed";
        updates.payout_failure_message = safeFailureMessage(object) || "Stripe transfer was reversed";
      }

      const { error: updateError } = await supabaseAdmin
        .from("payout_items")
        .update(updates)
        .eq("stripe_transfer_id", object.id);

      if (updateError) throw updateError;
      processed = true;
    } else if (["payout.created", "payout.updated", "payout.paid", "payout.failed"].includes(event.type)) {
      const payoutItemId = object.metadata?.payout_item_id || null;
      if (payoutItemId) {
        const updates: Record<string, unknown> = {
          stripe_payout_id: object.id,
          stripe_payout_status: object.status || event.type.replace("payout.", ""),
          stripe_payout_arrival_date: object.arrival_date ? new Date(object.arrival_date * 1000).toISOString() : null,
        };

        if (event.type === "payout.paid") {
          updates.status = "paid";
          updates.paid_at = new Date().toISOString();
        }

        if (event.type === "payout.failed") {
          updates.status = "failed";
          updates.payout_failure_code = object.failure_code || "payout_failed";
          updates.payout_failure_message = safeFailureMessage(object) || "Stripe payout failed";
        }

        const { error: updateError } = await supabaseAdmin
          .from("payout_items")
          .update(updates)
          .eq("id", payoutItemId);

        if (updateError) throw updateError;
        processed = true;
      } else {
        processed = false;
        errorMessage = "Payout event stored without payout item metadata; admin review required.";
      }
    }
  } catch (err) {
    errorMessage = err?.message || "Webhook processing failed";
    console.error("[stripe-connect-webhook] processing failed", {
      event_id: event.id,
      event_type: event.type,
      object_id: objectId,
      connected_account_id: connectedAccountId,
      error: errorMessage,
    });
  }

  await supabaseAdmin
    .from("stripe_connect_webhook_events")
    .update({
      processed,
      error_message: errorMessage,
    })
    .eq("event_id", event.id);

  return json({ received: true, processed });
});
