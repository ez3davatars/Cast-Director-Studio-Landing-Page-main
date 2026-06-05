// @ts-nocheck: external Deno and ESM modules
import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// License priority: higher index = stronger entitlement
const LICENSE_PRIORITY: Record<string, number> = {
  indie_desktop_byok: 1,
  agency_desktop_byok: 2,
  agency_commercial_byok: 2,
};

const OFFLINE_GRACE_DAYS = 7;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ allowed: false, error: "Missing authorization header", code: "unauthorized" }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ allowed: false, error: "Invalid or expired token", code: "unauthorized" }, 401);
    }

    // 2. Parse request body
    const { deviceFingerprint, deviceLabel, platform, appVersion, licenseKey, licenseId } = await req.json();

    if (!deviceFingerprint || typeof deviceFingerprint !== "string" || deviceFingerprint.length < 16) {
      return jsonResponse({ allowed: false, error: "Invalid device fingerprint", code: "bad_request" }, 400);
    }

    // 3. Admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let resolvedLicense = null;
    const desktopProductKeys = ["indie_desktop_byok", "agency_desktop_byok", "agency_commercial_byok"];

    // 4. Resolve exact license if explicitly selected or entered
    if (licenseId || licenseKey) {
      let query = supabaseAdmin
        .from("licenses")
        .select("id, product_id, status, device_limit, max_activations, license_name, license_key, user_id, assigned_to, products!inner(product_key)")

      if (licenseId) {
        query = query.eq("id", licenseId);
      } else {
        query = query.eq("license_key", licenseKey);
      }

      const { data: lic, error: licErr } = await query.maybeSingle();

      if (licErr || !lic) {
        return jsonResponse({ allowed: false, error: "License not found or invalid", code: "license_not_found" }, 404);
      }

      // Check active status strictly
      if (lic.status !== "active") {
        return jsonResponse({ allowed: false, error: "This license is inactive.", code: "license_inactive" }, 403);
      }

      // Check desktop BYOK product key constraint
      const pk = lic.products?.product_key || "";
      if (!desktopProductKeys.includes(pk)) {
        return jsonResponse({ allowed: false, error: "This license type cannot be used on desktop.", code: "invalid_product" }, 403);
      }

      // Ownership claim check
      if (lic.user_id && lic.user_id !== user.id) {
        return jsonResponse({ allowed: false, error: "This license belongs to another user.", code: "license_belongs_to_other" }, 403);
      }

      // Auto-claim unclaimed licenses
      if (!lic.user_id) {
        const { error: claimErr } = await supabaseAdmin
          .from("licenses")
          .update({ user_id: user.id })
          .eq("id", lic.id);

        if (claimErr) {
          console.error("[activate-device] Failed to auto-claim license:", claimErr);
          return jsonResponse({ allowed: false, error: "Failed to claim license.", code: "claim_failed" }, 500);
        }
        lic.user_id = user.id;
        console.log(`[activate-device] Successfully claimed license ${lic.id} for user ${user.id}`);
      }

      resolvedLicense = lic;
    } else {
      // 5. Fallback/Auto-selection when no licenseId/licenseKey is explicitly passed
      // Query active licenses
      const { data: licenses, error: licErr } = await supabaseAdmin
        .from("licenses")
        .select("id, product_id, status, device_limit, max_activations, license_name, products!inner(product_key)")
        .eq("user_id", user.id)
        .ilike("status", "active");

      if (licErr) {
        console.error("[activate-device] License query failed:", licErr);
        return jsonResponse({ allowed: false, error: "Failed to query licenses", code: "internal_error" }, 500);
      }

      // Also check active subscriptions (virtual entitlements)
      const { data: subscriptions } = await supabaseAdmin
        .from("subscriptions")
        .select("id, product_id, status, metadata, products!inner(product_key)")
        .eq("user_id", user.id)
        .ilike("status", "active");

      const entitlements = [];

      if (licenses) {
        for (const lic of licenses) {
          const pk = lic.products?.product_key || "";
          if (desktopProductKeys.includes(pk)) {
            entitlements.push({
              type: "license",
              id: lic.id,
              productKey: pk,
              deviceLimit: lic.max_activations ?? lic.device_limit ?? 2,
              max_activations: lic.max_activations,
              device_limit: lic.device_limit,
              priority: LICENSE_PRIORITY[pk] || 0,
            });
          }
        }
      }

      if (subscriptions) {
        for (const sub of subscriptions) {
          const pk = sub.products?.product_key || sub.metadata?.product_key || "";
          if (desktopProductKeys.includes(pk)) {
            const alreadyHasLicense = entitlements.some(e => e.productKey === pk);
            if (!alreadyHasLicense) {
              const matchingLicense = licenses?.find((l: any) => l.products?.product_key === pk);
              if (!matchingLicense) {
                // Mint virtual license
                const deviceLimit = pk.startsWith("agency") ? 5 : 2;
                const { data: newLic, error: mintErr } = await supabaseAdmin.from("licenses").insert([{
                  user_id: user.id,
                  product_id: sub.product_id,
                  license_name: `${pk} (subscription)`,
                  license_type: "subscription",
                  status: "active",
                  device_limit: deviceLimit,
                }]).select("id").single();

                if (!mintErr && newLic) {
                  entitlements.push({
                    type: "subscription",
                    id: newLic.id,
                    productKey: pk,
                    deviceLimit: deviceLimit,
                    priority: LICENSE_PRIORITY[pk] || 0,
                  });
                }
              }
            }
          }
        }
      }

      if (entitlements.length === 0) {
        return jsonResponse({
          allowed: false,
          error: "No active desktop license or subscription found",
          code: "no_entitlement",
        }, 403);
      }

      // Sort by priority and pick the strongest one
      entitlements.sort((a, b) => b.priority - a.priority);
      resolvedLicense = entitlements[0];
    }

    // 6. Enforce limit and perform idempotent activation
    const activationLimit = resolvedLicense.max_activations ?? resolvedLicense.device_limit ?? 2;

    // Check if an activation record already exists for this device fingerprint and license
    const { data: existingActivation } = await supabaseAdmin
      .from("device_activations")
      .select("id, status")
      .eq("license_id", resolvedLicense.id)
      .eq("device_fingerprint", deviceFingerprint)
      .maybeSingle();

    // Query active device count EXCLUDING the current device to make it idempotent
    let otherActiveQuery = supabaseAdmin
      .from("device_activations")
      .select("id", { count: "exact", head: true })
      .eq("license_id", resolvedLicense.id)
      .eq("status", "active");

    if (existingActivation && existingActivation.status === "active") {
      otherActiveQuery = otherActiveQuery.neq("id", existingActivation.id);
    }

    const { count: otherActiveCount, error: countErr } = await otherActiveQuery;
    if (countErr) {
      console.error("[activate-device] Failed to count other active devices:", countErr);
      return jsonResponse({ allowed: false, error: "Database error counting activations", code: "internal_error" }, 500);
    }

    const currentActive = otherActiveCount || 0;
    const offlineGraceUntil = new Date(Date.now() + OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    if (existingActivation) {
      // If it exists but is currently deactivated, reactivating it must respect the limit
      if (existingActivation.status !== "active" && currentActive >= activationLimit) {
        console.log(`[activate-device] Device limit reached for user ${user.id} on license ${resolvedLicense.id}: ${currentActive}/${activationLimit}`);
        return jsonResponse({
          allowed: false,
          error: "Device limit reached. Deactivate an existing device from your dashboard to continue.",
          code: "device_limit_reached",
          deviceLimit: activationLimit,
          activeDevices: currentActive,
        }, 403);
      }

      // Reactivate/update the existing row idempotently
      const { error: updateErr } = await supabaseAdmin
        .from("device_activations")
        .update({
          status: "active",
          last_seen_at: new Date().toISOString(),
          app_version: appVersion || null,
          device_label: deviceLabel || undefined,
          platform: platform || undefined,
          deactivated_at: null,
          deactivation_source: null,
        })
        .eq("id", existingActivation.id);

      if (updateErr) {
        console.error("[activate-device] Update failed:", updateErr);
        return jsonResponse({ allowed: false, error: "Failed to update device activation", code: "internal_error" }, 500);
      }

      console.log(`[activate-device] Idempotent activation update for device ${existingActivation.id} under license ${resolvedLicense.id}`);

      return jsonResponse({
        allowed: true,
        licenseId: resolvedLicense.id,
        productKey: resolvedLicense.products?.product_key || resolvedLicense.productKey,
        deviceLimit: activationLimit,
        activeDevices: currentActive + 1,
        offlineGraceUntil,
        activationId: existingActivation.id,
      });
    }

    // New device — check limit
    if (currentActive >= activationLimit) {
      console.log(`[activate-device] Device limit reached for user ${user.id} on license ${resolvedLicense.id}: ${currentActive}/${activationLimit}`);
      return jsonResponse({
        allowed: false,
        error: "Device limit reached. Deactivate an existing device from your dashboard to continue.",
        code: "device_limit_reached",
        deviceLimit: activationLimit,
        activeDevices: currentActive,
      }, 403);
    }

    // Insert new activation row
    const { data: newActivation, error: insertErr } = await supabaseAdmin
      .from("device_activations")
      .insert([{
        user_id: user.id,
        license_id: resolvedLicense.id,
        device_fingerprint: deviceFingerprint,
        device_label: deviceLabel || "Unknown Device",
        platform: platform || "unknown",
        app_version: appVersion || null,
        status: "active",
      }])
      .select("id")
      .single();

    if (insertErr) {
      // Handle rare race conditions
      if (insertErr.code === "23505") {
        const { data: raceActivation } = await supabaseAdmin
          .from("device_activations")
          .select("id, status")
          .eq("license_id", resolvedLicense.id)
          .eq("device_fingerprint", deviceFingerprint)
          .single();

        if (raceActivation?.status === "active") {
          return jsonResponse({
            allowed: true,
            licenseId: resolvedLicense.id,
            productKey: resolvedLicense.products?.product_key || resolvedLicense.productKey,
            deviceLimit: activationLimit,
            activeDevices: currentActive + 1,
            offlineGraceUntil,
            activationId: raceActivation.id,
          });
        }
      }

      console.error("[activate-device] Insert failed:", insertErr);
      return jsonResponse({ allowed: false, error: "Failed to register device", code: "internal_error" }, 500);
    }

    console.log(`[activate-device] New device activated for user ${user.id}: ${newActivation.id} (${currentActive + 1}/${activationLimit})`);

    return jsonResponse({
      allowed: true,
      licenseId: resolvedLicense.id,
      productKey: resolvedLicense.products?.product_key || resolvedLicense.productKey,
      deviceLimit: activationLimit,
      activeDevices: currentActive + 1,
      offlineGraceUntil,
      activationId: newActivation.id,
    });

  } catch (err: any) {
    console.error("[activate-device] Unhandled error:", err);
    return jsonResponse({ allowed: false, error: "Internal server error", code: "internal_error" }, 500);
  }
});
