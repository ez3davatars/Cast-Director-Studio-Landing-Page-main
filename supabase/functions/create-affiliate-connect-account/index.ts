// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function requireAdmin(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return { error: "Unauthorized", status: 401 };

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: "Unauthorized", status: 401 };
  if (user.app_metadata?.is_admin !== true) return { error: "Forbidden: admin only", status: 403 };

  return { supabaseAdmin, user };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    code: "STRIPE_CONNECT_NOT_ENABLED",
    error: "Stripe Connect affiliate account creation is scaffolded but disabled. No account was created.",
  }), {
    status: 501,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
