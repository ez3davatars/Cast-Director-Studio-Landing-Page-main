// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@^17.7.0";
import { MONTHLY_CREDITS, CREDIT_PACK_AMOUNTS } from "../_shared/creditCosts.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

function calculateCommissionHoldUntil(payoutHoldDays: number | null | undefined): Date {
  const holdDays = Math.max(0, Number(payoutHoldDays) || 0);
  const bufferMs = 60_000;

  return new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000 + bufferMs);
}

// ══════════════════════════════════════════════════════════════════════════════
// AFFILIATE ATTRIBUTION HELPERS
//
// DESIGN RULES (from CLAUDE.md + implementation spec):
//   - Runs AFTER all core fulfillment succeeds.
//   - Every error is caught and logged — never re-thrown.
//   - Attribution failure must never affect Stripe webhook response.
//   - No commission on taxes, refunds, failed payments, disputes, or
//     self-referrals.
//   - commission_ledger rows are append-only (immutable).
//   - Refunds create 'reversal' rows; they never modify 'earned' rows.
//   - Idempotency: UNIQUE index on (stripe_event_id) WHERE type='earned'
//     handles duplicate webhook delivery.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * processAffiliateAttribution
 *
 * Called after a successful checkout.session.completed OR invoice.paid
 * (recurring) fulfillment. Writes to referrals + commission_ledger.
 *
 * For checkout sessions  → reads affiliate_session_token from Stripe metadata,
 *                           looks up the click, creates a referral, records
 *                           the first 'earned' commission row.
 *
 * For recurring invoices → finds the existing active referral for the user,
 *                           checks commission_expires_at, records a renewal
 *                           'earned' commission row.
 */
