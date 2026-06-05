// @ts-nocheck: external Deno and ESM modules
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header", code: "unauthorized" }, 401);
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
      return jsonResponse({ error: "Invalid or expired token", code: "unauthorized" }, 401);
    }

    // 2. Parse request body
    const { activationId } = await req.json();

    if (!activationId) {
      return jsonResponse({ error: "Missing activationId", code: "bad_request" }, 400);
    }

    // 3. Admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 4. Verify activation belongs to this user and is currently active
    const { data: activation, error: fetchErr } = await supabaseAdmin
      .from("device_activations")
      .select("id, user_id, license_id, device_fingerprint, device_label, platform, status")
      .eq("id", activationId)
      .single();

    if (fetchErr || !activation) {
      return jsonResponse({ error: "Device activation not found", code: "not_found" }, 404);
    }

    if (activation.user_id !== user.id) {
      console.warn(`[deactivate-device] User ${user.id} attempted to deactivate device ${activationId} owned by ${activation.user_id}`);
      return jsonResponse({ error: "You do not own this device activation", code: "forbidden" }, 403);
    }

    if (activation.status !== "active") {
      return jsonResponse({ error: "Device is already deactivated", code: "already_deactivated" }, 409);
    }

    // 5. Soft-deactivate (preserve audit trail)
    const now = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from("device_activations")
      .update({
        status: "deactivated",
        deactivated_at: now,
        deactivation_source: "self_service",
      })
      .eq("id", activationId);

    if (updateErr) {
      console.error("[deactivate-device] Update failed:", updateErr);
      return jsonResponse({ error: "Failed to deactivate device", code: "internal_error" }, 500);
    }

    // 6. Count remaining active devices for this license
    const { count: remainingActive } = await supabaseAdmin
      .from("device_activations")
      .select("id", { count: "exact", head: true })
      .eq("license_id", activation.license_id)
      .eq("status", "active");

    console.log(`[deactivate-device] User ${user.id} deactivated device ${activationId} (${activation.device_label || "unknown"}). Remaining active: ${remainingActive || 0}`);

    return jsonResponse({
      success: true,
      deactivatedId: activationId,
      deviceLabel: activation.device_label,
      remainingActiveDevices: remainingActive || 0,
    });

  } catch (err: any) {
    console.error("[deactivate-device] Unhandled error:", err);
    return jsonResponse({ error: "Internal server error", code: "internal_error" }, 500);
  }
});
