import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createDesktopReleaseR2Port } from "../_shared/desktopReleaseR2.ts";
import {
  handleAdminPublishDesktopRelease,
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
  handleAdminPublishDesktopRelease(request, {
    async getUser(token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        app_metadata: data.user.app_metadata,
      };
    },

    async getReleaseById(releaseId) {
      const { data, error } = await supabaseAdmin
        .from("desktop_releases")
        .select("*")
        .eq("id", releaseId)
        .maybeSingle();
      if (error) throw error;
      return (data as DesktopReleaseRow | null) ?? null;
    },

    async updateReleaseNotes(releaseId, releaseNotes) {
      const { error } = await supabaseAdmin
        .from("desktop_releases")
        .update({ release_notes: releaseNotes })
        .eq("id", releaseId);
      if (error) throw error;
    },

    async promoteRelease(releaseId) {
      const { error } = await supabaseAdmin.rpc("promote_desktop_release", {
        p_release_id: releaseId,
      });
      if (error) throw error;
    },

    headObject: (objectKey) => r2.headObject(objectKey),
  })
);