async function processAffiliateAttribution(
  supabaseAdmin: any,
  dataObject: any,          // Stripe session or invoice object
  isCheckoutSession: boolean,
  isRecurringInvoice: boolean,
  stripeEventId: string,
  orderId: string,
  resolvedUserId: string | null,
  stripeInvoiceId: string | null
): Promise<void> {

  // ── Checkout session: first payment → create referral ──────────────────────
  if (isCheckoutSession) {
    const affiliateSessionToken: string | undefined =
      dataObject.metadata?.affiliate_session_token;

    if (!affiliateSessionToken) {
      console.log("[Affiliate] No affiliate_session_token in checkout metadata. Skipping.");
      return;
    }

    // No attribution for guest checkouts (no user to link the referral to)
    if (!resolvedUserId) {
      console.log("[Affiliate] Guest checkout — no user ID to attribute referral. Skipping.");
      return;
    }

    if (dataObject.payment_status && dataObject.payment_status !== "paid") {
      console.log(`[Affiliate] Checkout session ${dataObject.id} is not paid. Skipping.`);
      return;
    }

    // Idempotency specific to affiliate commissions. This also lets an already
    // fulfilled order safely retry attribution without creating a duplicate row.
    const { data: existingCommission } = await supabaseAdmin
      .from("commission_ledger")
      .select("id")
      .eq("stripe_event_id", stripeEventId)
      .eq("type", "earned")
      .maybeSingle();

    if (existingCommission) {
      console.log(`[Affiliate] Commission for event ${stripeEventId} already exists. Skipping.`);
      return;
    }

    // 1. Look up the click row by session token
    const { data: click, error: clickLookupErr } = await supabaseAdmin
      .from("affiliate_clicks")
      .select("id, affiliate_id, expires_at, converted")
      .eq("session_token", affiliateSessionToken)
      .maybeSingle();

    if (clickLookupErr || !click) {
      console.log("[Affiliate] Click not found for session token. Skipping attribution.");
      return;
    }

    // 2. Get affiliate — must still be active at time of conversion
    const { data: affiliate, error: affErr } = await supabaseAdmin
      .from("affiliates")
      .select("id, user_id, status, commission_rate, commission_duration_months, payout_hold_days")
      .eq("id", click.affiliate_id)
      .eq("status", "active")
      .maybeSingle();

    if (affErr || !affiliate) {
      console.log("[Affiliate] Affiliate not found or suspended at conversion time. Skipping.");
      return;
    }

    // 3. Self-referral guard
    if (affiliate.user_id === resolvedUserId) {
      console.log("[Affiliate] Self-referral detected. Skipping attribution.");
      return;
    }

    // 4. Find or create the single active referral for this referred user.
    //    A converted click is allowed to keep earning later one-time checkouts
    //    through the existing referral while the commission period is active.
    const now = new Date();
    const clickExpired = new Date(click.expires_at) <= now;

    let referral: any = null;
    const { data: activeReferral, error: referralLookupErr } = await supabaseAdmin
      .from("referrals")
      .select("id, affiliate_id, commission_expires_at")
      .eq("referred_user_id", resolvedUserId)
      .eq("status", "active")
      .maybeSingle();

    if (referralLookupErr) {
      console.warn("[Affiliate] Failed to look up active referral (non-fatal):", referralLookupErr);
    }

    if (activeReferral?.affiliate_id === affiliate.id) {
      referral = activeReferral;
      if (new Date(referral.commission_expires_at) <= now) {
        console.log(`[Affiliate] Referral ${referral.id} commission period expired. Skipping.`);
        return;
      }
    } else if (activeReferral) {
      if (clickExpired) {
        console.log("[Affiliate] Different active referral exists and click attribution window expired. Skipping.");
        return;
      }

      const { error: voidErr } = await supabaseAdmin
        .from("referrals")
        .update({ status: "voided", updated_at: now.toISOString() })
        .eq("id", activeReferral.id);

      if (voidErr) {
        console.warn("[Affiliate] Failed to void prior active referral (non-fatal):", voidErr);
      }
    }

    if (!referral) {
      if (clickExpired) {
        console.log(`[Affiliate] Click ${click.id} attribution window expired and no reusable referral exists. Skipping.`);
        return;
      }

      const commissionExpiresAt = new Date(now);
      commissionExpiresAt.setMonth(
        commissionExpiresAt.getMonth() + affiliate.commission_duration_months
      );

      const { data: newReferral, error: referralErr } = await supabaseAdmin
        .from("referrals")
        .insert([{
          affiliate_id:          affiliate.id,
          click_id:              click.id,
          referred_user_id:      resolvedUserId,
          stripe_customer_id:    dataObject.customer ?? null,
          stripe_session_id:     dataObject.id ?? null,
          order_id:              orderId,
          attributed_at:         now.toISOString(),
          commission_expires_at: commissionExpiresAt.toISOString(),
          status:                "active",
        }])
        .select("id, affiliate_id, commission_expires_at")
        .single();

      if (referralErr || !newReferral) {
        if (referralErr?.code === "23505") {
          const { data: retryReferral } = await supabaseAdmin
            .from("referrals")
            .select("id, affiliate_id, commission_expires_at")
            .eq("referred_user_id", resolvedUserId)
            .eq("status", "active")
            .maybeSingle();

          if (retryReferral?.affiliate_id === affiliate.id) {
            referral = retryReferral;
          }
        }

        if (!referral) {
          console.error("[Affiliate] Failed to insert or reuse referral:", referralErr);
          return;
        }
      } else {
        referral = newReferral;
      }
    }

    // 5. Commission amount — exclude taxes (CLAUDE.md: no commission on taxes)
    //    amount_total is in cents (Stripe). total_details.amount_tax is also cents.
    const amountTotalCents: number = dataObject.amount_total ?? 0;
    const taxCents: number         = dataObject.total_details?.amount_tax ?? 0;
    const commissionBaseCents      = Math.max(0, amountTotalCents - taxCents);
    const commissionCents          = Math.floor(commissionBaseCents * Number(affiliate.commission_rate));

    if (commissionCents <= 0) {
      console.log("[Affiliate] Computed commission is zero (zero-amount or fully-taxed order). Skipping.");
      return;
    }

    // 6. Compute payout hold with a safety buffer so hold_until is always
    //    after the database-created commission_ledger.created_at timestamp.
    const holdUntil = calculateCommissionHoldUntil(affiliate.payout_hold_days);

    // 7. Insert commission_ledger 'earned' row (append-only, immutable)
    const { error: ledgerErr } = await supabaseAdmin
      .from("commission_ledger")
      .insert([{
        affiliate_id:             affiliate.id,
        referral_id:              referral.id,
        order_id:                 orderId,
        stripe_event_id:          stripeEventId,
        stripe_payment_intent_id: dataObject.payment_intent ?? null,
        type:                     "earned",
        amount_cents:             commissionCents,
        currency:                 (dataObject.currency ?? "usd").toLowerCase(),
        hold_until:               holdUntil.toISOString(),
      }]);

    if (ledgerErr) {
      if (ledgerErr.code === "23505") {
        // UNIQUE violation on stripe_event_id — already recorded
        console.log(`[Affiliate] Commission for event ${stripeEventId} already exists. Skipping.`);
        return;
      }
      console.error("[Affiliate] Failed to insert commission_ledger row:", ledgerErr);
      // Referral was created but commission row failed. Admin can manually correct.
      return;
    }

    // 8. Mark the original click as converted once. Later one-time purchases
    //    can keep earning via the referral without rewriting conversion history.
    if (!click.converted) {
      await supabaseAdmin
        .from("affiliate_clicks")
        .update({
          converted:          true,
          converted_at:       now.toISOString(),
          attributed_user_id: resolvedUserId,
        })
        .eq("id", click.id);
    }

    console.log(
      `[Affiliate] Attribution complete. ` +
      `Affiliate: ${affiliate.id}, User: ${resolvedUserId}, ` +
      `Referral: ${referral.id}, Commission: ${commissionCents} cents, ` +
      `Hold until: ${holdUntil.toISOString()}`
    );
    return;
  }

  // ── Recurring invoice: renewal payment → add commission row ────────────────
  if (isRecurringInvoice) {
    if (!resolvedUserId) {
      console.log("[Affiliate] Recurring invoice: no resolved user. Skipping.");
      return;
    }

    // 1. Find the active referral for this user
    const { data: referral, error: referralLookupErr } = await supabaseAdmin
      .from("referrals")
      .select("id, affiliate_id, commission_expires_at")
      .eq("referred_user_id", resolvedUserId)
      .eq("status", "active")
      .maybeSingle();

    if (referralLookupErr || !referral) {
      console.log("[Affiliate] Recurring invoice: no active referral for user. Skipping.");
      return;
    }

    // 2. Check commission window not expired
    if (new Date(referral.commission_expires_at) <= new Date()) {
      console.log("[Affiliate] Recurring invoice: commission window expired. Skipping.");
      return;
    }

    // 3. Get affiliate — must still be active
    const { data: affiliate, error: affErr } = await supabaseAdmin
      .from("affiliates")
      .select("id, commission_rate, payout_hold_days")
      .eq("id", referral.affiliate_id)
      .eq("status", "active")
      .maybeSingle();

    if (affErr || !affiliate) {
      console.log("[Affiliate] Recurring invoice: affiliate suspended or deleted. Skipping.");
      return;
    }

    // 4. Commission amount (exclude tax — CLAUDE.md: no commission on taxes)
    //    Prefer total_tax_amounts (array of { amount, taxable_amount, tax_rate })
    //    over the legacy scalar `tax` field. Both are cents. Falls back safely
    //    to zero if neither field is present.
    const amountPaidCents: number = dataObject.amount_paid ?? 0;
    let taxCents = 0;
    if (Array.isArray(dataObject.total_tax_amounts) && dataObject.total_tax_amounts.length > 0) {
        taxCents = dataObject.total_tax_amounts.reduce(
            (sum: number, entry: any) => sum + (Number(entry.amount) || 0), 0
        );
    } else if (typeof dataObject.tax === "number" && dataObject.tax > 0) {
        taxCents = dataObject.tax;
    }
    const commissionBaseCents     = Math.max(0, amountPaidCents - taxCents);
    const commissionCents         = Math.floor(commissionBaseCents * Number(affiliate.commission_rate));

    if (commissionCents <= 0) {
      console.log("[Affiliate] Recurring invoice: commission is zero. Skipping.");
      return;
    }

    const holdUntil = calculateCommissionHoldUntil(affiliate.payout_hold_days);

    // 5. Insert commission_ledger earned row
    //    UNIQUE (stripe_event_id) WHERE type='earned' handles webhook replay
    const { error: ledgerErr } = await supabaseAdmin
      .from("commission_ledger")
      .insert([{
        affiliate_id:     affiliate.id,
        referral_id:      referral.id,
        order_id:         orderId,
        stripe_event_id:  stripeEventId,
        stripe_invoice_id: stripeInvoiceId,
        type:             "earned",
        amount_cents:     commissionCents,
        currency:         (dataObject.currency ?? "usd").toLowerCase(),
        hold_until:       holdUntil.toISOString(),
      }]);

    if (ledgerErr) {
      if (ledgerErr.code === "23505") {
        console.log(`[Affiliate] Renewal commission for event ${stripeEventId} already exists. Skipping.`);
        return;
      }
      console.error("[Affiliate] Failed to record renewal commission:", ledgerErr);
      return;
    }

    console.log(
      `[Affiliate] Renewal commission recorded. ` +
      `Affiliate: ${affiliate.id}, Invoice: ${stripeInvoiceId}, ` +
      `Amount: ${commissionCents} cents`
    );
  }
}

