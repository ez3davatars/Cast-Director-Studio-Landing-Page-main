// @ts-nocheck: external Deno and ESM modules
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
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
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    // 2. Admin client for full queries
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 3. Query active licenses for this user
    const { data: licenses, error: licErr } = await supabaseAdmin
      .from("licenses")
      .select("id, license_name, license_key, status, device_limit, max_activations, products!inner(product_key, display_name)")
      .eq("user_id", user.id)
      .ilike("status", "active");

    if (licErr) {
      console.error("[get-my-desktop-licenses] Query failed:", licErr);
      return jsonResponse({ error: "Failed to query licenses" }, 500);
    }

    const desktopProductKeys = ["indie_desktop_byok", "agency_desktop_byok", "agency_commercial_byok"];

    // 4. Map licenses and fetch active device counts
    const safeLicenses = [];
    if (licenses) {
      for (const lic of licenses) {
        const productKey = lic.products?.product_key || "";
        if (!desktopProductKeys.includes(productKey)) {
          continue;
        }

        // Count active devices for this license
        const { count: activeDeviceCount, error: countErr } = await supabaseAdmin
          .from("device_activations")
          .select("id", { count: "exact", head: true })
          .eq("license_id", lic.id)
          .eq("status", "active");

        if (countErr) {
          console.warn(`[get-my-desktop-licenses] Failed to count devices for license ${lic.id}:`, countErr);
        }

        // Get key suffix safely
        let licenseKeySuffix = "";
        const rawKey = lic.license_key || "";
        if (rawKey.length > 8) {
          licenseKeySuffix = `...${rawKey.slice(-8)}`;
        } else if (rawKey.length > 0) {
          licenseKeySuffix = rawKey;
        }

        const activationLimit = lic.max_activations ?? lic.device_limit ?? 2;

        safeLicenses.push({
          id: lic.id,
          productKey,
          displayName: lic.license_name || lic.products?.display_name || "Desktop License",
          licenseKeySuffix,
          activationLimit,
          activeDeviceCount: activeDeviceCount || 0
        });
      }
    }

    return jsonResponse({ licenses: safeLicenses });

  } catch (err: any) {
    console.error("[get-my-desktop-licenses] Unhandled error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
