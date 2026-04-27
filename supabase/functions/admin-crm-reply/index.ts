// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'Method not allowed' });

  try {
    const raw = await req.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return jsonResponse(400, { ok: false, error: 'Invalid JSON' });
    }

    const { conversation_id, ticket_id, recipient_email, reply_text } = payload;

    if (!conversation_id || !ticket_id || !recipient_email || !reply_text) {
      return jsonResponse(400, { ok: false, error: 'Missing required fields' });
    }

    // ── Authenticate Admin ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { ok: false, error: 'Missing authorization' });

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-ignore
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    // @ts-ignore
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!serviceKey || !resendApiKey) throw new Error('Server misconfiguration: keys missing');

    const authClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(401, { ok: false, error: 'Unauthorized' });
    }

    // ── Send Email via Resend ──
    // Format subject strictly to ensure webhook threading works
    const formattedSubject = `Re: [${ticket_id}] Cast Director Studio Support`;
    const resendReq = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Cast Director Studio Support <support@castdirectorstudio.com>',
        to: [recipient_email],
        reply_to: 'support@inbox.castdirectorstudio.com',
        subject: formattedSubject,
        text: `Hello,\n\nSupport has replied to your Cast Director Studio ticket.\n\nTicket: ${ticket_id}\n\nMessage:\n${reply_text}\n\nYou can reply directly to this email or view the ticket in your account.\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`,
      })
    });

    const resendData = await resendReq.json();
    if (!resendReq.ok) {
      console.error('Resend delivery failed:', resendData);
      return jsonResponse(502, { ok: false, error: 'Failed to deliver email via Resend' });
    }

    // ── Check for Linked Registered Account & Notify ──
    const sbAdmin = createClient(supabaseUrl, serviceKey);
    let notificationMetadata = null;

    const { data: currentConvo } = await sbAdmin
      .from('crm_conversations')
      .select('status, linked_user_id')
      .eq('id', conversation_id)
      .single();

    if (currentConvo && currentConvo.linked_user_id) {
      const { data: userData, error: userErr } = await sbAdmin.auth.admin.getUserById(currentConvo.linked_user_id);
      const registeredEmail = userData?.user?.email;
      
      if (registeredEmail && registeredEmail.toLowerCase() !== recipient_email.toLowerCase()) {
        const notifSubject = `Support replied to your Cast Director Studio inquiry [${ticket_id}]`;
        const notifBody = `Hello,\n\nSupport has replied to your Cast Director Studio inquiry.\n\nTicket: ${ticket_id}\n\nThe reply was sent to the email address used in the original conversation. If you do not see it, please check your inbox, spam, or promotions folder.\n\nYou can reply directly to the support email thread to continue the conversation.\n\nCast Director Studio Support`;
        
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
              reply_to: 'support@inbox.castdirectorstudio.com',
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
          status: 'sent',
          registered_email_notification: notificationMetadata
        }
      })
      .select()
      .single();

    if (msgErr) {
      console.error('Database logging failed after email sent:', msgErr.message);
      throw new Error(`Email sent but CRM insert failed: ${msgErr.message}`);
    }

    // ── Upgrade Conversation Status ──
    if (currentConvo && currentConvo.status === 'new') {
      await sbAdmin
        .from('crm_conversations')
        .update({ status: 'open' })
        .eq('id', conversation_id);
    }

    // Return the inserted message so the frontend can append it
    return jsonResponse(200, { ok: true, message: messageRecord });

  } catch (error: any) {
    console.error('admin-crm-reply fatal error:', error.message);
    return jsonResponse(500, { ok: false, error: 'Internal server error while processing reply' });
  }
});
