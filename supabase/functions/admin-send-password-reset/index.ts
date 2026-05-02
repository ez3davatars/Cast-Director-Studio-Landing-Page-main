// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
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
    const { email: rawEmail } = await req.json();
    if (!rawEmail) {
      throw new Error('Missing required field: email');
    }

    const email = rawEmail.trim().toLowerCase();

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized: Auth session missing' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // 1. Initialize Service Role Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Authenticate Request
    const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !adminUser) {
      return new Response(JSON.stringify({ error: `Unauthorized: ${userError?.message || 'Invalid session token'}` }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3. Validate Admin Privileges
    if (adminUser.app_metadata?.is_admin !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden: Requires Admin Role' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }



    // 4. Check if auth user already exists via RPC
    const { data: targetUserId, error: rpcErr } = await supabaseAdmin.rpc('admin_get_user_id_by_email', {
      p_email: email
    });

    if (rpcErr) {
       console.error("RPC Error:", rpcErr);
       throw new Error(`Database error: ${rpcErr.message}`);
    }

    if (!targetUserId) {
       throw new Error('No auth account exists for this email. Use Force Claim first.');
    }

    // 5. Generate recovery OTP via generateLink
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://castdirectorstudio.com";
    const resetPageUrl = `${siteUrl.replace(/\/$/, "")}/reset-password`;

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
    });

    if (linkErr) {
        throw new Error(`Failed to generate recovery link: ${linkErr.message}`);
    }

    const emailOtp = linkData?.properties?.email_otp;
    if (!emailOtp) {
        throw new Error("Supabase did not return a recovery OTP.");
    }

    // Build a direct link to /reset-password with the OTP.
    // This bypasses GoTrue's /auth/v1/verify redirect which ignores redirect_to.
    // The ResetPassword page will use supabase.auth.verifyOtp() to establish the session.
    // This is the same pattern Supabase's own email templates use with {{ .Token }}.
    const resetLink = `${resetPageUrl}?token=${encodeURIComponent(emailOtp)}&email=${encodeURIComponent(email)}&type=recovery`;

    console.log("Reset link target page:", resetPageUrl);

    // 6. Dispatch via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
        throw new Error('Internal Configuration Error: RESEND_API_KEY missing');
    }

    const bodyText = `Use the secure link below to reset your Cast Director Studio password and access your account.\n\n${resetLink}`;
    
    const resendReq = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
        },
        body: JSON.stringify({
        from: 'EZ3D Avatars <sales@castdirectorstudio.com>',
        to: [email],
        reply_to: 'support@inbox.castdirectorstudio.com',
        subject: 'Reset Your Cast Director Studio Password',
        text: bodyText,
        })
    });

    const resendData = await resendReq.json();
    if (!resendReq.ok) {
        throw new Error(`Resend API Error: ${JSON.stringify(resendData)}`);
    }

    // 7. Log Audit Record
    await supabaseAdmin.from('admin_audit_logs').insert([{
        admin_user_id: adminUser.id,
        target_email: email,
        target_user_id: targetUserId,
        action: 'admin_send_password_reset'
    }]);

    return new Response(JSON.stringify({ 
        success: true, 
        message: 'Password reset email sent.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("admin-send-password-reset error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Returning 200 with error property for easy frontend parsing without throwing React unhandled
    });
  }
});
