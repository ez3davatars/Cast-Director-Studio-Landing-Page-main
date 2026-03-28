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

    // 2. Initialize Service Role Client to bypass RLS securely from the server
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Match against Contacts globally
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

    // 4. Insert securely into inbound_emails
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
       // Return 200 anyway so Resend doesn't aggressively retry on structural failure we need to debug
       return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
         headers: { 'Content-Type': 'application/json' },
         status: 200, 
       });
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