/**
 * processAffiliateReversal
 *
 * Called after a successful full refund (charge.refunded).
 * Inserts a 'reversal' row in commission_ledger equal to the
 * original 'earned' amount. Never modifies the 'earned' row.
 *
 * Partial refunds are NOT reversed here — the existing webhook
 * code flags them for manual admin review and returns early,
 * so this function is not reachable from partial-refund events.
 */
async function processAffiliateReversal(
  supabaseAdmin: any,
  stripeEventId: string,
  orderId: string
): Promise<void> {
  // 1. Find the referral linked to this order
  const { data: referral, error: referralErr } = await supabaseAdmin
    .from("referrals")
    .select("id, affiliate_id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (referralErr || !referral) {
    console.log(`[Affiliate] No referral found for order ${orderId}. No reversal needed.`);
    return;
  }

  // 2. Find the original 'earned' commission row for this order
  const { data: earnedRow, error: earnedErr } = await supabaseAdmin
    .from("commission_ledger")
    .select("id, amount_cents, currency, affiliate_id")
    .eq("referral_id", referral.id)
    .eq("order_id", orderId)
    .eq("type", "earned")
    .maybeSingle();

  if (earnedErr || !earnedRow) {
    console.log(`[Affiliate] No earned commission found for referral ${referral.id}. No reversal needed.`);
    return;
  }

  // 3. Get payout_hold_days for hold_until
  const { data: affiliate } = await supabaseAdmin
    .from("affiliates")
    .select("payout_hold_days")
    .eq("id", referral.affiliate_id)
    .maybeSingle();

  const holdDays = affiliate?.payout_hold_days ?? 30;
  const now = new Date();
  const holdUntil = new Date(now);
  holdUntil.setDate(holdUntil.getDate() + holdDays);

  // 4. Insert reversal row (immutable ledger — never touch the earned row)
  //    stripe_event_id uniqueness is not enforced on reversals, but the
  //    event-level stripe_webhooks table already prevents duplicate events.
  const { error: reversalErr } = await supabaseAdmin
    .from("commission_ledger")
    .insert([{
      affiliate_id:    referral.affiliate_id,
      referral_id:     referral.id,
      order_id:        orderId,
      stripe_event_id: stripeEventId,
      type:            "reversal",
      amount_cents:    earnedRow.amount_cents,
      currency:        earnedRow.currency,
      hold_until:      holdUntil.toISOString(),
    }]);

  if (reversalErr) {
    if (reversalErr.code === "23505") {
      // UNIQUE violation on commission_ledger_one_reversal_per_order_uidx —
      // a reversal for this order already exists. This is idempotent: the
      // stripe_webhooks table already deduped the event, but if something
      // replayed this code path we log and move on rather than error.
      console.log(`[Affiliate] Reversal for order ${orderId} already recorded (idempotent). Skipping.`);
      return;
    }
    console.error("[Affiliate] Failed to insert commission reversal row:", reversalErr);
    return;
  }

  console.log(
    `[Affiliate] Commission reversal recorded. ` +
    `Referral: ${referral.id}, Amount: ${earnedRow.amount_cents} cents`
  );
}

