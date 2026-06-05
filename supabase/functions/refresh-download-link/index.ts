// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: any, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
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
    const downloadId = body.downloadId ?? body.download_id ?? body.id;

    if (!downloadId) {
      return json({ error: "missing_id" }, 400);
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
    let download = null;
    let hasByokLicense = false;

    // Check if the authenticated user has an active BYOK license
    const { data: userLicenses, error: licErr } = await supabaseAdmin
      .from('licenses')
      .select('*')
      .eq('status', 'active')
      .or(`user_id.eq.${user.id},assigned_to.ilike.${user.email || ''}`);

    let byokLicenses = [];
    if (userLicenses && userLicenses.length > 0) {
      const productIds = userLicenses.map((l: any) => l.product_id).filter(Boolean);
      let products = [];
      if (productIds.length > 0) {
        const { data: prods } = await supabaseAdmin
          .from('products')
          .select('id, product_key')
          .in('id', productIds);
        if (prods) {
          products = prods;
        }
      }
      const productsMap = new Map(products.map((p: any) => [p.id, p.product_key]));

      byokLicenses = userLicenses.filter((l: any) => {
        const pk = productsMap.get(l.product_id) || l.metadata?.product_key;
        return pk === 'indie_desktop_byok' || pk === 'agency_desktop_byok' || pk === 'agency_commercial_byok';
      });

      if (byokLicenses.length > 0) {
        hasByokLicense = true;
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUuid = typeof downloadId === 'string' && uuidRegex.test(downloadId);

    if (isValidUuid) {
      const { data, error: dbErr } = await supabaseAdmin
        .from('downloads')
        .select('*')
        .eq('id', downloadId)
        .maybeSingle();
      if (data) {
        download = data;
      }
    }

    // Handle byok-windows-installer sentinel or missing download row for BYOK license
    if (downloadId === 'byok-windows-installer' || (!download && hasByokLicense)) {
      if (!hasByokLicense) {
        return new Response(
          JSON.stringify({ error: "no_active_byok_license", message: "No active BYOK desktop license found for this user." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3b. Resolve the user's valid BYOK order
      let resolvedOrderId = null;

      // Try 1: Find an active BYOK license with a non-null order_id
      const licenseWithOrder = byokLicenses.find((l: any) => l.order_id);
      if (licenseWithOrder) {
        resolvedOrderId = licenseWithOrder.order_id;
      }

      // Try 2: Look up an existing downloads row for this user that has an order_id
      if (!resolvedOrderId) {
        const { data: existingDownloads } = await supabaseAdmin
          .from('downloads')
          .select('order_id')
          .eq('user_id', user.id)
          .not('order_id', 'is', null)
          .limit(1);
        if (existingDownloads && existingDownloads.length > 0) {
          resolvedOrderId = existingDownloads[0].order_id;
        }
      }

      // Try 3: Search the user's order history in orders table (by user_id or customer_email)
      if (!resolvedOrderId) {
        const { data: userOrders } = await supabaseAdmin
          .from('orders')
          .select('id')
          .or(`user_id.eq.${user.id},customer_email.ilike.${user.email || ''}`)
          .order('created_at', { ascending: false });
        if (userOrders && userOrders.length > 0) {
          resolvedOrderId = userOrders[0].id;
        }
      }

      if (!resolvedOrderId) {
        return new Response(
          JSON.stringify({ error: "eligible_order_not_found", message: "No eligible purchase order was found for your license." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to find a download row pointing to this user/order/installer
      const { data: existingDl } = await supabaseAdmin
        .from('downloads')
        .select('*')
        .eq('user_id', user.id)
        .eq('order_id', resolvedOrderId)
        .eq('installer_id', 'e6c82c14-d748-41ab-b1fb-ed4bfcc3d291')
        .maybeSingle();

      if (existingDl) {
        download = existingDl;
      } else {
        // Insert a new download row
        const newDownloadRow = {
          order_id: resolvedOrderId,
          user_id: user.id,
          installer_id: 'e6c82c14-d748-41ab-b1fb-ed4bfcc3d291',
          display_name: 'Cast Director Studio Windows Installer',
          platform: 'windows',
          version: '1.0.0',
          file_type: 'installer',
          download_count: 0,
          max_downloads: 10,
          customer_email: user.email
        };

        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('downloads')
          .insert(newDownloadRow)
          .select()
          .single();

        if (insertErr || !inserted) {
          console.error("[Refresh Error] Failed to insert new downloads row:", insertErr);
          return new Response(
            JSON.stringify({ error: "refresh_failed", message: "Could not create download link. Please contact support." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        download = inserted;
      }
    }

    if (!download) {
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
    let activePurchase = false;
    if (hasByokLicense && download.installer_id === 'e6c82c14-d748-41ab-b1fb-ed4bfcc3d291') {
      activePurchase = true;
    } else {
      const { data: licList, error: _licErr } = await supabaseAdmin
        .from('licenses')
        .select('*')
        .eq('product_id', download.product_id)
        .eq('status', 'active')
        .or(`user_id.eq.${user.id},assigned_to.ilike.${user.email}`);

      activePurchase = licList && licList.length > 0;
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
    return json({
      success: true,
      downloadUrl: `/download/${downloadToken}`,
      expiresAt: expiresAt,
      displayName: download.display_name || "Cast Director Studio Installer",
      platform: download.platform || "windows",
      version: download.version || "1.0.0",
      fileType: download.file_type || "installer"
    });

  } catch (error: any) {
    console.error(`[Fatal] Edge Download Refresh crashed:`, error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: "An unexpected architecture fault occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
