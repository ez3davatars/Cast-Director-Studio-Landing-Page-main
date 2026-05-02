// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_STATUSES = ['new', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'];

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: any) => {
  console.log('[admin-crm-reply] v2 dashboard-first — invoked');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(200, { ok: false, error: 'Method not allowed' });

  try {
    const raw = await req.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return jsonResponse(200, { ok: false, error: 'Invalid JSON' });
    }

    const { conversation_id, ticket_id, recipient_email, reply_text, status: requestedStatus, send_email = true } = payload;

    if (!conversation_id || !ticket_id || !recipient_email || !reply_text) {
      return jsonResponse(200, { ok: false, error: 'Missing required fields' });
    }

    // ── Authenticate Admin ──
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return jsonResponse(401, { ok: false, error: 'Unauthorized: Auth session missing' });

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-ignore
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!serviceKey || !resendApiKey) throw new Error('Server misconfiguration: keys missing');

    const sbAdmin = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: userError } = await sbAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(401, { ok: false, error: `Unauthorized: ${userError?.message || 'No user found'}` });
    }

    if (user.app_metadata?.is_admin !== true) {
      return jsonResponse(403, { ok: false, error: 'Forbidden: Requires Admin Role' });
    }

    // ── Determine new status ──
    let newStatus = 'waiting_on_customer'; // default when admin replies
    if (requestedStatus && VALID_STATUSES.includes(requestedStatus)) {
      newStatus = requestedStatus;
    }

    // ── Fetch Conversation State FIRST ──
    const { data: currentConvo, error: convoErr } = await sbAdmin
      .from('crm_conversations')
      .select('created_at, last_customer_message_at, last_admin_email_notification_at, status, linked_user_id')
      .eq('id', conversation_id)
      .single();

    if (convoErr || !currentConvo) {
      return jsonResponse(200, { ok: false, error: 'Conversation not found' });
    }

    const customerCycleStartedAt = currentConvo.last_customer_message_at || currentConvo.created_at;

    // ── Check if Customer is Actively Viewing ──
    const { data: activeCustomer } = await sbAdmin
      .from('crm_ticket_presence')
      .select('id')
      .eq('conversation_id', conversation_id)
      .eq('role', 'customer')
      .gte('last_seen_at', new Date(Date.now() - 90_000).toISOString())
      .limit(1);

    const customerIsActive = activeCustomer && activeCustomer.length > 0;

    // ── Determine if Email Should Send ──
    const passesDedupCheck =
      !currentConvo.last_admin_email_notification_at ||
      new Date(currentConvo.last_admin_email_notification_at) < new Date(customerCycleStartedAt);

    const shouldSendNotification =
      send_email === true &&
      !customerIsActive &&
      passesDedupCheck;

    let emailNotificationSkippedReason: string | null = null;
    if (send_email === true && !shouldSendNotification) {
      if (customerIsActive) {
        emailNotificationSkippedReason = 'customer_active_in_conversation';
      } else if (!passesDedupCheck) {
        emailNotificationSkippedReason = 'already_notified_this_cycle';
      }
    }

    // ── Send Email Notification via Resend (Optional) ──
    let resendData: any = { id: 'skipped_email' };
    let notificationMetadata: any = null;
    let emailNotificationSent = false;
    let emailNotificationSkipped = !shouldSendNotification && send_email === true;
    let emailNotificationFailed = false;

    if (shouldSendNotification) {
      const formattedSubject = `Re: [${ticket_id}] Cast Director Studio Support`;
      try {
        const resendReq = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Cast Director Studio Support <support@castdirectorstudio.com>',
            to: [recipient_email],
            subject: formattedSubject,
            text: `Hello,\n\nYour Cast Director Studio support ticket has been updated.\n\nTicket: ${ticket_id}\n\nPlease log into your account dashboard to view the message and respond if needed:\nhttps://castdirectorstudio.com/account\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`,
          })
        });

        resendData = await resendReq.json();
        if (!resendReq.ok) {
          console.error('Resend delivery failed:', resendData);
          emailNotificationFailed = true;
        } else {
          emailNotificationSent = true;
        }
      } catch (e: any) {
        console.error('Fetch to resend failed:', e);
        emailNotificationFailed = true;
      }

      // Check for Linked Registered Account & Notify
      if (currentConvo.linked_user_id) {
        const { data: userData } = await sbAdmin.auth.admin.getUserById(currentConvo.linked_user_id);
        const registeredEmail = userData?.user?.email;
        
        if (registeredEmail && registeredEmail.toLowerCase() !== recipient_email.toLowerCase()) {
          const notifSubject = `Re: [${ticket_id}] Cast Director Studio Support`;
          const notifBody = `Hello,\n\nYour Cast Director Studio support ticket has been updated.\n\nTicket: ${ticket_id}\n\nPlease log into your account dashboard to view the message and respond if needed:\nhttps://castdirectorstudio.com/account\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`;
          
          let notifSent = false;
          let notifErr = null;
          try {
            const notifReq = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: 'Cast Director Studio Support <support@castdirectorstudio.com>',
                to: [registeredEmail],
                subject: notifSubject,
                text: notifBody,
              })
            });
            if (!notifReq.ok) {
              notifErr = 'Resend notification API returned non-OK status';
            } else {
              notifSent = true;
            }
          } catch (e: any) {
            notifErr = e.message;
          }

          notificationMetadata = {
            attempted: true,
            success: notifSent,
            error: notifErr,
            registered_email: registeredEmail
          };
        }
      }
    }

    // ── Record Outbound Message in CRM ──
    const { data: messageRecord, error: msgErr } = await sbAdmin
      .from('crm_messages')
      .insert({
        conversation_id,
        direction: 'outbound',
        source: 'crm_admin_reply',
        sender_email: user.email || 'support@castdirectorstudio.com',
        sender_name: 'Cast Director Support',
        body: reply_text,
        raw_payload: { 
          resend_message_id: resendData.id, 
          status: emailNotificationSent ? 'sent' : (emailNotificationSkipped ? 'skipped' : 'failed'),
          registered_email_notification: notificationMetadata,
          deduplication: {
            shouldSendNotification,
            customerIsActive,
            customerCycleStartedAt,
            lastAdminEmailNotificationAt: currentConvo.last_admin_email_notification_at,
          }
        }
      })
      .select()
      .single();

    if (msgErr) {
      console.error('Database logging failed after email processing:', msgErr.message);
      return jsonResponse(200, { ok: false, error: `Message not saved to CRM: ${msgErr.message}` });
    }

    // ── Update Conversation Status + last_admin_reply_at ──
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      last_admin_reply_at: new Date().toISOString(),
    };
    if (emailNotificationSent) {
      updatePayload.last_admin_email_notification_at = new Date().toISOString();
    }

    await sbAdmin
      .from('crm_conversations')
      .update(updatePayload)
      .eq('id', conversation_id);

    // Return the inserted message so the frontend can append it
    return jsonResponse(200, { 
      ok: true, 
      message: messageRecord, 
      newStatus,
      replySaved: true,
      emailNotificationSent,
      emailNotificationSkipped,
      emailNotificationFailed,
      emailNotificationSkippedReason
    });

  } catch (error: any) {
    console.error('admin-crm-reply fatal error:', error.message);
    return jsonResponse(200, { ok: false, error: 'Internal server error while processing reply' });
  }
});
