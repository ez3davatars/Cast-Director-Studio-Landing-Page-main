// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // 1. Handle Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Missing authorization header." }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { downloadId } = body;

    if (!downloadId) {
      return new Response(
        JSON.stringify({ error: "missing_id", message: "No download ID provided." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Initialize Service Role DB Client mapped specifically for internal validations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid authorization token." }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Resolve Download Tracking Row
    const { data: download, error: dbErr } = await supabaseAdmin
      .from('downloads')
      .select('*')
      .eq('id', downloadId)
      .maybeSingle();

    if (dbErr || !download) {
      return new Response(
        JSON.stringify({ error: "DOWNLOAD_NOT_FOUND", message: "This download link is invalid or does not exist." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Confirm Ownership/Claim Rules
    const emailMatch = user.email ? (download.customer_email?.toLowerCase() === user.email.toLowerCase()) : false;
    let isAuthorized = download.user_id === user.id || (download.user_id === null && emailMatch);

    if (!isAuthorized && download.user_id === null && download.order_id && user.email) {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('customer_email')
        .eq('id', download.order_id)
        .maybeSingle();
      if (order && order.customer_email?.toLowerCase() === user.email.toLowerCase()) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "unauthorized_download", message: "You do not have permission to manage this download." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Confirm related purchase/license is still valid
    const { data: licList, error: _licErr } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('product_id', download.product_id)
      .eq('status', 'active')
      .or(`user_id.eq.${user.id},assigned_to.ilike.${user.email}`);

    let activePurchase = licList && licList.length > 0;
    if (!activePurchase && download.order_id) {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('payment_status, fulfillment_status')
        .eq('id', download.order_id)
        .maybeSingle();
      if (order && (order.payment_status?.toLowerCase() === 'paid' || order.fulfillment_status?.toLowerCase() === 'fulfilled')) {
        activePurchase = true;
      }
    }

    if (!activePurchase) {
      return new Response(
        JSON.stringify({ error: "license_inactive", message: "No active purchase or license was found for this product." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Confirm installer is active/stable
    if (!download.installer_id) {
      return new Response(
        JSON.stringify({ error: "missing_installer", message: "This software installer record is incomplete." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: installer, error: instErr } = await supabaseAdmin
      .from('installers')
      .select('*')
      .eq('id', download.installer_id)
      .maybeSingle();

    if (instErr || !installer || !installer.is_active || !installer.is_stable) {
      return new Response(
        JSON.stringify({ error: "installer_unavailable", message: "The requested software version is currently unavailable or inactive." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Generate a new download_token
    const downloadToken = "dl_" + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // 8. Update downloads record
    const { error: updateErr } = await supabaseAdmin
      .from('downloads')
      .update({
        download_token: downloadToken,
        expires_at: expiresAt,
        completed_at: null,
        download_count: 0
      })
      .eq('id', download.id);

    if (updateErr) {
      console.error("[Refresh Error] Failed to update download record:", updateErr);
      return new Response(
        JSON.stringify({ error: "update_failed", message: "Could not refresh download link. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Success - Return customer-safe JSON
    return new Response(
      JSON.stringify({
        downloadUrl: `/download/${downloadToken}`,
        expiresAt: expiresAt,
        displayName: download.display_name || "Cast Director Studio Installer",
        platform: download.platform || "windows",
        version: download.version || "1.0.0",
        fileType: download.file_type || "installer"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[Fatal] Edge Download Refresh crashed:`, error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: "An unexpected architecture fault occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
