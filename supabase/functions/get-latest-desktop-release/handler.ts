import {
  isEntitledDesktopLicense,
  type DesktopLicenseRecord,
} from "../_shared/desktopEntitlement.ts";
import {
  DESKTOP_CHANNEL,
  DESKTOP_PLATFORM,
} from "../_shared/desktopReleases.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export interface LatestReleaseUser {
  id: string;
}

export interface CurrentDesktopReleaseRow {
  id: string;
  platform: string;
  channel: string;
  version: string;
  object_key: string;
  filename: string;
  sha256: string;
  file_size: number;
  content_type: string;
  release_notes: string | null;
  published_at: string | null;
  is_current: boolean;
}

export interface GetLatestDesktopReleaseDeps {
  getUser(token: string): Promise<LatestReleaseUser | null>;
  listLicensesForUser(userId: string): Promise<DesktopLicenseRecord[]>;
  getCurrentRelease(input: {
    platform: string;
    channel: string;
  }): Promise<CurrentDesktopReleaseRow | null>;
  presignGet(input: {
    objectKey: string;
    filename: string;
    contentType: string;
  }): Promise<{ url: string; expiresInSeconds: number }>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export async function handleGetLatestDesktopRelease(
  request: Request,
  deps: GetLatestDesktopReleaseDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    const token = getBearerToken(request);
    if (!token) {
      return json(401, { error: "unauthorized" });
    }

    const user = await deps.getUser(token);
    if (!user) {
      return json(401, { error: "unauthorized" });
    }

    const licenses = await deps.listLicensesForUser(user.id);
    if (!licenses.some(isEntitledDesktopLicense)) {
      return json(403, { error: "no_desktop_entitlement" });
    }

    const release = await deps.getCurrentRelease({
      platform: DESKTOP_PLATFORM,
      channel: DESKTOP_CHANNEL,
    });
    if (!release) {
      return json(404, { error: "no_release_available" });
    }

    const signed = await deps.presignGet({
      objectKey: release.object_key,
      filename: release.filename,
      contentType: release.content_type,
    });

    return json(200, {
      version: release.version,
      filename: release.filename,
      sha256: release.sha256,
      fileSize: Number(release.file_size),
      contentType: release.content_type,
      releaseNotes: release.release_notes,
      publishedAt: release.published_at,
      downloadUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
    });
  } catch (error) {
    console.error("get-latest-desktop-release failed", error);
    return json(500, { error: "internal_error" });
  }
}
