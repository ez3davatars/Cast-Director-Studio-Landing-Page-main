import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createDesktopReleaseR2Port } from "../_shared/desktopReleaseR2.ts";
import type { DesktopLicenseRecord } from "../_shared/desktopEntitlement.ts";
import {
  handleGetLatestDesktopRelease,
  type CurrentDesktopReleaseRow,
} from "./handler.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseAdmin = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const r2 = createDesktopReleaseR2Port();

serve((request) =>
  handleGetLatestDesktopRelease(request, {
    async getUser(token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },

    async listLicensesForUser(userId) {
      const { data, error } = await supabaseAdmin
        .from("licenses")
        .select(
          "id, license_name, license_key, status, device_limit, max_activations, products!inner(product_key, display_name)",
        )
        .eq("user_id", userId)
        .ilike("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as DesktopLicenseRecord[];
    },

    async getCurrentRelease({ platform, channel }) {
      const { data, error } = await supabaseAdmin
        .from("desktop_releases")
        .select("*")
        .eq("platform", platform)
        .eq("channel", channel)
        .eq("is_current", true)
        .maybeSingle();
      if (error) throw error;
      return (data as CurrentDesktopReleaseRow | null) ?? null;
    },

    presignGet: (input) => r2.presignGet(input),
  })
);
