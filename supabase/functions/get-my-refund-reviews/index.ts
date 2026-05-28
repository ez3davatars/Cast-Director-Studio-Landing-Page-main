// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  // 1. Handle preflight OPTIONS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2. Require authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Missing authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // 3. Connect using service role key internally
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid authorization token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Query public.refund_reviews where user_id = user.id
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
      return new Response(
        JSON.stringify({ error: "query_error", message: "Failed to retrieve refund reviews." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Return customer-safe reviews JSON response
    return new Response(
      JSON.stringify(reviews || []),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Refund Fatal] Crash in get-my-refund-reviews:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: "An unexpected architecture fault occurred." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
