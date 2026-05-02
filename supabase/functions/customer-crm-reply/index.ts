// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Statuses that trigger reopen to 'new' when customer replies
const REOPEN_STATUSES = ['resolved', 'closed', 'waiting_on_customer'];

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(200, { ok: false, error: 'Method not allowed' });

  try {
    const raw = await req.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return jsonResponse(200, { ok: false, error: 'Invalid JSON payload' });
    }

    const { conversation_id, reply_text } = payload;

    if (!conversation_id || !reply_text || reply_text.trim() === '') {
      return jsonResponse(200, { ok: false, error: 'Missing conversation ID or reply text' });
    }

    if (reply_text.length > 5000) {
      return jsonResponse(200, { ok: false, error: 'Reply text exceeds maximum allowed length of 5000 characters' });
    }

    // ── Authenticate User ──
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) return jsonResponse(200, { ok: false, error: 'Missing authorization' });

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-ignore
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!serviceKey) throw new Error('Server misconfiguration: service key missing');

    const sbAdmin = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace('Bearer ', '');
    
    const { data: { user }, error: userError } = await sbAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(200, { 
        ok: false, 
        error: `Unauthorized or expired session: ${userError?.message || 'no user'}`,
        debug: { authHeader: authHeader ? authHeader.substring(0, 15) + '...' : 'null' }
      });
    }

    // ── Verify Ownership & Get Conversation Data ──
    const { data: convo, error: convoErr } = await sbAdmin
      .from('crm_conversations')
      .select('id, ticket_id, linked_user_id, status, subject')
      .eq('id', conversation_id)
      .single();

    if (convoErr || !convo) {
      return jsonResponse(200, { ok: false, error: `Conversation not found: ${convoErr?.message}` });
    }

    if (convo.linked_user_id !== user.id) {
      return jsonResponse(200, { ok: false, error: 'Forbidden: You do not have permission to reply to this conversation' });
    }

    const senderEmail = user.email || 'unknown@castdirectorstudio.com';
    const senderName = user.user_metadata?.full_name || user.user_metadata?.name || senderEmail.split('@')[0];

    // ── Record Inbound Message in CRM ──
    const { data: messageRecord, error: msgErr } = await sbAdmin
      .from('crm_messages')
      .insert({
        conversation_id,
        direction: 'inbound',
        source: 'customer_account_reply',
        sender_email: senderEmail,
        sender_name: senderName,
        body: reply_text.trim(),
        raw_payload: { source: 'dashboard_reply_box', status: 'delivered' }
      })
      .select()
      .single();

    if (msgErr) {
      console.error('Database logging failed for customer reply:', msgErr.message);
      throw new Error(`Failed to record message in the database: ${msgErr.message}`);
    }

    // ── Update Conversation Status + last_customer_message_at ──
    const updatePayload: Record<string, unknown> = {
      last_customer_message_at: new Date().toISOString(),
    };

    // Reopen if ticket was resolved, closed, or waiting_on_customer
    if (REOPEN_STATUSES.includes(convo.status)) {
      updatePayload.status = 'new';
    }

    await sbAdmin
      .from('crm_conversations')
      .update(updatePayload)
      .eq('id', conversation_id);

    // ── Notify Support via Resend (Fail-soft, Presence-aware) ──
    let adminEmailSkipped = false;
    let adminEmailSkippedReason: string | null = null;
    let adminEmailSent = false;

    if (resendApiKey) {
      // Check if an admin is actively viewing this conversation
      const { data: activeAdmin } = await sbAdmin
        .from('crm_ticket_presence')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('role', 'admin')
        .gte('last_seen_at', new Date(Date.now() - 90_000).toISOString())
        .limit(1);

      const adminIsActive = activeAdmin && activeAdmin.length > 0;

      // Only send email if the previous status indicated a state transition
      // that creates a new "needs attention" event for the admin
      const previousStatusNeedsNotification = ['waiting_on_customer', 'resolved', 'closed'].includes(convo.status);

      const shouldNotifyAdmin = !adminIsActive && previousStatusNeedsNotification;

      if (adminIsActive) {
        adminEmailSkipped = true;
        adminEmailSkippedReason = 'admin_active_in_conversation';
      } else if (!previousStatusNeedsNotification) {
        adminEmailSkipped = true;
        adminEmailSkippedReason = 'ticket_already_needs_attention';
      }

      if (shouldNotifyAdmin) {
        const formattedSubject = `Customer replied to [${convo.ticket_id}]`;
        const notifBody = `A customer has replied to their support ticket via the Account Dashboard.\n\nTicket: ${convo.ticket_id}\nSubject: ${convo.subject}\nFrom: ${senderName} (${senderEmail})\n\nMessage:\n${reply_text.trim()}\n\n---\nYou can view and reply to this ticket in the Admin Leads dashboard.`;
        
        try {
          const resendReq = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Cast Director Support System <support@castdirectorstudio.com>',
              to: ['support@castdirectorstudio.com'],
              reply_to: senderEmail,
              subject: formattedSubject,
              text: notifBody,
            })
          });
          
          if (!resendReq.ok) {
            console.warn('Failed to send internal support notification:', await resendReq.text());
          } else {
            adminEmailSent = true;
          }
        } catch (e: any) {
          console.warn('Network error while sending internal support notification:', e.message);
        }
      }
    }

    // Return the inserted message so the frontend can append it
    const newStatus = REOPEN_STATUSES.includes(convo.status) ? 'new' : convo.status;
    return jsonResponse(200, { 
      ok: true, 
      message: messageRecord, 
      newStatus,
      adminEmailSkipped,
      adminEmailSkippedReason,
      adminEmailSent
    });

  } catch (error: any) {
    console.error('customer-crm-reply fatal error:', error.message);
    return jsonResponse(200, { ok: false, error: `Internal server error: ${error.message}` });
  }
});
