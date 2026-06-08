// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  return new Response(JSON.stringify({
    code: "STRIPE_CONNECT_WEBHOOK_DISABLED",
    error: "Stripe Connect webhook handling is scaffolded but disabled. No payout records were changed.",
  }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
});
