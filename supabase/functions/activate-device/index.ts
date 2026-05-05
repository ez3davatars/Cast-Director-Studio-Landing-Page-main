// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
  starter: 1,
  pro: 2,
  indie_desktop_byok: 3,
  agency_commercial_byok: 4,
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
    const { deviceFingerprint, deviceLabel, platform, appVersion } = await req.json();

    if (!deviceFingerprint || typeof deviceFingerprint !== "string" || deviceFingerprint.length < 16) {
      return jsonResponse({ allowed: false, error: "Invalid device fingerprint", code: "bad_request" }, 400);
    }

    // 3. Admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 4. Find user's active licenses
    const { data: licenses, error: licErr } = await supabaseAdmin
      .from("licenses")
      .select("id, product_id, status, device_limit, license_name, products!inner(product_key)")
      .eq("user_id", user.id)
      .ilike("status", "active");

    if (licErr) {
      console.error("[activate-device] License query failed:", licErr);
      return jsonResponse({ allowed: false, error: "Failed to query licenses", code: "internal_error" }, 500);
    }

    // 5. Also check active subscriptions (they may not have license rows)
    const { data: subscriptions } = await supabaseAdmin
      .from("subscriptions")
      .select("id, product_id, status, metadata, products!inner(product_key)")
      .eq("user_id", user.id)
      .ilike("status", "active");

    // 6. Build unified entitlement list
    type Entitlement = {
      type: "license" | "subscription";
      id: string;
      productKey: string;
      deviceLimit: number;
      priority: number;
    };

    const entitlements: Entitlement[] = [];

    if (licenses) {
      for (const lic of licenses) {
        const pk = (lic as any).products?.product_key || "";
        entitlements.push({
          type: "license",
          id: lic.id,
          productKey: pk,
          deviceLimit: lic.device_limit || 2,
          priority: LICENSE_PRIORITY[pk] || 0,
        });
      }
    }

    // For subscriptions without a matching license, create a virtual entitlement
    if (subscriptions) {
      for (const sub of subscriptions) {
        const pk = (sub as any).products?.product_key || sub.metadata?.product_key || "";
        const alreadyHasLicense = entitlements.some(e => e.productKey === pk);
        if (!alreadyHasLicense && LICENSE_PRIORITY[pk]) {
          // Check if a license row exists for this subscription (might have been created separately)
          const matchingLicense = licenses?.find((l: any) => l.products?.product_key === pk);
          if (!matchingLicense) {
            // Create an activation-tracking license for this subscription
            const deviceLimit = pk === "agency_commercial_byok" ? 5 : 2;
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
              console.log(`[activate-device] Minted activation license for subscription ${pk} → ${newLic.id}`);
            } else {
              console.warn("[activate-device] Failed to mint subscription license:", mintErr);
            }
          }
        }
      }
    }

    if (entitlements.length === 0) {
      return jsonResponse({
        allowed: false,
        error: "No active license or subscription found",
        code: "no_entitlement",
      }, 403);
    }

    // 7. Select strongest entitlement
    entitlements.sort((a, b) => b.priority - a.priority);
    const best = entitlements[0];

    console.log(`[activate-device] User ${user.id} | Best entitlement: ${best.productKey} (${best.type}) | License: ${best.id} | Limit: ${best.deviceLimit}`);

    // 8. Check if device is already activated for this license
    const { data: existingActivation } = await supabaseAdmin
      .from("device_activations")
      .select("id, status, last_seen_at")
      .eq("license_id", best.id)
      .eq("device_fingerprint", deviceFingerprint)
      .maybeSingle();

    const offlineGraceUntil = new Date(Date.now() + OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    if (existingActivation) {
      if (existingActivation.status === "active") {
        // Already active — just update last_seen_at
        await supabaseAdmin
          .from("device_activations")
          .update({
            last_seen_at: new Date().toISOString(),
            app_version: appVersion || null,
            device_label: deviceLabel || undefined,
            platform: platform || undefined,
          })
          .eq("id", existingActivation.id);

        // Count active devices for response
        const { count } = await supabaseAdmin
          .from("device_activations")
          .select("id", { count: "exact", head: true })
          .eq("license_id", best.id)
          .eq("status", "active");

        console.log(`[activate-device] Existing active device updated for user ${user.id} on license ${best.id}`);

        return jsonResponse({
          allowed: true,
          licenseId: best.id,
          productKey: best.productKey,
          deviceLimit: best.deviceLimit,
          activeDevices: count || 1,
          offlineGraceUntil,
          activationId: existingActivation.id,
        });
      }

      // Was deactivated — reactivate if slots available
      const { count: activeCount } = await supabaseAdmin
        .from("device_activations")
        .select("id", { count: "exact", head: true })
        .eq("license_id", best.id)
        .eq("status", "active");

      if ((activeCount || 0) >= best.deviceLimit) {
        console.log(`[activate-device] Device limit reached for user ${user.id} on license ${best.id}: ${activeCount}/${best.deviceLimit}`);
        return jsonResponse({
          allowed: false,
          error: "Device limit reached. Deactivate an existing device from your dashboard to continue.",
          code: "device_limit_reached",
          deviceLimit: best.deviceLimit,
          activeDevices: activeCount || 0,
        }, 403);
      }

      // Reactivate
      await supabaseAdmin
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

      console.log(`[activate-device] Reactivated device ${existingActivation.id} for user ${user.id}`);

      return jsonResponse({
        allowed: true,
        licenseId: best.id,
        productKey: best.productKey,
        deviceLimit: best.deviceLimit,
        activeDevices: (activeCount || 0) + 1,
        offlineGraceUntil,
        activationId: existingActivation.id,
      });
    }

    // 9. New device — check slot availability
    const { count: currentActive } = await supabaseAdmin
      .from("device_activations")
      .select("id", { count: "exact", head: true })
      .eq("license_id", best.id)
      .eq("status", "active");

    if ((currentActive || 0) >= best.deviceLimit) {
      console.log(`[activate-device] Device limit reached for user ${user.id} on license ${best.id}: ${currentActive}/${best.deviceLimit}`);
      return jsonResponse({
        allowed: false,
        error: "Device limit reached. Deactivate an existing device from your dashboard to continue.",
        code: "device_limit_reached",
        deviceLimit: best.deviceLimit,
        activeDevices: currentActive || 0,
      }, 403);
    }

    // 10. Insert new activation
    const { data: newActivation, error: insertErr } = await supabaseAdmin
      .from("device_activations")
      .insert([{
        user_id: user.id,
        license_id: best.id,
        device_fingerprint: deviceFingerprint,
        device_label: deviceLabel || "Unknown Device",
        platform: platform || "unknown",
        app_version: appVersion || null,
        status: "active",
      }])
      .select("id")
      .single();

    if (insertErr) {
      // Handle unique constraint violation (race condition)
      if (insertErr.code === "23505") {
        console.log(`[activate-device] Race condition: device already exists. Retrying lookup.`);
        // Re-fetch and return
        const { data: raceActivation } = await supabaseAdmin
          .from("device_activations")
          .select("id, status")
          .eq("license_id", best.id)
          .eq("device_fingerprint", deviceFingerprint)
          .single();

        if (raceActivation?.status === "active") {
          return jsonResponse({
            allowed: true,
            licenseId: best.id,
            productKey: best.productKey,
            deviceLimit: best.deviceLimit,
            activeDevices: (currentActive || 0) + 1,
            offlineGraceUntil,
            activationId: raceActivation.id,
          });
        }
      }

      console.error("[activate-device] Insert failed:", insertErr);
      return jsonResponse({ allowed: false, error: "Failed to register device", code: "internal_error" }, 500);
    }

    console.log(`[activate-device] New device activated for user ${user.id}: ${newActivation.id} (${(currentActive || 0) + 1}/${best.deviceLimit})`);

    return jsonResponse({
      allowed: true,
      licenseId: best.id,
      productKey: best.productKey,
      deviceLimit: best.deviceLimit,
      activeDevices: (currentActive || 0) + 1,
      offlineGraceUntil,
      activationId: newActivation.id,
    });

  } catch (err: any) {
    console.error("[activate-device] Unhandled error:", err);
    return jsonResponse({ allowed: false, error: "Internal server error", code: "internal_error" }, 500);
  }
});
