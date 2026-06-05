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
      return jsonResponse({ error: "unauthorized", message: "Missing authorization header." }, 401);
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
      return jsonResponse({ error: "unauthorized", message: "Invalid or expired token." }, 401);
    }

    // 2. Admin client for full queries
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 3. Query customer-safe refund reviews where user_id = user.id
    const { data: reviews, error: queryError } = await supabaseAdmin
      .from("refund_reviews")
      .select(`
        id,
        status,
        created_at,
        reviewed_at,
        completed_at,
        plan_key,
        credits_used,
        used_credit_cost_cents,
        refundable_amount_cents,
        remaining_credits_to_revoke,
        reason,
        customer_message
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (queryError) {
      console.error("[Refund] Error querying refund reviews:", queryError);
      return jsonResponse({ error: "query_error", message: "Failed to retrieve refund reviews." }, 500);
    }

    // 4. Return customer-safe reviews JSON response
    return jsonResponse(reviews || []);

  } catch (error: any) {
    console.error("[Refund Fatal] Crash in get-my-refund-reviews:", error);
    return jsonResponse({ error: "internal_error", message: "An unexpected architecture fault occurred." }, 500);
  }
});
