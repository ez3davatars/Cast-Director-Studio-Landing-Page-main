// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_INQUIRY_TYPES = [
  'Product Support',
  'Sales / Licensing',
  'Hosted Credits or Billing',
  'BYOK License Questions',
  'General Question',
];

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateTicketId(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `CDS-${yy}${mm}${dd}-${rand}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Brand palette (matching contact-form-submit) ──
const B = {
  bg: '#030a14', card: '#0a1628', text: '#e6f0ff', muted: '#94a3b8',
  a1: '#facc15', a2: '#d4a017', border: 'rgba(255,255,255,0.06)',
};

function buildAdminNotificationHtml(
  ticketId: string, email: string, inquiryType: string,
  subject: string, message: string, when: string
): string {
  return `<div style="margin:0;padding:24px;background:${B.bg};font-family:system-ui,sans-serif;color:${B.text}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:${B.card};border-radius:16px;overflow:hidden;border:1px solid ${B.border}">
<tr><td style="padding:0"><div style="background:linear-gradient(90deg,${B.a1},${B.a2});padding:18px 24px;color:#000;font-weight:700;font-size:18px">Cast Director Studio — Dashboard Ticket</div></td></tr>
<tr><td style="padding:24px">
<div style="text-align:right;color:${B.muted};font-size:12px">Ticket: <strong style="color:${B.text}">${escapeHtml(ticketId)}</strong></div>
<h2 style="margin:8px 0 12px;font-size:20px;color:${B.text}">${escapeHtml(subject)}</h2>
<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
<tr><td style="padding:8px 0;width:180px;color:${B.muted}"><strong style="color:${B.text}">From:</strong></td><td style="padding:8px 0">${escapeHtml(email)} (Registered User)</td></tr>
<tr><td style="padding:8px 0;color:${B.muted}"><strong style="color:${B.text}">Category:</strong></td><td style="padding:8px 0">${escapeHtml(inquiryType)}</td></tr>
<tr><td style="padding:8px 0;color:${B.muted};vertical-align:top"><strong style="color:${B.text}">Message:</strong></td><td style="padding:8px 0">${escapeHtml(message).replace(/\n/g, '<br>')}</td></tr>
</table>
<div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);margin:18px 0"></div>
<p style="margin:0;color:${B.muted};font-size:12px"><strong style="color:${B.text}">Submitted:</strong> ${escapeHtml(when)} via Account Dashboard</p>
</td></tr>
<tr><td style="padding:14px 24px;background:#060e1a;color:${B.muted};font-size:12px">© ${new Date().getFullYear()} Cast Director Studio by EZ3D Avatars</td></tr>
</table></div>`;
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'Method not allowed' });

  try {
    // ── Authenticate user ──
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

    if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

    // Verify JWT
    const authClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(401, { ok: false, error: 'Invalid or expired session' });
    }

    const userEmail = user.email;
    const userId = user.id;
    if (!userEmail) return jsonResponse(400, { ok: false, error: 'No email associated with account' });

    // ── Parse & validate body ──
    const raw = await req.text();
    if (raw.length > 65536) return jsonResponse(413, { ok: false, error: 'Request too large' });

    let data: any;
    try { data = JSON.parse(raw); } catch { return jsonResponse(400, { ok: false, error: 'Invalid JSON' }); }

    const subject = (data.subject || '').trim();
    const inquiryType = (data.inquiryType || '').trim();
    const message = (data.message || '').trim();

    if (!subject || !inquiryType || !message) {
      return jsonResponse(400, { ok: false, error: 'Missing required fields: subject, inquiryType, message' });
    }

    if (!ALLOWED_INQUIRY_TYPES.includes(inquiryType)) {
      return jsonResponse(400, { ok: false, error: 'Invalid inquiry type' });
    }

    if (subject.length > 200) return jsonResponse(400, { ok: false, error: 'Subject too long' });
    if (message.length > 5000) return jsonResponse(400, { ok: false, error: 'Message too long' });

    // ── Service role client (bypasses RLS) ──
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Upsert CRM contact ──
    const userName = user.user_metadata?.full_name || user.user_metadata?.name || userEmail.split('@')[0];

    const { data: crmContact, error: contactErr } = await sb
      .from('crm_contacts')
      .upsert({
        email: userEmail,
        name: userName,
        user_id: userId,
        source: 'dashboard',
      }, { onConflict: 'email' })
      .select('id')
      .single();

    if (contactErr || !crmContact) {
      console.error('CRM contact upsert failed:', contactErr?.message);
      return jsonResponse(500, { ok: false, error: 'Failed to save contact record' });
    }

    // ── Create conversation ──
    const ticketId = generateTicketId();
    const { data: convo, error: convoErr } = await sb
      .from('crm_conversations')
      .insert({
        contact_id: crmContact.id,
        linked_user_id: userId,
        ticket_id: ticketId,
        subject: subject,
        inquiry_type: inquiryType,
        status: 'new',
        source: 'dashboard',
      })
      .select('id')
      .single();

    if (convoErr || !convo) {
      console.error('CRM conversation insert failed:', convoErr?.message);
      return jsonResponse(500, { ok: false, error: 'Failed to create ticket' });
    }

    // ── Insert initial message ──
    const { error: msgErr } = await sb
      .from('crm_messages')
      .insert({
        conversation_id: convo.id,
        direction: 'inbound',
        source: 'dashboard',
        sender_email: userEmail,
        sender_name: userName,
        body: message,
        raw_payload: { subject, inquiryType, source: 'account_dashboard', user_id: userId },
      });

    if (msgErr) {
      console.error('CRM message insert failed:', msgErr.message);
      return jsonResponse(500, { ok: false, error: 'Failed to save message' });
    }

    // ── Send admin notification (fail-soft) ──
    if (resendApiKey) {
      const when = new Date().toISOString();
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Cast Director Studio Support <support@castdirectorstudio.com>',
            to: ['support@castdirectorstudio.com'],
            reply_to: userEmail,
            subject: `Dashboard Ticket #${ticketId}: ${subject}`,
            html: buildAdminNotificationHtml(ticketId, userEmail, inquiryType, subject, message, when),
          }),
        });
      } catch (e: any) {
        console.error('Admin notification failed (fail-soft):', e.message);
      }
    }

    return jsonResponse(200, { ok: true, ticketId });
  } catch (error: any) {
    console.error('Dashboard ticket fatal error:', error.message);
    return jsonResponse(500, { ok: false, error: 'Server error while creating your ticket.' });
  }
});