serve(async (req: Request) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  
  if (!signature || !webhookSecret) {
    console.error("Missing Stripe signature or webhook secret");
    return new Response("Webhook secret misconfigured.", { status: 400 });
  }

  let event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed.`, err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Only process these exact payment events
  const allowedEvents = [
    'checkout.session.completed', 
    'invoice.paid',
    'customer.subscription.deleted',
    'customer.subscription.updated',
    'charge.refunded',
    'charge.refund.updated'
  ];
  if (!allowedEvents.includes(event.type)) {
      return new Response("Event type safely ignored.", { status: 200 });
  }

  const isSession = event.type === 'checkout.session.completed';
  const isInvoice = event.type === 'invoice.paid';
  const isRefund = event.type === 'charge.refunded' || event.type === 'charge.refund.updated';
  const isSubChange = event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated';
  
  const dataObject = event.data.object;
  const isRecurringInvoice = isInvoice && dataObject.billing_reason === 'subscription_cycle';

  // Completely drop non-recurring invoices early (e.g., the invoice created alongside the initial checkout, or ad-hoc updates)
  if (isInvoice && !isRecurringInvoice) {
      console.log(`[Routing] Ignored non-recurring invoice: ${dataObject.billing_reason}`);
      return new Response("Ignored non-recurring invoice", { status: 200 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 1. EVENT-LEVEL IDEMPOTENCY
  const { error: eventInsertError } = await supabaseAdmin.from('stripe_webhooks').insert([{ 
      event_id: event.id,
      event_type: event.type,
      payload: event
  }]);
  if (eventInsertError) {
      if (eventInsertError.code === '23505' || eventInsertError.message.includes('duplicate')) {
          console.log(`[Idempotency] Event ${event.id} already processed. Dropping duplicate.`);
          if (isSession || isRecurringInvoice) {
              try {
                  const stripeSessionId = isSession ? dataObject.id : null;
                  const stripeInvoiceId = isInvoice ? dataObject.id : null;
                  const { data: existingOrder } = await supabaseAdmin
                      .from('orders')
                      .select('id, user_id')
                      .or(isSession ? `stripe_session_id.eq.${stripeSessionId}` : `stripe_invoice_id.eq.${stripeInvoiceId}`)
                      .maybeSingle();

                  if (existingOrder) {
                      const fallbackUserId =
                          existingOrder.user_id ||
                          dataObject.client_reference_id ||
                          dataObject.metadata?.user_id ||
                          dataObject.subscription_details?.metadata?.user_id ||
                          null;

                      await processAffiliateAttribution(
                          supabaseAdmin,
                          dataObject,
                          isSession,
                          isRecurringInvoice,
                          event.id,
                          existingOrder.id,
                          fallbackUserId,
                          stripeInvoiceId
                      );
                  }
              } catch (affErr) {
                  console.error("[Affiliate] Duplicate-event attribution retry failed (non-fatal):", affErr);
              }
          }
          return new Response("Duplicate event ignored", { status: 200 });
      }
      console.error(`[Error] Failed to log event ${event.id}:`, eventInsertError);
      return new Response(`Internal tracking error: ${eventInsertError.message} (Code: ${eventInsertError.code})`, { status: 500 });
  }

  try {
      if (isRefund) {
          const charge = dataObject;
          const isFullRefund = charge.refunded && charge.amount_refunded === charge.amount;
          const paymentIntentId = charge.payment_intent;
          const invoiceId       = charge.invoice;   // Present on subscription renewal charges

          if (!paymentIntentId && !invoiceId) {
              return new Response("No payment or invoice reference on charge", { status: 200 });
          }

          // ── Order resolution: invoice-first for recurring subscription refunds ──
          //
          // Strategy 1 — direct invoice match (subscription renewals).
          //   Renewal invoices are NOT associated with a checkout session, so the
          //   original code's PI → session lookup always missed them.
          //
          // Strategy 2 — payment_intent → checkout session (one-time purchases
          //   and initial subscription checkouts).
          let order: any = null;

          if (invoiceId) {
              const { data: invoiceOrder } = await supabaseAdmin
                  .from('orders')
                  .select('id, user_id')
                  .eq('stripe_invoice_id', invoiceId)
                  .maybeSingle();
              if (invoiceOrder) order = invoiceOrder;
          }

          if (!order && paymentIntentId) {
              const sessions = await stripe.checkout.sessions.list({
                  payment_intent: paymentIntentId as string
              });
              if (sessions.data.length > 0) {
                  const stripeSessionId = sessions.data[0].id;
                  const { data: sessionOrder } = await supabaseAdmin
                      .from('orders')
                      .select('id, user_id')
                      .eq('stripe_session_id', stripeSessionId)
                      .maybeSingle();
                  if (sessionOrder) order = sessionOrder;
              }
          }

          if (!order) return new Response("No order found for refund", { status: 200 });

          if (!isFullRefund) {
              await supabaseAdmin.from('entitlement_events').insert([{
                  entity_type: 'order',
                  entity_id: order.id,
                  user_id: order.user_id,
                  event_type: 'partial_refund_flag',
                  review_required: true,
                  stripe_event_id: event.id,
                  reason: 'Partial refund detected via webhook'
              }]);
              return new Response("Partial refund flagged", { status: 200 });
          }

          const { data: licenses } = await supabaseAdmin.from('licenses').select('id, status, user_id').eq('order_id', order.id);
          if (licenses && licenses.length > 0) {
              for (const lic of licenses) {
                  if (lic.status !== 'refunded') {
                      await supabaseAdmin.from('licenses').update({ status: 'refunded', updated_at: new Date().toISOString() }).eq('id', lic.id);
                      await supabaseAdmin.from('entitlement_events').insert([{
                          entity_type: 'license',
                          entity_id: lic.id,
                          user_id: lic.user_id,
                          event_type: 'auto_refund',
                          previous_status: lic.status,
                          new_status: 'refunded',
                          reason: 'Automated Stripe Full Refund',
                          stripe_event_id: event.id
                      }]);
                  }
              }
          }

          // ── Affiliate commission reversal (non-fatal) ──
          // Runs after all license revocations complete.
          // Appends a 'reversal' row to commission_ledger equal to the original
          // 'earned' amount. Never modifies or deletes the original row.
          // Partial refunds are flagged for manual review above and return early,
          // so this block is only reached on full refunds.
          try {
              await processAffiliateReversal(supabaseAdmin, event.id, order.id);
          } catch (affErr) {
              console.error("[Affiliate] Commission reversal error (non-fatal):", affErr);
          }

          return new Response("Refund processed", { status: 200 });
      }
      
      if (isSubChange) {
          const sub = dataObject;
          const status = sub.status;
          const { data: dbSub } = await supabaseAdmin.from('subscriptions').select('id, status, user_id').eq('stripe_subscription_id', sub.id).maybeSingle();
          if (dbSub && dbSub.status !== status) {
              await supabaseAdmin.from('subscriptions').update({ status: status }).eq('id', dbSub.id);
              await supabaseAdmin.from('entitlement_events').insert([{
                  entity_type: 'subscription',
                  entity_id: dbSub.id,
                  user_id: dbSub.user_id,
                  event_type: 'stripe_subscription_update',
                  previous_status: dbSub.status,
                  new_status: status,
                  stripe_event_id: event.id,
                  reason: 'Stripe webhook update'
              }]);
          }
          return new Response("Subscription updated", { status: 200 });
      }

      const stripeSessionId = isSession ? dataObject.id : null; 
      const stripeInvoiceId = isInvoice ? dataObject.id : null;
      const fulfillmentEntityId = isSession ? stripeSessionId : stripeInvoiceId;
      
      // 2. FULFILLMENT-LEVEL IDEMPOTENCY
      const { data: existingOrder } = await supabaseAdmin.from('orders')
          .select('id')
          .or(isSession ? `stripe_session_id.eq.${stripeSessionId}` : `stripe_invoice_id.eq.${stripeInvoiceId}`)
          .maybeSingle();
          
      if (existingOrder) {
          console.log(`[Idempotency] Entity ${fulfillmentEntityId} already fulfilled into Order ${existingOrder.id}.`);
          return new Response("Fulfillment duplicate ignored", { status: 200 });
      }

      // 3. PRODUCT CATALOG RESOLUTION (GATED EARLY)
      let priceId = null;
      const amountPaid = dataObject.amount_total || dataObject.amount_paid || 0;
      const currency = dataObject.currency || 'usd';

      if (isSession) {
          const lineItems = await stripe.checkout.sessions.listLineItems(stripeSessionId);
          if (lineItems.data.length > 0) priceId = lineItems.data[0].price.id;
      } else if (isInvoice) {
          if (dataObject.lines?.data?.length > 0) priceId = dataObject.lines.data[0].price.id;
      }

      if (!priceId) {
          console.log(`[Skip] No price ID found. Assuming non-product event.`);
          return new Response("No price resolved", { status: 200 });
      }

      const { data: product } = await supabaseAdmin.from('products').select('*').eq('stripe_price_id', priceId).maybeSingle();
      if (!product) {
          console.error(`[Fatal] Received payment for unmapped Stripe Price ID: ${priceId}`);
          return new Response("Product mapping failed", { status: 400 });
      }

      const productKey = product.product_key || product.metadata?.product_key || "unknown";
      const productType = (product.product_type || product.metadata?.product_type || "").toLowerCase();
      const productFamily = productKey.toLowerCase().includes('indie') ? 'indie' : 
                            (productKey.toLowerCase().includes('agency') ? 'agency' : 'standard');

      // 4. AUTHORITATIVE ROUTING GATE (BEFORE SIDE EFFECTS)
      let isAuthoritative = false;
      let fulfillmentAction = '';

      if (productType === 'desktop_license' || productType === 'byok') {
          if (isSession) {
              isAuthoritative = true;
              fulfillmentAction = 'mint_byok_license';
          }
      } 
      else if (productType === 'subscription' || productType === 'hosted') {
          if (isSession) {
              isAuthoritative = true;
              fulfillmentAction = 'mint_hosted_subscription_initial';
          } else if (isRecurringInvoice) {
              isAuthoritative = true;
              fulfillmentAction = 'renew_hosted_subscription';
          }
      }
      else if (productType === 'support_plan' || productType === 'renewal') {
          if (isSession) {
              // Session implies this is the INITIAL payment block (either one-time or start of subscription)
              isAuthoritative = true;
              fulfillmentAction = 'mint_renewal_extension_initial';
          } else if (isRecurringInvoice) {
              isAuthoritative = true;
              fulfillmentAction = 'renew_renewal_extension_recurring';
          }
      }
      else if (productType === 'credit_topup') {
          if (isSession) {
              isAuthoritative = true;
              fulfillmentAction = 'credit_topup';
          }
      }

      if (!isAuthoritative) {
          console.log(`[Gate] Ignored ${event.type} for ${productType}. Event is not authoritative for this product mapping.`);
          return new Response("Ignored unhandled event configuration", { status: 200 });
      }

      // 5. IDENTITY RESOLUTION 
      let userId = dataObject.client_reference_id;
      if (!userId && dataObject.metadata?.user_id) userId = dataObject.metadata.user_id;
      if (!userId && dataObject.subscription_details?.metadata?.user_id) userId = dataObject.subscription_details.metadata.user_id;

      const customerEmail = dataObject.customer_details?.email || dataObject.customer_email;
      let contactId = null;

      if (customerEmail) {
          const { data: contact } = await supabaseAdmin.from('crm_contacts').select('id, user_id').eq('email', customerEmail.toLowerCase()).maybeSingle();
          if (contact) {
              contactId = contact.id;
              if (!userId && contact.user_id) userId = contact.user_id; // Safe guest-to-user fallback
          } else {
              // Auto-upsert so emails succeed
              const { data: newContact, error: contactInsertErr } = await supabaseAdmin.from('crm_contacts')
                 .insert([{ email: customerEmail.toLowerCase(), user_id: userId }])
                 .select('id').single();
              if (!contactInsertErr && newContact) contactId = newContact.id;
              else console.warn("[Email Fallback Warning] Failed to securely auto-upsert contact for email:", customerEmail);
          }
      }

      if (!userId && !customerEmail) {
          console.error(`[Fatal] Unresolvable identity for session: ${fulfillmentEntityId}`);
          return new Response("Unresolvable Identity", { status: 400 });
      }

      console.log(`[Fulfillment] Identity: ${userId || customerEmail} | Product: ${product.name} [Type: ${productType}] | Action: ${fulfillmentAction}`);

      // 6. CORE ORDER RECORDING (Safe to create now)
      const orderPayload: any = {
          user_id: userId,
          customer_email: customerEmail,
          total_amount: amountPaid / 100, 
          currency: currency,
          payment_status: 'paid',
          fulfillment_status: 'fulfilled',
          is_test_mode: !event.livemode
      };
      
      if (isSession) orderPayload.stripe_session_id = stripeSessionId;
      if (isInvoice) orderPayload.stripe_invoice_id = stripeInvoiceId;

      const { data: newOrder, error: orderErr } = await supabaseAdmin.from('orders').insert([orderPayload]).select().single();

      if (orderErr || !newOrder) {
          console.error(`[Fatal] Failed to mint Master Order:`, orderErr);
          throw new Error("Order generation failed");
      }

      const { data: newOrderItem, error: itemErr } = await supabaseAdmin.from('order_items').insert([{
          order_id: newOrder.id,
          product_id: product.id,
          stripe_price_id: priceId,
          product_name: product.name,
          product_sku: product.sku || "UNKNOWN",
          quantity: 1,
          unit_price: amountPaid / 100,
          total_price: amountPaid / 100
      }]).select().single();

      if (itemErr) {
          console.error(`[Warning] Order Item failed for Order ${newOrder.id}`, itemErr);
          await supabaseAdmin.from('stripe_webhooks').update({ error_message: `OrderItem Error: ${itemErr.message}` }).eq('event_id', event.id);
          throw new Error(`Order Item generation failed: ${itemErr.message}`);
      }

      let emailAction = null;
      let emailEntityId = newOrder.id;

      // ============================================
      // FULFILLMENT: BYOK DESKTOP LICENSE
      // ============================================
      if (fulfillmentAction === 'mint_byok_license') {
          const now = new Date();
          const pDefaultSupport = product.metadata?.support_days || 365;
          const updatesExpires = new Date(now.getTime() + pDefaultSupport * 24 * 60 * 60 * 1000);
          
          const newLicenseKey = `CDS_LIC_${crypto.randomUUID().toUpperCase().replace(/-/g, '')}`;

          const { data: _newLicense, error: licErr } = await supabaseAdmin.from('licenses').insert([{
              user_id: userId,
              order_id: newOrder.id,
              order_item_id: newOrderItem?.id,
              product_id: product.id,
              stripe_price_id: priceId,
              license_name: product.name,
              license_key: newLicenseKey,
              license_type: 'perpetual',
              status: 'active',
              max_activations: (productKey === 'agency_desktop_byok' || product.name.toLowerCase().includes('agency')) ? 3 : 1,
              device_limit: (productKey === 'agency_commercial_byok' || productKey === 'agency_desktop_byok' || product.name.toLowerCase().includes('agency')) ? 5 : 2,
              updates_expires_at: updatesExpires.toISOString(),
              support_expires_at: updatesExpires.toISOString(),
          }]).select().single();

          if (licErr) {
              console.error(`[Fatal] Failed to mint License:`, licErr);
              throw new Error("License Minting Failed");
          }

          try {
              const { data: latestInstaller, error: instErr } = await supabaseAdmin
                  .from('installers')
                  .select('*')
                  .eq('entitlement_scope', 'desktop_app_access')
                  .eq('platform', 'windows')
                  .eq('is_active', true)
                  .eq('is_stable', true)
                  .order('released_at', { ascending: false, nullsFirst: false })
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

              if (instErr) {
                  console.error(`[Webhook] Error querying installers table:`, instErr);
              }

              if (!latestInstaller) {
                  console.warn(`[Webhook] No active installer found; download entitlement not created`);
              } else {
                  // Duplicate protection
                  const { data: existingDl } = await supabaseAdmin
                      .from('downloads')
                      .select('id')
                      .eq('order_id', newOrder.id)
                      .eq('installer_id', latestInstaller.id)
                      .maybeSingle();

                  if (!existingDl) {
                      const downloadId = crypto.randomUUID();
                      const downloadToken = "dl_" + crypto.randomUUID().replace(/-/g, '');
                      const { error: dlErr } = await supabaseAdmin.from('downloads').insert([{
                          id: downloadId,
                          user_id: userId,
                          order_id: newOrder.id,
                          order_item_id: newOrderItem?.id,
                          product_id: product.id,
                          stripe_price_id: priceId,
                          installer_id: latestInstaller.id,
                          display_name: "Cast Director Studio Windows Installer",
                          platform: latestInstaller.platform,
                          version: latestInstaller.version,
                          file_type: "installer",
                          download_url: latestInstaller.file_url,
                          customer_email: customerEmail,
                          download_token: downloadToken,
                          expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                          download_count: 0,
                          max_downloads: 10
                      }]);

                      if (dlErr) console.error(`[Warning] Failed to mint Download Installer:`, dlErr);
                  }
              }
          } catch (dlCatchErr) {
              console.error(`[Webhook] Unexpected error creating download entitlement:`, dlCatchErr);
          }

          emailAction = 'license_download_details';
      }

      // ============================================
      // FULFILLMENT: HOSTED PLANS (Subscriptions)
      // ============================================
      else if (fulfillmentAction === 'mint_hosted_subscription_initial' || fulfillmentAction === 'renew_hosted_subscription') {
          const stripeSubscriptionId = dataObject.subscription || `sub_fake_${Date.now()}`;
          
          let periodStartIso = new Date().toISOString();
          let periodEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          try {
              if (dataObject.subscription) {
                  const stripeSub = await stripe.subscriptions.retrieve(dataObject.subscription);
                  if (stripeSub && stripeSub.current_period_end) {
                      periodEndIso = new Date(stripeSub.current_period_end * 1000).toISOString();
                      periodStartIso = new Date(stripeSub.current_period_start * 1000).toISOString();
                  }
              }
          } catch(se) {
              console.warn("[Stripe Source Warning] Failed to fetch true period. Falling back to +30 days.", se);
          }
          
          const { error: subErr } = await supabaseAdmin.from('subscriptions').upsert([{
              user_id: userId,
              product_id: product.id,
              stripe_customer_id: dataObject.customer,
              stripe_subscription_id: stripeSubscriptionId,
              status: 'active',
              current_period_start: periodStartIso,
              current_period_end: periodEndIso,
              metadata: { stripe_price_id: priceId }
          }], { onConflict: 'stripe_subscription_id' });

          if (subErr) {
              console.error(`[Fatal] Failed to record Subscription tracker:`, subErr);
              await supabaseAdmin.from('stripe_webhooks').update({ error_message: `Subscription Error: ${subErr.message}` }).eq('event_id', event.id);
              throw new Error(`Subscription tracking failed: ${subErr.message}`);
          }

          // ── Monthly credit replenishment (additive — does NOT wipe purchased top-ups) ──
          if (userId) {
              const monthlyCredits = product.metadata?.monthly_credits
                  ? parseInt(product.metadata.monthly_credits, 10)
                  : (MONTHLY_CREDITS[productKey] || 0);

              if (monthlyCredits > 0) {
                  const { data: profileBefore } = await supabaseAdmin
                      .from('profiles')
                      .select('credit_balance')
                      .eq('id', userId)
                      .single();

                  const balanceBefore = profileBefore?.credit_balance ?? 0;

                  const { error: creditErr } = await supabaseAdmin
                      .from('profiles')
                      .upsert([{ id: userId, credit_balance: balanceBefore + monthlyCredits }]);

                  if (creditErr) {
                      console.error(`[Warning] Failed to replenish ${monthlyCredits} monthly credits for user ${userId}:`, creditErr);
                  } else {
                      // Ledger entry
                      await supabaseAdmin.from('credit_transactions').insert([{
                          user_id: userId,
                          kind: 'SUBSCRIPTION_RENEWAL',
                          amount: monthlyCredits,
                          balance_before: balanceBefore,
                          balance_after: balanceBefore + monthlyCredits,
                          reason: 'Monthly subscription credit replenishment',
                          metadata: {
                              product_key: productKey,
                              stripe_price_id: priceId,
                              stripe_subscription_id: stripeSubscriptionId,
                              fulfillment_action: fulfillmentAction,
                          }
                      }]);
                      console.log(`[Credits] Replenished ${monthlyCredits} credits for user ${userId} (${productKey}). Balance: ${balanceBefore} → ${balanceBefore + monthlyCredits}`);
                  }
              }
          }

          emailAction = 'subscription_confirmation'; 
          emailEntityId = stripeSubscriptionId;
      }

      // ============================================
      // FULFILLMENT: RENEWALS & UPDATES
      // ============================================
      else if (fulfillmentAction === 'mint_renewal_extension_initial' || fulfillmentAction === 'renew_renewal_extension_recurring') {
          let licenseQuery = supabaseAdmin.from('licenses')
              .select('id, updates_expires_at, support_expires_at, license_name, product_id, products!inner(product_key)')
              .ilike('status', 'active');

          if (userId) {
              licenseQuery = licenseQuery.eq('user_id', userId);
          } else if (customerEmail) {
              const { data: previousOrders } = await supabaseAdmin.from('orders').select('id').eq('customer_email', customerEmail);
              if (previousOrders && previousOrders.length > 0) {
                  licenseQuery = licenseQuery.in('order_id', previousOrders.map(o => o.id));
              } else {
                  licenseQuery = licenseQuery.eq('id', '00000000-0000-0000-0000-000000000000'); // Force fail
              }
          }

          const { data: candidateLicenses } = await licenseQuery;
          
          let targetLicense = null;
          if (candidateLicenses && candidateLicenses.length > 0) {
              targetLicense = candidateLicenses.find((l: any) => 
                  (l.products?.product_key || '').toLowerCase().includes(productFamily) ||
                  (l.license_name || '').toLowerCase().includes(productFamily)
              );
          }

          if (!targetLicense) {
              console.error(`[Fatal Match Error] Support Renewal paid, but no matching ${productFamily} BYOK license found for user ${userId || customerEmail}`);
              return new Response("Orphaned renewal. Base license missing.", { status: 400 });
          }

          const now = new Date();
          const oldUpdatesExpiresAt = targetLicense.updates_expires_at || null;
          const oldSupportExpiresAt = targetLicense.support_expires_at || null;
          const currentExpirationStr = oldSupportExpiresAt || oldUpdatesExpiresAt;
          const currentExpirationDate = currentExpirationStr ? new Date(currentExpirationStr) : now;

          const baseDate = currentExpirationDate > now ? currentExpirationDate : now;
          const newExpirationDate = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000);

          const { error: updateErr } = await supabaseAdmin.from('licenses')
              .update({ 
                  support_expires_at: newExpirationDate.toISOString(),
                  updates_expires_at: newExpirationDate.toISOString()
              })
              .eq('id', targetLicense.id);

          if (updateErr) {
              console.error(`[Fatal] Failed to extend base license ${targetLicense.id}:`, updateErr);
              throw new Error("License Extension Failed");
          }

          // Audit: record renewal details in order metadata
          const renewalAudit = {
              renewed_license_id: targetLicense.id,
              renewal_product_key: productKey,
              old_updates_expires_at: oldUpdatesExpiresAt,
              new_updates_expires_at: newExpirationDate.toISOString(),
              old_support_expires_at: oldSupportExpiresAt,
              new_support_expires_at: newExpirationDate.toISOString(),
              base_date_used: baseDate.toISOString(),
              was_expired: currentExpirationDate <= now,
          };
          await supabaseAdmin.from('orders')
              .update({ metadata: renewalAudit })
              .eq('id', newOrder.id);

          console.log(`[Renewal] License ${targetLicense.id} extended: ${oldSupportExpiresAt || 'null'} → ${newExpirationDate.toISOString()} (base: ${baseDate.toISOString()}, expired: ${currentExpirationDate <= now})`);
          
          emailAction = 'renewal_confirmation';
          emailEntityId = dataObject.subscription || newOrder.id;
      }

      // ============================================
      // FULFILLMENT: CREDIT TOP-UP PACKS
      // ============================================
      else if (fulfillmentAction === 'credit_topup') {
          if (!userId) {
              console.error(`[Fatal] Credit top-up requires a resolved user. Cannot add credits to unknown identity.`);
              // Still record the order (already done above), but skip credit grant
          } else {
              const creditsToAdd = product.metadata?.credits
                  ? parseInt(product.metadata.credits, 10)
                  : (CREDIT_PACK_AMOUNTS[productKey] || 0);

              if (creditsToAdd <= 0) {
                  console.error(`[Fatal] Credit top-up resolved 0 credits for product key: ${productKey}`);
              } else {
                  const { data: profileBefore } = await supabaseAdmin
                      .from('profiles')
                      .select('credit_balance')
                      .eq('id', userId)
                      .single();

                  const balanceBefore = profileBefore?.credit_balance ?? 0;

                  const { error: creditErr } = await supabaseAdmin
                      .from('profiles')
                      .upsert([{ id: userId, credit_balance: balanceBefore + creditsToAdd }]);

                  if (creditErr) {
                      console.error(`[Fatal] Failed to add ${creditsToAdd} top-up credits for user ${userId}:`, creditErr);
                      throw new Error('Credit top-up balance update failed');
                  }

                  // Ledger entry
                  await supabaseAdmin.from('credit_transactions').insert([{
                      user_id: userId,
                      kind: 'TOPUP_PURCHASE',
                      amount: creditsToAdd,
                      balance_before: balanceBefore,
                      balance_after: balanceBefore + creditsToAdd,
                      reason: `Credit pack purchase: ${creditsToAdd} credits`,
                      metadata: {
                          product_key: productKey,
                          stripe_price_id: priceId,
                          stripe_session_id: isSession ? dataObject.id : null,
                          order_id: newOrder.id,
                      }
                  }]);

                  console.log(`[Credits] Added ${creditsToAdd} top-up credits for user ${userId}. Balance: ${balanceBefore} → ${balanceBefore + creditsToAdd}`);
              }
          }
          // No specific email action for credit top-ups — receipt handled by Stripe
      } 

      // 7. TRIGGER TRANSACTIONAL EMAIL
      if (emailAction && contactId) {
          console.log(`[Email] Firing transactional email hook: ${emailAction}`);
          const { error: emailErr } = await supabaseAdmin.functions.invoke('resend-transactional-email', {
             body: { action: emailAction, contact_id: contactId, entity_id: emailEntityId }
          });
          if (emailErr) console.error(`[Warning] Failed to invoke email webhook:`, emailErr);
      }

      // ── 8. AFFILIATE ATTRIBUTION (non-fatal — runs after all fulfillment commits) ──
      //
      // checkout.session.completed → reads affiliate_session_token from Stripe session
      //   metadata, validates the click, runs the definitive self-referral check, voids
      //   any prior active referral for this user (last-click wins), inserts a referral
      //   row, and appends the first 'earned' commission_ledger entry.
      //
      // invoice.paid (recurring) → finds the existing active referral for the user,
      //   checks commission_expires_at, and appends a renewal 'earned' row.
      //   The UNIQUE index on (stripe_event_id) WHERE type='earned' makes this
      //   idempotent against webhook replay.
      //
      // Any error is caught and logged. Order fulfillment is already committed above;
      // affiliate attribution is purely additive and must never roll it back.
      try {
          await processAffiliateAttribution(
              supabaseAdmin,
              dataObject,
              isSession,
              isRecurringInvoice,
              event.id,
              newOrder.id,
              userId,
              stripeInvoiceId
          );
      } catch (affErr) {
          console.error("[Affiliate] Attribution error (non-fatal):", affErr);
      }

      console.log(`[Success] Fulfillment Complete for Entity: ${fulfillmentEntityId} -> Order: ${newOrder.id}`);
      return new Response(JSON.stringify({ success: true, order_id: newOrder.id }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
      console.error(`[Fatal] Unhandled fulfillment execution crash:`, error);
      return new Response(`Fulfillment Execution Crash: ${error.message}`, { status: 500 });
  }
});
