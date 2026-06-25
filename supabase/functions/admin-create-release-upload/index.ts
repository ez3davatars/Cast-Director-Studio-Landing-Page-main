import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createDesktopReleaseR2Port } from "../_shared/desktopReleaseR2.ts";
import {
  handleAdminCreateReleaseUpload,
  type DesktopReleaseRow,
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
  handleAdminCreateReleaseUpload(request, {
    async getUser(token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        app_metadata: data.user.app_metadata,
      };
    },

    async findReleaseByVersion({ platform, channel, version }) {
      const { data, error } = await supabaseAdmin
        .from("desktop_releases")
        .select("*")
        .eq("platform", platform)
        .eq("channel", channel)
        .eq("version", version)
        .maybeSingle();
      if (error) throw error;
      return (data as DesktopReleaseRow | null) ?? null;
    },

    async insertDraft(input) {
      const { data, error } = await supabaseAdmin
        .from("desktop_releases")
        .insert(input)
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          const { data: existing, error: lookupError } = await supabaseAdmin
            .from("desktop_releases")
            .select("*")
            .eq("platform", input.platform)
            .eq("channel", input.channel)
            .eq("version", input.version)
            .single();
          if (lookupError) throw lookupError;
          return existing as DesktopReleaseRow;
        }
        throw error;
      }
      return data as DesktopReleaseRow;
    },

    headObject: (objectKey) => r2.headObject(objectKey),
    presignPut: (input) => r2.presignPut(input),
  })
);
