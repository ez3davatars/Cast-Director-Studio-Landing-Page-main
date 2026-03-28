// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { contact_id, to, subject, body } = await req.json();

    if (!contact_id || !to || !subject || !body) {
      throw new Error('Missing required fields: contact_id, to, subject, body');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // 1. Authenticate Request using the Anon Key but with the User's JWT
    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // 2. Validate Admin Privileges precisely securely
    if (user.app_metadata?.is_admin !== true) {
      throw new Error('Forbidden: Requires Admin Role');
    }

    // 3. Dispatch via Resend
    // @ts-ignore
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error('Internal Configuration Error: RESEND_API_KEY missing');

    const resendReq = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'EZ3D Avatars <sales@castdirectorstudio.com>',
        to: [to],
        reply_to: 'support@castdirectorstudio.com',
        subject: subject,
        text: body,
      })
    });

    const resendData = await resendReq.json();
    if (!resendReq.ok) {
      throw new Error(`Resend API Error: ${JSON.stringify(resendData)}`);
    }

    // 4. Log to database via secure internal Supabase generic client with Service Key to ensure it writes structurally
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fail-soft Logging
    try {
      const { error: dbErr } = await supabaseAdmin.from('email_sends').insert([{
        contact_id: contact_id,
        subject: subject,
        provider_message_id: resendData.id,
        user_id: user.id,
        body: body
      }]);
      if (dbErr) {
        console.warn("Schema insertion fail-soft:", dbErr.message);
      }
    } catch (e: any) {
      console.warn("Database log omitted structurally:", e.message);
    }

    return new Response(JSON.stringify({ success: true, messageId: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
