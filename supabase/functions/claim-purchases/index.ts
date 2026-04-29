// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * claim-purchases
 *
 * Links pending guest purchases (orders, licenses, subscriptions, contacts, downloads)
 * to the authenticated user by matching on lowercased email where user_id is null.
 *
 * Should be called:
 * - After signup
 * - After login
 * - On AccountDashboard mount (safety net)
 *
 * Returns: { claimed: { orders, licenses, subscriptions, contacts, downloads } }
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the caller
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user || !user.email) {
      return new Response(JSON.stringify({ error: "Unauthorized", code: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Initialize Service Role client for cross-table updates
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const email = user.email.toLowerCase();
    const userId = user.id;

    const claimed = {
      orders: 0,
      licenses: 0,
      subscriptions: 0,
      contacts: 0,
      downloads: 0,
    };

    // 3. Claim orphaned orders (matched by customer_email, user_id IS NULL)
    const { data: orphanOrders } = await supabaseAdmin
      .from("orders")
      .select("id")
      .ilike("customer_email", email)
      .is("user_id", null);

    if (orphanOrders && orphanOrders.length > 0) {
      const orderIds = orphanOrders.map((o: any) => o.id);
      const { count } = await supabaseAdmin
        .from("orders")
        .update({ user_id: userId })
        .in("id", orderIds)
        .select("id", { count: "exact", head: true });
      claimed.orders = count || orderIds.length;

      // 3b. Claim licenses linked to those orders
      const { count: licCount } = await supabaseAdmin
        .from("licenses")
        .update({ user_id: userId })
        .in("order_id", orderIds)
        .is("user_id", null)
        .select("id", { count: "exact", head: true });
      claimed.licenses = licCount || 0;

      // 3c. Claim downloads linked to those orders
      const { count: dlCount } = await supabaseAdmin
        .from("downloads")
        .update({ user_id: userId })
        .in("order_id", orderIds)
        .is("user_id", null)
        .select("id", { count: "exact", head: true });
      claimed.downloads = dlCount || 0;
    }

    // 4. Claim orphaned subscriptions (matched by customer email via Stripe customer lookup)
    //    Subscriptions may not have customer_email directly, so we also check via contacts
    const { data: orphanSubs } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .is("user_id", null);

    if (orphanSubs && orphanSubs.length > 0) {
      // Match subs whose stripe_customer_id maps to a contact with this email
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("stripe_customer_id")
        .ilike("email", email)
        .maybeSingle();

      if (contact?.stripe_customer_id) {
        const { count: subCount } = await supabaseAdmin
          .from("subscriptions")
          .update({ user_id: userId })
          .eq("stripe_customer_id", contact.stripe_customer_id)
          .is("user_id", null)
          .select("id", { count: "exact", head: true });
        claimed.subscriptions = subCount || 0;
      }
    }

    // 5. Claim/update contact record
    const { data: existingContact } = await supabaseAdmin
      .from("contacts")
      .select("id, user_id")
      .ilike("email", email)
      .maybeSingle();

    if (existingContact && !existingContact.user_id) {
      await supabaseAdmin
        .from("contacts")
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", existingContact.id);
      claimed.contacts = 1;
    } else if (!existingContact) {
      // No contact record exists — create one to ensure future linkage
      await supabaseAdmin
        .from("contacts")
        .insert([{ email, user_id: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
      claimed.contacts = 1;
    }

    const totalClaimed = Object.values(claimed).reduce((a, b) => a + b, 0);
    console.log(`[claim-purchases] User ${userId} (${email}): claimed ${totalClaimed} records`, claimed);

    return new Response(JSON.stringify({ success: true, claimed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[claim-purchases] Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
