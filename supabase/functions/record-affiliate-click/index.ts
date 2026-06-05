// @ts-nocheck: Supabase Edge Function uses external runtime SDK types validated at deployment/runtime.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ──────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ──────────────────────────────────────────────────
// IP Anonymization
// Zero out the last octet of IPv4; keep the /64
// prefix of IPv6. This is the minimum we store.
// ──────────────────────────────────────────────────

function anonymizeIp(ip: string): string {
  // IPv4 — zero the last octet: 203.0.113.42 → 203.0.113.0
  const ipv4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (ipv4) return `${ipv4[1]}.0`;

  // IPv6 — keep the first 4 groups (64-bit network prefix)
  const parts = ip.split(":");
  if (parts.length >= 4) {
    return parts.slice(0, 4).join(":") + ":0:0:0:0";
  }

  return ip; // Unrecognised format — store as-is
}

// ──────────────────────────────────────────────────
// Main Handler
// ──────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── 1. Parse link_code ──
  // Accepts POST { link_code } or GET ?ref=<code>
  let linkCode: string | null = null;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      linkCode = body.link_code ?? body.ref ?? null;
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }
  } else if (req.method === "GET") {
    const url = new URL(req.url);
    linkCode = url.searchParams.get("ref") ?? url.searchParams.get("link_code");
  } else {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!linkCode || typeof linkCode !== "string" || linkCode.trim().length === 0) {
    return json({ error: "Missing link_code." }, 400);
  }

  const code = linkCode.trim().toLowerCase();

  // ── 2. DB client (service role — bypasses RLS for writes) ──
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // ── 3. Look up the link ──
    const { data: link, error: linkErr } = await supabaseAdmin
      .from("affiliate_links")
      .select("id, affiliate_id, destination_url")
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (linkErr || !link) {
      // Return 404 without exposing DB error details
      return json({ error: "Affiliate link not found." }, 404);
    }

    // ── 4. Look up the affiliate (must be active) ──
    const { data: affiliate, error: affErr } = await supabaseAdmin
      .from("affiliates")
      .select("id, status, attribution_window_days")
      .eq("id", link.affiliate_id)
      .eq("status", "active")
      .maybeSingle();

    if (affErr || !affiliate) {
      // Affiliate suspended or deleted — treat link as invalid
      return json({ error: "Affiliate link not found." }, 404);
    }

    // ── 5. Generate opaque session token ──
    // This is the only value stored in the browser cookie.
    // It reveals nothing about the affiliate, program, or partner.
    const sessionToken = crypto.randomUUID();

    // ── 6. Compute attribution window expiry ──
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + affiliate.attribution_window_days);

    // ── 7. Capture minimal visitor context ──
    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ??
      null;
    const visitorIp = rawIp ? anonymizeIp(rawIp) : null;
    const referrer   = req.headers.get("referer") ?? null;
    const userAgent  = req.headers.get("user-agent") ?? null;

    // ── 8. Insert affiliate_clicks row ──
    const { error: clickErr } = await supabaseAdmin
      .from("affiliate_clicks")
      .insert([{
        link_id:       link.id,
        affiliate_id:  affiliate.id,
        session_token: sessionToken,
        visitor_ip:    visitorIp,
        referrer:      referrer,
        user_agent:    userAgent,
        expires_at:    expiresAt.toISOString(),
      }]);

    if (clickErr) {
      // If the token collides (astronomically unlikely), log and continue.
      // The token won't be in the DB so attribution will quietly fail at
      // checkout — which is better than blocking the visitor's journey.
      console.error("[AffiliateClick] Failed to insert click row:", clickErr);
    }

    // ── 9. Atomic click counter increment (best-effort) ──
    try {
      await supabaseAdmin.rpc("increment_affiliate_link_clicks", {
        p_link_id: link.id,
      });
    } catch (rpcErr) {
      // Non-fatal: counter inaccuracy is acceptable.
      console.warn("[AffiliateClick] Counter increment failed (non-fatal):", rpcErr);
    }

    // ── 10. Return session token and destination URL only ──
    // Never return affiliate_id, affiliate code, or any partner metadata.
    // The caller (frontend) should:
    //   1. Set document.cookie = `cds_ref=${session_token}; max-age=<seconds>; path=/; samesite=lax`
    //   2. Redirect to destination_url (or just store the cookie if already there)
    console.log(
      `[AffiliateClick] Click recorded. Link: ${link.id}, ` +
      `Expires: ${expiresAt.toISOString()}`
    );

    return json({
      session_token:   sessionToken,
      destination_url: link.destination_url,
      expires_at:      expiresAt.toISOString(),
    });

  } catch (err: any) {
    console.error("[AffiliateClick] Unexpected error:", err);
    return json({ error: "Internal server error." }, 500);
  }
});
