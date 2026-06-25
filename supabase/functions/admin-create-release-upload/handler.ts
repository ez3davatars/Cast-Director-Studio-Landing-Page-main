import {
  DESKTOP_CHANNEL,
  DESKTOP_PLATFORM,
  validateDesktopReleaseInput,
  type CanonicalDesktopRelease,
} from "../_shared/desktopReleases.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface ReleaseAdminUser {
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

export interface ReleaseObjectHead {
  contentLength: number | null;
  contentType: string | null;
  sha256: string | null;
  etag?: string | null;
}

export interface CreateReleaseUploadDeps {
  getUser(token: string): Promise<ReleaseAdminUser | null>;
  findReleaseByVersion(input: {
    platform: string;
    channel: string;
    version: string;
  }): Promise<DesktopReleaseRow | null>;
  insertDraft(input: {
    platform: string;
    channel: string;
    version: string;
    object_key: string;
    filename: string;
    sha256: string;
    file_size: number;
    content_type: string;
    release_notes: string | null;
    created_by: string;
  }): Promise<DesktopReleaseRow>;
  headObject(objectKey: string): Promise<ReleaseObjectHead | null>;
  presignPut(input: {
    objectKey: string;
    contentType: string;
    sha256: string;
  }): Promise<{
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresInSeconds: number;
  }>;
}

interface CreateReleaseBody {
  version?: unknown;
  sha256?: unknown;
  fileSize?: unknown;
  contentType?: unknown;
  releaseNotes?: unknown;
  platform?: unknown;
  channel?: unknown;
  filename?: unknown;
  objectKey?: unknown;
  object_key?: unknown;
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

function immutableValuesMatch(
  row: DesktopReleaseRow,
  release: CanonicalDesktopRelease,
): boolean {
  return (
    row.platform === release.platform &&
    row.channel === release.channel &&
    row.version === release.version &&
    row.object_key === release.objectKey &&
    row.filename === release.filename &&
    row.sha256 === release.sha256 &&
    Number(row.file_size) === release.fileSize &&
    normalizeContentType(row.content_type) === release.contentType
  );
}

function objectMatchesRelease(
  head: ReleaseObjectHead,
  release: CanonicalDesktopRelease,
): boolean {
  return (
    head.contentLength === release.fileSize &&
    head.sha256 === release.sha256 &&
    normalizeContentType(head.contentType) === release.contentType
  );
}

function releaseResponse(
  row: DesktopReleaseRow,
  uploadComplete: boolean,
  upload?: {
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresInSeconds: number;
  },
): Record<string, unknown> {
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
    uploadComplete,
    ...(upload ? { upload } : {}),
  };
}

export async function handleAdminCreateReleaseUpload(
  request: Request,
  deps: CreateReleaseUploadDeps,
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

    let body: CreateReleaseBody;
    try {
      body = (await request.json()) as CreateReleaseBody;
    } catch {
      return json(400, { error: "invalid_json" });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(400, { error: "validation_failed", errors: ["body must be an object"] });
    }

    const forbiddenFields = ["platform", "channel", "filename", "objectKey", "object_key"] as const;
    const suppliedForbidden = forbiddenFields.filter(
      (field) => Object.prototype.hasOwnProperty.call(body, field),
    );
    if (suppliedForbidden.length > 0) {
      return json(400, {
        error: "forbidden_fields",
        fields: suppliedForbidden,
      });
    }

    if (
      body.releaseNotes !== undefined &&
      body.releaseNotes !== null &&
      (typeof body.releaseNotes !== "string" || body.releaseNotes.length > 10_000)
    ) {
      return json(400, {
        error: "validation_failed",
        errors: ["releaseNotes must be a string no longer than 10000 characters"],
      });
    }

    const validation = validateDesktopReleaseInput({
      version: body.version,
      sha256: body.sha256,
      fileSize: body.fileSize,
      contentType: body.contentType,
    });
    if (validation.ok === false) {
      return json(400, {
        error: "validation_failed",
        errors: validation.errors,
      });
    }

    const release = validation.value;
    let row = await deps.findReleaseByVersion({
      platform: DESKTOP_PLATFORM,
      channel: DESKTOP_CHANNEL,
      version: release.version,
    });

    if (row && !immutableValuesMatch(row, release)) {
      return json(409, { error: "version_conflict" });
    }

    let head = await deps.headObject(release.objectKey);
    if (!row && head) {
      return json(409, { error: "orphaned_object" });
    }

    if (!row) {
      row = await deps.insertDraft({
        platform: release.platform,
        channel: release.channel,
        version: release.version,
        object_key: release.objectKey,
        filename: release.filename,
        sha256: release.sha256,
        file_size: release.fileSize,
        content_type: release.contentType,
        release_notes:
          typeof body.releaseNotes === "string" ? body.releaseNotes : null,
        created_by: user.id,
      });
      if (!immutableValuesMatch(row, release)) {
        return json(409, { error: "version_conflict" });
      }
      head = await deps.headObject(release.objectKey);
    }

    if (head) {
      if (!objectMatchesRelease(head, release)) {
        return json(409, { error: "object_mismatch" });
      }
      return json(200, releaseResponse(row, true));
    }

    const upload = await deps.presignPut({
      objectKey: release.objectKey,
      contentType: release.contentType,
      sha256: release.sha256,
    });

    return json(200, releaseResponse(row, false, upload));
  } catch (error) {
    console.error("admin-create-release-upload failed", error);
    return json(500, { error: "internal_error" });
  }
}
