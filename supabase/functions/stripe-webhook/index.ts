// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@14.14.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

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
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed.`, err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Only process these exact payment events
  if (event.type !== 'checkout.session.completed' && event.type !== 'invoice.paid') {
      return new Response("Event type safely ignored.", { status: 200 });
  }

  const isSession = event.type === 'checkout.session.completed';
  const isInvoice = event.type === 'invoice.paid';
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
  const { error: eventInsertError } = await supabaseAdmin.from('stripe_webhooks').insert([{ id: event.id }]);
  if (eventInsertError) {
      if (eventInsertError.code === '23505' || eventInsertError.message.includes('duplicate')) {
          console.log(`[Idempotency] Event ${event.id} already processed. Dropping duplicate.`);
          return new Response("Duplicate event ignored", { status: 200 });
      }
      console.error(`[Error] Failed to log event ${event.id}:`, eventInsertError);
      return new Response("Internal tracking error", { status: 500 });
  }

  try {
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
      let amountPaid = dataObject.amount_total || dataObject.amount_paid || 0;
      let currency = dataObject.currency || 'usd';

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
          const { data: contact } = await supabaseAdmin.from('contacts').select('id, user_id').eq('email', customerEmail.toLowerCase()).maybeSingle();
          if (contact) {
              contactId = contact.id;
              if (!userId && contact.user_id) userId = contact.user_id; // Safe guest-to-user fallback
          } else {
              // Auto-upsert so emails succeed
              const { data: newContact, error: contactInsertErr } = await supabaseAdmin.from('contacts')
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
          product_name_snapshot: product.name,
          amount: amountPaid / 100,
          currency: currency,
          product_type: productType,
          quantity: 1,
          is_test_mode: !event.livemode
      }]).select().single();

      if (itemErr) console.error(`[Warning] Order Item failed for Order ${newOrder.id}`, itemErr);

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

          const { data: newLicense, error: licErr } = await supabaseAdmin.from('licenses').insert([{
              user_id: userId,
              order_id: newOrder.id,
              order_item_id: newOrderItem?.id,
              product_id: product.id,
              stripe_price_id: priceId,
              license_name: product.name,
              license_key: newLicenseKey,
              license_type: 'perpetual',
              status: 'active',
              updates_expires_at: updatesExpires.toISOString(),
              support_expires_at: updatesExpires.toISOString(),
          }]).select().single();

          if (licErr) {
              console.error(`[Fatal] Failed to mint License:`, licErr);
              throw new Error("License Minting Failed");
          }

          const downloadId = crypto.randomUUID();
          const { error: dlErr } = await supabaseAdmin.from('downloads').insert([{
              id: downloadId,
              user_id: userId,
              order_id: newOrder.id,
              order_item_id: newOrderItem?.id,
              product_id: product.id,
              stripe_price_id: priceId,
              display_name: `${product.name} Installer`,
              platform: product.platform || 'windows',
              file_type: 'installer',
              download_url: `https://castdirectorstudio.com/download/${downloadId}`,
              expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }]);

          if (dlErr) console.error(`[Warning] Failed to mint Download Installer:`, dlErr);

          emailAction = 'license_download_details';
      }

      // ============================================
      // FULFILLMENT: HOSTED PLANS (Subscriptions)
      // ============================================
      else if (fulfillmentAction === 'mint_hosted_subscription_initial' || fulfillmentAction === 'renew_hosted_subscription') {
          const stripeSubscriptionId = dataObject.subscription || `sub_fake_${Date.now()}`;
          
          let periodEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          try {
              if (dataObject.subscription) {
                  const stripeSub = await stripe.subscriptions.retrieve(dataObject.subscription);
                  if (stripeSub && stripeSub.current_period_end) {
                      periodEndIso = new Date(stripeSub.current_period_end * 1000).toISOString();
                  }
              }
          } catch(se) {
              console.warn("[Stripe Source Warning] Failed to fetch true period. Falling back to +30 days.", se);
          }
          
          const { error: subErr } = await supabaseAdmin.from('subscriptions').upsert([{
              user_id: userId,
              stripe_customer_id: dataObject.customer,
              stripe_subscription_id: stripeSubscriptionId,
              status: 'active',
              current_period_end: periodEndIso,
              metadata: { stripe_price_id: priceId }
          }], { onConflict: 'stripe_subscription_id' });

          if (subErr) console.error(`[Fatal] Failed to record Subscription tracker:`, subErr);

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
          const currentSupportStr = targetLicense.support_expires_at || targetLicense.updates_expires_at;
          const currentSupportDate = currentSupportStr ? new Date(currentSupportStr) : now;

          const baseDate = currentSupportDate > now ? currentSupportDate : now;
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
          
          emailAction = 'renewal_confirmation';
          emailEntityId = dataObject.subscription || newOrder.id;
      } 

      // 7. TRIGGER TRANSACTIONAL EMAIL
      if (emailAction && contactId) {
          console.log(`[Email] Firing transactional email hook: ${emailAction}`);
          const { error: emailErr } = await supabaseAdmin.functions.invoke('resend-transactional-email', {
             body: { action: emailAction, contact_id: contactId, entity_id: emailEntityId }
          });
          if (emailErr) console.error(`[Warning] Failed to invoke email webhook:`, emailErr);
      }

      console.log(`[Success] Fulfillment Complete for Entity: ${fulfillmentEntityId} -> Order: ${newOrder.id}`);
      return new Response(JSON.stringify({ success: true, order_id: newOrder.id }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
      console.error(`[Fatal] Unhandled fulfillment execution crash:`, error);
      return new Response(`Fulfillment Execution Crash: ${error.message}`, { status: 500 });
  }
});
