// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req: any) => {
  try {
    const payload = await req.json();

    // 1. Resend Webhook payloads wrap the email object in `data` if it's an event ping, or send it flat if raw forwarding
    const emailData = payload.data ? payload.data : payload;

    const fromHeader = emailData.from || '';
    const toHeader = Array.isArray(emailData.to) ? emailData.to.join(',') : (emailData.to || '');
    const subject = emailData.subject || 'No Subject';
    const textContent = emailData.text || '';
    const htmlContent = emailData.html || '';
    const providerMessageId = emailData.id || `unknown-${Date.now()}`;
    const attachments = emailData.attachments || [];

    // Extract raw email address from "Name <email@domain.com>" format
    const match = fromHeader.match(/<([^>]+)>/);
    const cleanFromEmail = match ? match[1].toLowerCase() : fromHeader.toLowerCase().trim();

    // Extract sender name from "Name <email>" format
    const nameMatch = fromHeader.match(/^([^<]+)</);
    const senderName = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : cleanFromEmail;

    // 2. Initialize Service Role Client to bypass RLS securely from the server
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Match against Contacts globally (commerce contacts)
    let matchedContactId = null;
    if (cleanFromEmail) {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('email', cleanFromEmail)
        .single();
      
      if (contact) {
         matchedContactId = contact.id;
      }
    }

    // 4. Insert securely into inbound_emails (legacy table — preserved)
    const { error: insertErr } = await supabaseAdmin
      .from('inbound_emails')
      .insert([{
        from_email: cleanFromEmail,
        to_email: toHeader,
        subject: subject,
        text_content: textContent,
        html_content: htmlContent,
        provider_message_id: providerMessageId,
        contact_id: matchedContactId,
        attachment_metadata: attachments
      }]);

    if (insertErr) {
       console.error("Inbound Edge Insertion Error:", insertErr.message);
    }

    // ───────────────────────────────────────────────────────────────
    // 5. CRM Integration — Route replies to CRM conversations
    // ───────────────────────────────────────────────────────────────

    // Try to extract a CRM ticket ID from the subject line
    // Matches patterns like: CDS-260427-A1B2 (from "Re: Your inquiry CDS-260427-A1B2 has been resolved")
    const ticketMatch = subject.match(/CDS-\d{6}-[A-F0-9]{4}/i);
    const messageBody = textContent || htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    if (ticketMatch) {
      // ── Reply to an existing CRM ticket ──
      const ticketId = ticketMatch[0].toUpperCase();

      try {
        // Find the conversation by ticket ID
        const { data: convo } = await supabaseAdmin
          .from('crm_conversations')
          .select('id, contact_id, status')
          .eq('ticket_id', ticketId)
          .single();

        if (convo) {
          // Insert reply as inbound CRM message
          await supabaseAdmin
            .from('crm_messages')
            .insert({
              conversation_id: convo.id,
              direction: 'inbound',
              source: 'email_reply',
              sender_email: cleanFromEmail,
              sender_name: senderName,
              body: messageBody,
              raw_payload: {
                subject,
                from: fromHeader,
                to: toHeader,
                provider_message_id: providerMessageId,
                has_attachments: attachments.length > 0,
              },
            });

          // Re-open the conversation if it was resolved or closed
          if (convo.status === 'resolved' || convo.status === 'closed') {
            await supabaseAdmin
              .from('crm_conversations')
              .update({ status: 'open' })
              .eq('id', convo.id);
          }

          console.log(`CRM reply linked to ticket ${ticketId}`);
        } else {
          console.warn(`Ticket ${ticketId} not found in CRM — storing as general inbound`);
          // Fall through to general CRM capture below
          await insertGeneralCrmMessage(supabaseAdmin, cleanFromEmail, senderName, subject, messageBody, fromHeader, toHeader, providerMessageId, attachments);
        }
      } catch (e: any) {
        console.error(`CRM ticket lookup failed for ${ticketId}:`, e.message);
      }
    } else {
      // ── No ticket ID — store as a new general CRM inbound ──
      await insertGeneralCrmMessage(supabaseAdmin, cleanFromEmail, senderName, subject, messageBody, fromHeader, toHeader, providerMessageId, attachments);
    }

    return new Response(JSON.stringify({ success: true, message: "Inbound processed" }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("Webhook processing crashed:", error);
    // Explicit 200 stops retries. Return the error string locally for edge-log diagnosis.
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});

// ── Helper: Insert a general (non-ticket) inbound email into the CRM ──
async function insertGeneralCrmMessage(
  sb: any,
  email: string,
  name: string,
  subject: string,
  body: string,
  fromHeader: string,
  toHeader: string,
  providerMessageId: string,
  attachments: any[]
) {
  try {
    // Upsert CRM contact
    const { data: crmContact, error: contactErr } = await sb
      .from('crm_contacts')
      .upsert({ email, name, source: 'inbound_email' }, { onConflict: 'email' })
      .select('id, user_id')
      .single();

    if (contactErr || !crmContact) {
      console.warn('CRM contact upsert for inbound failed:', contactErr?.message);
      return;
    }

    // Generate ticket ID
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(2)))
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const ticketId = `CDS-${yy}${mm}${dd}-${rand}`;

    // Create conversation
    const { data: convo, error: convoErr } = await sb
      .from('crm_conversations')
      .insert({
        contact_id: crmContact.id,
        linked_user_id: crmContact.user_id || null,
        ticket_id: ticketId,
        subject: subject,
        inquiry_type: 'Inbound Email',
        status: 'new',
        source: 'inbound_email',
      })
      .select('id')
      .single();

    if (convoErr || !convo) {
      console.warn('CRM conversation insert for inbound failed:', convoErr?.message);
      return;
    }

    // Insert message
    await sb
      .from('crm_messages')
      .insert({
        conversation_id: convo.id,
        direction: 'inbound',
        source: 'inbound_email',
        sender_email: email,
        sender_name: name,
        body: body,
        raw_payload: {
          subject,
          from: fromHeader,
          to: toHeader,
          provider_message_id: providerMessageId,
          has_attachments: attachments.length > 0,
        },
      });

    console.log(`New CRM inbound conversation created: ${ticketId}`);
  } catch (e: any) {
    console.error('General CRM inbound insertion failed:', e.message);
  }
}
