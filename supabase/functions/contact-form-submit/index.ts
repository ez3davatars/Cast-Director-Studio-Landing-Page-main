// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_INQUIRY_TYPES = [
  'Product Support',
  'Sales / Licensing',
  'Hosted Credits or Billing',
  'BYOK License Questions',
  'Partnerships / Media',
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

// ── Resend email sender ──
async function resendSend(apiKey: string, payload: Record<string, unknown>): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);
  return data.id || '';
}

// ── Brand palette ──
const B = {
  bg: '#030a14', card: '#0a1628', text: '#e6f0ff', muted: '#94a3b8',
  a1: '#facc15', a2: '#d4a017', border: 'rgba(255,255,255,0.06)',
};

function buildAdminHtml(ticketId: string, name: string, email: string, inquiryType: string, message: string, company: string, licenseType: string, orderEmail: string, when: string): string {
  let optRows = '';
  if (company) optRows += `<tr><td style="padding:8px 0;color:${B.muted}"><strong style="color:${B.text}">Company:</strong></td><td style="padding:8px 0">${escapeHtml(company)}</td></tr>`;
  if (licenseType) optRows += `<tr><td style="padding:8px 0;color:${B.muted}"><strong style="color:${B.text}">License Type:</strong></td><td style="padding:8px 0">${escapeHtml(licenseType)}</td></tr>`;
  if (orderEmail) optRows += `<tr><td style="padding:8px 0;color:${B.muted}"><strong style="color:${B.text}">Order Email:</strong></td><td style="padding:8px 0">${escapeHtml(orderEmail)}</td></tr>`;

  return `<div style="margin:0;padding:24px;background:${B.bg};font-family:system-ui,sans-serif;color:${B.text}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:${B.card};border-radius:16px;overflow:hidden;border:1px solid ${B.border}">
<tr><td style="padding:0"><div style="background:linear-gradient(90deg,${B.a1},${B.a2});padding:18px 24px;color:#000;font-weight:700;font-size:18px">Cast Director Studio — New Inquiry</div></td></tr>
<tr><td style="padding:24px">
<div style="text-align:right;color:${B.muted};font-size:12px">Ticket: <strong style="color:${B.text}">${escapeHtml(ticketId)}</strong></div>
<h2 style="margin:8px 0 12px;font-size:20px;color:${B.text}">Inquiry Details</h2>
<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
<tr><td style="padding:8px 0;width:180px;color:${B.muted}"><strong style="color:${B.text}">Name:</strong></td><td style="padding:8px 0">${escapeHtml(name)}</td></tr>
<tr><td style="padding:8px 0;color:${B.muted}"><strong style="color:${B.text}">Email:</strong></td><td style="padding:8px 0">${escapeHtml(email)}</td></tr>
${optRows}
<tr><td style="padding:8px 0;color:${B.muted}"><strong style="color:${B.text}">Inquiry:</strong></td><td style="padding:8px 0">${escapeHtml(inquiryType)}</td></tr>
<tr><td style="padding:8px 0;color:${B.muted};vertical-align:top"><strong style="color:${B.text}">Message:</strong></td><td style="padding:8px 0">${escapeHtml(message).replace(/\n/g, '<br>')}</td></tr>
</table>
<div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);margin:18px 0"></div>
<p style="margin:0;color:${B.muted};font-size:12px"><strong style="color:${B.text}">Submitted:</strong> ${escapeHtml(when)}</p>
</td></tr>
<tr><td style="padding:14px 24px;background:#060e1a;color:${B.muted};font-size:12px">© ${new Date().getFullYear()} Cast Director Studio by EZ3D Avatars</td></tr>
</table></div>`;
}

