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
    const { customer_email: rawEmail, status, reason, send_email } = await req.json();

    // ── Input validation ──
    if (!rawEmail) throw new Error('Missing required field: customer_email');
    if (!status) throw new Error('Missing required field: status');
    if (!['active', 'paused', 'canceled'].includes(status)) {
      throw new Error('Invalid status. Must be: active, paused, or canceled');
    }

    const email = rawEmail.trim().toLowerCase();
    const sendEmail = send_email !== false; // default true

    // Reason required for pause/cancel
    if ((status === 'paused' || status === 'canceled') && (!reason || reason.trim().length < 5)) {
      throw new Error('Reason is required for pause/cancel and must be at least 5 characters.');
    }

    const trimmedReason = reason ? reason.trim() : null;

    // ── 1. Authenticate admin ──
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized: Auth session missing' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // ── 2. Initialize service role client ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user: adminUser }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !adminUser) {
       return new Response(JSON.stringify({ error: `Unauthorized: ${userError?.message || 'Invalid session token'}` }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (adminUser.app_metadata?.is_admin !== true) {
       return new Response(JSON.stringify({ error: 'Forbidden: Requires Admin Role' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── 3. Resolve auth user ──
    const { data: targetUserId, error: rpcErr } = await supabaseAdmin.rpc('admin_get_user_id_by_email', {
      p_email: email
    });

    if (rpcErr) throw new Error(`Database error: ${rpcErr.message}`);
    if (!targetUserId) throw new Error('No auth account exists for this email.');

    // ── 4. Fetch current profile status ──
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('account_status')
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileErr) throw new Error(`Failed to fetch profile: ${profileErr.message}`);

    const previousStatus = profile?.account_status || 'active';

    if (previousStatus === status) {
      return new Response(JSON.stringify({
        success: true,
        message: `Account is already ${status}. No changes made.`,
        previous_status: previousStatus,
        new_status: status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ── 5. Build update payload ──
    const updatePayload: any = {
      account_status: status,
      account_status_reason: trimmedReason,
      account_status_updated_at: new Date().toISOString(),
      account_status_updated_by: adminUser.id,
    };

    if (status === 'paused') {
      updatePayload.account_paused_at = new Date().toISOString();
    } else if (status === 'canceled') {
      updatePayload.account_canceled_at = new Date().toISOString();
    } else if (status === 'active') {
      // Reactivation: clear pause/cancel timestamps
      updatePayload.account_paused_at = null;
      updatePayload.account_canceled_at = null;
    }

    // ── 6. Update profile ──
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateErr) throw new Error(`Failed to update profile: ${updateErr.message}`);

    // ── 7. Send email via Resend ──
    let emailSent = false;

    if (sendEmail) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');

      if (resendApiKey) {
        let subject = '';
        let bodyText = '';

        if (status === 'paused') {
          subject = 'Your Cast Director Studio account has been paused';
          bodyText = `Hello,\n\nYour Cast Director Studio account has been paused.\n\nReason:\n${trimmedReason}\n\nIf you believe this was a mistake or would like help resolving the issue, please reply to this email.\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`;
        } else if (status === 'canceled') {
          subject = 'Your Cast Director Studio account has been canceled';
          bodyText = `Hello,\n\nYour Cast Director Studio account has been canceled.\n\nReason:\n${trimmedReason}\n\nIf you believe this was a mistake or need help, please reply to this email.\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`;
        } else if (status === 'active') {
          subject = 'Your Cast Director Studio account has been reactivated';
          bodyText = `Hello,\n\nYour Cast Director Studio account has been reactivated.\n\nYou can sign in and continue using Cast Director Studio.\n\nCast Director Studio Support\nsupport@castdirectorstudio.com`;
        }

        try {
          const resendReq = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Cast Director Studio Support <support@castdirectorstudio.com>',
              to: [email],
              reply_to: 'support@inbox.castdirectorstudio.com',
              subject,
              text: bodyText,
            })
          });

          const resendData = await resendReq.json();
          if (resendReq.ok) {
            emailSent = true;
          } else {
            console.error("Resend API Error:", resendData);
          }
        } catch (emailErr) {
          console.error("Email dispatch failed:", emailErr);
        }
      }
    }

    // ── 8. Audit log ──
    await supabaseAdmin.from('admin_audit_logs').insert([{
      admin_user_id: adminUser.id,
      target_email: email,
      target_user_id: targetUserId,
      action: 'admin_update_account_status',
      previous_status: previousStatus,
      new_status: status,
      reason: trimmedReason,
      email_sent: emailSent,
    }]);

    // ── 9. Build response ──
    const response: any = {
      success: true,
      message: `Account status updated to ${status}.`,
      previous_status: previousStatus,
      new_status: status,
      email_sent: emailSent,
    };

    if (!emailSent && sendEmail) {
      response.warning = 'Status updated, but email failed to send.';
    }

    if (status === 'canceled') {
      response.stripe_warning = 'Stripe subscription cancellation must be completed manually.';
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("admin-update-account-status error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
