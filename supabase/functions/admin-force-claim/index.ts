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
    const { data: existingUserId, error: rpcErr } = await supabaseAdmin.rpc('admin_get_user_id_by_email', {
      p_email: email
    });

    if (rpcErr) {
       console.error("RPC Error:", rpcErr);
    }

    let targetUserId = existingUserId;
    let createdAuthUser = false;

    // 5. Create Auth User if missing
    if (!targetUserId) {
      // Create user
      const tempPassword = crypto.randomUUID() + "A1!";
      const { data: newUserObj, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true
      });

      if (createErr || !newUserObj?.user) {
        throw new Error(`Failed to create auth user: ${createErr?.message}`);
      }

      targetUserId = newUserObj.user.id;
      createdAuthUser = true;

      // Generate recovery OTP via generateLink
      const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://castdirectorstudio.com";
      const resetPageUrl = `${siteUrl.replace(/\/$/, "")}/reset-password`;

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
      });

      const emailOtp = linkData?.properties?.email_otp;

      if (!linkErr && emailOtp) {
         // Build direct link to /reset-password with OTP (bypasses GoTrue redirect)
         const resetLink = `${resetPageUrl}?token=${encodeURIComponent(emailOtp)}&email=${encodeURIComponent(email)}&type=recovery`;

         console.log("Force claim reset link target page:", resetPageUrl);

         // Dispatch via Resend
         const resendApiKey = Deno.env.get('RESEND_API_KEY');
         if (resendApiKey) {
           const bodyText = `Hello,\n\nAn account has been created for your Cast Director Studio purchase.\n\nPlease click the link below to set your password and access your license, credits, and downloads:\n\n${resetLink}\n\nIf you have any issues, please reply to this email.`;
           
           await fetch('https://api.resend.com/emails', {
             method: 'POST',
             headers: {
               'Authorization': `Bearer ${resendApiKey}`,
               'Content-Type': 'application/json'
             },
             body: JSON.stringify({
               from: 'EZ3D Avatars <sales@castdirectorstudio.com>',
               to: [email],
               reply_to: 'support@inbox.castdirectorstudio.com',
               subject: 'Set up your Cast Director Studio account',
               text: bodyText,
             })
           });
         }
      }
    }

    // 6. Execute Linking Logic
    const claimed = {
      orders: 0,
      licenses: 0,
      subscriptions: 0,
      contacts: 0,
      downloads: 0,
    };

    // Orders
    const { data: orphanOrders } = await supabaseAdmin
      .from("orders")
      .select("id")
      .ilike("customer_email", email)
      .is("user_id", null);

    if (orphanOrders && orphanOrders.length > 0) {
      const orderIds = orphanOrders.map((o: any) => o.id);
      
      const { count } = await supabaseAdmin
        .from("orders")
        .update({ user_id: targetUserId })
        .in("id", orderIds)
        .select("id", { count: "exact", head: true });
      claimed.orders = count || orderIds.length;

      // Licenses linked to those orders
      const { count: licCount } = await supabaseAdmin
        .from("licenses")
        .update({ user_id: targetUserId })
        .in("order_id", orderIds)
        .is("user_id", null)
        .select("id", { count: "exact", head: true });
      claimed.licenses = licCount || 0;

      // Downloads linked to those orders
      const { count: dlCount } = await supabaseAdmin
        .from("downloads")
        .update({ user_id: targetUserId })
        .in("order_id", orderIds)
        .is("user_id", null)
        .select("id", { count: "exact", head: true });
      claimed.downloads = dlCount || 0;
    }

    // Subscriptions
    const { data: contactStripe } = await supabaseAdmin
      .from("contacts")
      .select("stripe_customer_id")
      .ilike("email", email)
      .maybeSingle();

    if (contactStripe?.stripe_customer_id) {
      const { count: subCount } = await supabaseAdmin
        .from("subscriptions")
        .update({ user_id: targetUserId })
        .eq("stripe_customer_id", contactStripe.stripe_customer_id)
        .is("user_id", null)
        .select("id", { count: "exact", head: true });
      claimed.subscriptions = subCount || 0;
    }

    // Contacts & CRM Contacts
    const { count: contactCount } = await supabaseAdmin
      .from("contacts")
      .update({ user_id: targetUserId, updated_at: new Date().toISOString() })
      .ilike("email", email)
      .is("user_id", null)
      .select("id", { count: "exact", head: true });
      
    const { count: crmContactCount } = await supabaseAdmin
      .from("crm_contacts")
      .update({ user_id: targetUserId, updated_at: new Date().toISOString() })
      .ilike("email", email)
      .is("user_id", null)
      .select("id", { count: "exact", head: true });

    claimed.contacts = (contactCount || 0) + (crmContactCount || 0);

    // If no contact existed at all, we create one (like claim-purchases does)
    if (!contactCount && !contactStripe) {
       const { data: checkAnyContact } = await supabaseAdmin.from("contacts").select("id").ilike("email", email).maybeSingle();
       if (!checkAnyContact) {
         await supabaseAdmin.from("contacts").insert([{ email, user_id: targetUserId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
         claimed.contacts += 1;
       }
    }

    // 7. Ensure Profiles Row Exists (upsert safely)
    const { data: existingProfile } = await supabaseAdmin.from('profiles').select('id').eq('id', targetUserId).maybeSingle();
    if (!existingProfile) {
      await supabaseAdmin.from('profiles').insert([{
        id: targetUserId,
        credit_balance: 0,
        email: email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);
    }

    // 8. Log Audit Record
    await supabaseAdmin.from('admin_audit_logs').insert([{
        admin_user_id: adminUser.id,
        target_email: email,
        target_user_id: targetUserId,
        action: 'admin_force_claim',
        created_auth_user: createdAuthUser,
        linked_orders_count: claimed.orders,
        linked_subscriptions_count: claimed.subscriptions,
        linked_licenses_count: claimed.licenses,
        linked_downloads_count: claimed.downloads,
        linked_contacts_count: claimed.contacts
    }]);

    const totalClaimed = Object.values(claimed).reduce((a, b) => a + b, 0);

    let responseMessage = '';
    if (createdAuthUser) {
        responseMessage = 'Created Auth User & Linked Records';
    } else if (totalClaimed === 0) {
        responseMessage = 'Existing account found. No orphaned records were found for this email.';
    } else {
        responseMessage = 'Found Existing User & Linked Records';
    }

    return new Response(JSON.stringify({ 
        success: true, 
        message: responseMessage,
        createdAuthUser,
        targetUserId,
        totalClaimed,
        details: claimed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("admin-force-claim error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, // Returning 200 with error property for easy frontend parsing without throwing React unhandled
    });
  }
});