function buildConfirmHtml(ticketId: string, name: string, inquiryType: string, message: string, when: string): string {
  return `<div style="margin:0;padding:24px;background:${B.bg};font-family:system-ui,sans-serif;color:${B.text}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:${B.card};border-radius:16px;overflow:hidden;border:1px solid ${B.border}">
<tr><td style="padding:0"><div style="background:linear-gradient(90deg,${B.a1},${B.a2});padding:18px 24px;color:#000;font-weight:700;font-size:18px">Cast Director Studio — Confirmation</div></td></tr>
<tr><td style="padding:24px">
<div style="text-align:right;color:${B.muted};font-size:12px">Ticket: <strong style="color:${B.text}">${escapeHtml(ticketId)}</strong></div>
<h2 style="margin:8px 0 12px;font-size:20px;color:${B.text}">Thanks, ${escapeHtml(name)} — we received your message</h2>
<p style="margin:0 0 16px;color:${B.muted}">Ticket <strong style="color:${B.text}">${escapeHtml(ticketId)}</strong>. We typically respond within <strong style="color:${B.text}">1–2 business days</strong>.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
<tr><td style="padding:8px 0;width:180px;color:${B.muted}"><strong style="color:${B.text}">Inquiry:</strong></td><td style="padding:8px 0">${escapeHtml(inquiryType)}</td></tr>
<tr><td style="padding:8px 0;color:${B.muted};vertical-align:top"><strong style="color:${B.text}">Message:</strong></td><td style="padding:8px 0">${escapeHtml(message).replace(/\n/g, '<br>')}</td></tr>
</table>
<div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);margin:18px 0"></div>
<p style="margin:0;color:${B.muted};font-size:12px"><strong style="color:${B.text}">Submitted:</strong> ${escapeHtml(when)}</p>
</td></tr>
<tr><td style="padding:14px 24px;background:#060e1a;color:${B.muted};font-size:12px">© ${new Date().getFullYear()} Cast Director Studio by EZ3D Avatars</td></tr>
</table></div>`;
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'Method not allowed' });

  try {
    // ── Parse & validate ──
    const raw = await req.text();
    if (raw.length > 65536) return jsonResponse(413, { ok: false, error: 'Request too large' });

    let data: any;
    try { data = JSON.parse(raw); } catch { return jsonResponse(400, { ok: false, error: 'Invalid JSON' }); }

    const name = (data.name || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const inquiryType = (data.inquiryType || '').trim();
    const message = (data.message || '').trim();
    const gotcha = (data._gotcha || '').trim();

    const company = (data.company || '').trim();
    const licenseType = (data.licenseType || '').trim();
    const orderEmail = (data.orderEmail || '').trim();

    // Honeypot
    if (gotcha) return jsonResponse(200, { ok: true, ticketId: 'CDS-HONEYPOT' });

    // Required
    if (!name || !email || !inquiryType || !message) {
      return jsonResponse(400, { ok: false, error: 'Missing required fields' });
    }

    // Email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(400, { ok: false, error: 'Invalid email address' });
    }

    // Inquiry type
    if (!ALLOWED_INQUIRY_TYPES.includes(inquiryType)) {
      return jsonResponse(400, { ok: false, error: 'Invalid inquiry type' });
    }

    // Length limits
    if (name.length > 120) return jsonResponse(400, { ok: false, error: 'Name too long' });
    if (email.length > 190) return jsonResponse(400, { ok: false, error: 'Email too long' });
    if (message.length > 5000) return jsonResponse(400, { ok: false, error: 'Message too long' });
    if (company.length > 160) return jsonResponse(400, { ok: false, error: 'Company too long' });

    // ── Supabase client (service role — bypasses RLS) ──
    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-ignore
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';

    if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
    if (!resendApiKey) throw new Error('RESEND_API_KEY missing');

    const sb = createClient(supabaseUrl, serviceKey);

    // ── Match registered user by email ──
    let matchedUserId: string | null = null;

    // 1) Check commerce contacts table (Stripe-created, may have user_id)
    try {
      const { data: existingContact } = await sb
        .from('contacts')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();
      if (existingContact?.user_id) matchedUserId = existingContact.user_id;
    } catch { /* table may not exist or no match */ }

    // 2) If no match yet, query auth.users via admin API
    if (!matchedUserId) {
      try {
        const { data: { users } } = await sb.auth.admin.listUsers();
        const match = users?.find((u: any) => u.email?.toLowerCase() === email);
        if (match) matchedUserId = match.id;
      } catch { /* admin API not available or no match */ }
    }

    // ── Upsert CRM contact ──
    const { data: crmContact, error: contactErr } = await sb
      .from('crm_contacts')
      .upsert({
        email,
        name,
        company: company || null,
        phone: null,
        user_id: matchedUserId,
        source: 'website_contact_form',
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
        linked_user_id: matchedUserId,
        ticket_id: ticketId,
        subject: `${inquiryType} — Contact Form`,
        inquiry_type: inquiryType,
        status: 'new',
        source: 'website_contact_form',
      })
      .select('id')
      .single();

    if (convoErr || !convo) {
      console.error('CRM conversation insert failed:', convoErr?.message);
      return jsonResponse(500, { ok: false, error: 'Failed to save conversation record' });
    }

    // ── Insert message ──
    const rawPayload = { name, email, inquiryType, message, company, licenseType, orderEmail, _gotcha: gotcha };
    const { error: msgErr } = await sb
      .from('crm_messages')
      .insert({
        conversation_id: convo.id,
        direction: 'inbound',
        source: 'website_contact_form',
        sender_email: email,
        sender_name: name,
        body: message,
        raw_payload: rawPayload,
      });

    if (msgErr) {
      console.error('CRM message insert failed:', msgErr.message);
      return jsonResponse(500, { ok: false, error: 'Failed to save message record' });
    }

    // ── CRM save succeeded — now send emails ──
    const when = new Date().toISOString();
    const fromAddr = 'Cast Director Studio <support@castdirectorstudio.com>';
    const adminTo = 'support@castdirectorstudio.com';

    // Admin notification (REQUIRED — failure = warning but CRM record kept)
    let adminEmailOk = true;
    try {
      await resendSend(resendApiKey, {
        from: fromAddr,
        to: [adminTo],
        reply_to: email,
        subject: `New inquiry #${ticketId}: ${inquiryType}`,
        html: buildAdminHtml(ticketId, name, email, inquiryType, message, company, licenseType, orderEmail, when),
      });
    } catch (e: any) {
      console.error('Admin notification failed:', e.message);
      adminEmailOk = false;
    }

    // Visitor confirmation (FAIL-SOFT — never fails the submission)
    try {
      await resendSend(resendApiKey, {
        from: fromAddr,
        to: [email],
        reply_to: 'support@inbox.castdirectorstudio.com',
        subject: `We received your inquiry #${ticketId}`,
        html: buildConfirmHtml(ticketId, name, inquiryType, message, when),
      });
    } catch (e: any) {
      console.error('Confirmation email failed (fail-soft):', e.message);
    }

    // ── Response ──
    if (!adminEmailOk) {
      // CRM saved but admin notification failed
      return jsonResponse(200, {
        ok: true,
        ticketId,
        warning: 'Your message was saved but the notification email could not be sent. Our team will still see your message.',
      });
    }

    return jsonResponse(200, { ok: true, ticketId });
  } catch (error: any) {
    console.error('Contact form fatal error:', error.message);
    return jsonResponse(500, { ok: false, error: 'Server error while processing your message.' });
  }
});
