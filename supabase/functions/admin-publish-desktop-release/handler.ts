const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PublishAdminUser {
  id: string;
  app_metadata?: Record<string, unknown> | null;
}

export interface DesktopReleaseRow {
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
  created_by: string | null;
  created_at: string;
  published_at: string | null;
  is_current: boolean;
}

export interface PublishObjectHead {
  contentLength: number | null;
  contentType: string | null;
  sha256: string | null;
  etag?: string | null;
}

export interface PublishDesktopReleaseDeps {
  getUser(token: string): Promise<PublishAdminUser | null>;
  getReleaseById(releaseId: string): Promise<DesktopReleaseRow | null>;
  updateReleaseNotes(
    releaseId: string,
    releaseNotes: string | null,
  ): Promise<void>;
  promoteRelease(releaseId: string): Promise<void>;
  headObject(objectKey: string): Promise<PublishObjectHead | null>;
}

interface PublishBody {
  releaseId?: unknown;
  releaseNotes?: unknown;
  objectKey?: unknown;
  object_key?: unknown;
  filename?: unknown;
  fileSize?: unknown;
  file_size?: unknown;
  sha256?: unknown;
  platform?: unknown;
  channel?: unknown;
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

function normalizeContentType(value: string | null): string | null {
  return value?.split(";", 1)[0].trim().toLowerCase() || null;
}

function toResponse(row: DesktopReleaseRow): Record<string, unknown> {
  return {
    releaseId: row.id,
    version: row.version,
    platform: row.platform,
    channel: row.channel,
    filename: row.filename,
    objectKey: row.object_key,
    sha256: row.sha256,
    fileSize: Number(row.file_size),
    contentType: row.content_type,
    releaseNotes: row.release_notes,
    isCurrent: row.is_current,
    publishedAt: row.published_at,
  };
}

export async function handleAdminPublishDesktopRelease(
  request: Request,
  deps: PublishDesktopReleaseDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
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
    if (user.app_metadata?.is_admin !== true) {
      return json(403, { error: "forbidden" });
    }

    let body: PublishBody;
    try {
      body = (await request.json()) as PublishBody;
    } catch {
      return json(400, { error: "invalid_json" });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(400, { error: "validation_failed" });
    }

    const forbiddenFields = [
      "objectKey",
      "object_key",
      "filename",
      "fileSize",
      "file_size",
      "sha256",
      "platform",
      "channel",
    ] as const;
    const suppliedForbidden = forbiddenFields.filter(
      (field) => Object.prototype.hasOwnProperty.call(body, field),
    );
    if (suppliedForbidden.length > 0) {
      return json(400, {
        error: "forbidden_fields",
        fields: suppliedForbidden,
      });
    }

    if (typeof body.releaseId !== "string" || !UUID_PATTERN.test(body.releaseId)) {
      return json(400, { error: "invalid_release_id" });
    }

    if (
      body.releaseNotes !== undefined &&
      body.releaseNotes !== null &&
      (typeof body.releaseNotes !== "string" || body.releaseNotes.length > 10_000)
    ) {
      return json(400, { error: "invalid_release_notes" });
    }

    let row = await deps.getReleaseById(body.releaseId);
    if (!row) {
      return json(404, { error: "release_not_found" });
    }

    const head = await deps.headObject(row.object_key);
    if (!head) {
      return json(409, { error: "object_missing" });
    }
    if (head.contentLength !== Number(row.file_size)) {
      return json(409, { error: "file_size_mismatch" });
    }
    if (!head.sha256) {
      return json(409, { error: "sha_metadata_missing" });
    }
    if (head.sha256 !== row.sha256) {
      return json(409, { error: "sha_mismatch" });
    }
    if (
      normalizeContentType(head.contentType) !==
      normalizeContentType(row.content_type)
    ) {
      return json(409, { error: "content_type_mismatch" });
    }

    if (body.releaseNotes !== undefined) {
      await deps.updateReleaseNotes(
        row.id,
        typeof body.releaseNotes === "string" ? body.releaseNotes : null,
      );
    }

    await deps.promoteRelease(row.id);

    row = (await deps.getReleaseById(row.id)) ?? {
      ...row,
      release_notes:
        body.releaseNotes === undefined
          ? row.release_notes
          : typeof body.releaseNotes === "string"
            ? body.releaseNotes
            : null,
      is_current: true,
      published_at: row.published_at ?? new Date().toISOString(),
    };

    return json(200, toResponse(row));
  } catch (error) {
    console.error("admin-publish-desktop-release failed", error);
    return json(500, { error: "internal_error" });
  }
}
