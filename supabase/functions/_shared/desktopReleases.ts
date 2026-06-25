/**
 * Pure desktop-release contract helpers shared by Supabase Edge Functions and
 * website unit tests. This module has no Deno globals, environment access, I/O,
 * or remote imports.
 */

export const DESKTOP_PLATFORM = 'windows' as const;
export const DESKTOP_CHANNEL = 'stable' as const;
export const DEFAULT_CONTENT_TYPE = 'application/octet-stream' as const;
export const MAX_INSTALLER_SIZE_BYTES = 2_147_483_648;
export const OBJECT_KEY_PREFIX = 'installers' as const;

export const ALLOWED_CONTENT_TYPES = [
  'application/octet-stream',
  'application/x-msdownload',
  'application/vnd.microsoft.portable-executable',
] as const;

export const VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export interface DesktopReleaseInput {
  version?: unknown;
  sha256?: unknown;
  fileSize?: unknown;
  contentType?: unknown;
  filename?: unknown;
  objectKey?: unknown;
}

export interface CanonicalDesktopRelease {
  platform: typeof DESKTOP_PLATFORM;
  channel: typeof DESKTOP_CHANNEL;
  version: string;
  filename: string;
  objectKey: string;
  sha256: string;
  fileSize: number;
  contentType: AllowedContentType;
}

export type DesktopReleaseValidationResult =
  | { ok: true; value: CanonicalDesktopRelease }
  | { ok: false; errors: string[] };

export function isValidVersion(version: unknown): version is string {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

export function isValidSha256(sha256: unknown): sha256 is string {
  return typeof sha256 === 'string' && SHA256_PATTERN.test(sha256);
}

export function isValidFileSize(fileSize: unknown): fileSize is number {
  return (
    typeof fileSize === 'number' &&
    Number.isInteger(fileSize) &&
    fileSize > 0 &&
    fileSize <= MAX_INSTALLER_SIZE_BYTES
  );
}

export function isAllowedContentType(
  contentType: unknown,
): contentType is AllowedContentType {
  return (
    typeof contentType === 'string' &&
    (ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType)
  );
}

export function buildInstallerFilename(version: string): string {
  if (!isValidVersion(version)) {
    throw new RangeError(
      `Invalid desktop release version: ${JSON.stringify(version)}`,
    );
  }

  return `Cast Director Studio Setup ${version}.exe`;
}

export function buildInstallerObjectKey(version: string): string {
  const filename = buildInstallerFilename(version);
  return `${OBJECT_KEY_PREFIX}/${DESKTOP_PLATFORM}/${version}/${filename}`;
}

export function isCanonicalInstallerFilename(
  filename: unknown,
  version: unknown,
): boolean {
  return (
    typeof filename === 'string' &&
    isValidVersion(version) &&
    filename === buildInstallerFilename(version)
  );
}

export function isCanonicalObjectKey(
  objectKey: unknown,
  version: unknown,
): boolean {
  return (
    typeof objectKey === 'string' &&
    isValidVersion(version) &&
    objectKey === buildInstallerObjectKey(version)
  );
}

/**
 * Validates untrusted release metadata and derives the immutable filename and
 * object key server-side. Caller-supplied paths are accepted only when they
 * exactly equal the canonical values.
 */
export function validateDesktopReleaseInput(
  input: unknown,
): DesktopReleaseValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['input must be an object'] };
  }

  const candidate = input as DesktopReleaseInput;
  const errors: string[] = [];
  const contentType =
    candidate.contentType === undefined
      ? DEFAULT_CONTENT_TYPE
      : candidate.contentType;

  if (!isValidVersion(candidate.version)) {
    errors.push(
      'version must be strict MAJOR.MINOR.PATCH with no leading zeros',
    );
  }

  if (!isValidSha256(candidate.sha256)) {
    errors.push('sha256 must be a lowercase 64-character hex digest');
  }

  if (!isValidFileSize(candidate.fileSize)) {
    errors.push(
      `fileSize must be an integer from 1 through ${MAX_INSTALLER_SIZE_BYTES}`,
    );
  }

  if (!isAllowedContentType(contentType)) {
    errors.push('contentType is not in the allowed Windows installer list');
  }

  if (isValidVersion(candidate.version)) {
    if (
      candidate.filename !== undefined &&
      !isCanonicalInstallerFilename(candidate.filename, candidate.version)
    ) {
      errors.push('filename does not match the canonical installer filename');
    }

    if (
      candidate.objectKey !== undefined &&
      !isCanonicalObjectKey(candidate.objectKey, candidate.version)
    ) {
      errors.push('objectKey does not match the canonical installer object key');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const version = candidate.version as string;
  const sha256 = candidate.sha256 as string;
  const fileSize = candidate.fileSize as number;
  const validatedContentType = contentType as AllowedContentType;

  return {
    ok: true,
    value: {
      platform: DESKTOP_PLATFORM,
      channel: DESKTOP_CHANNEL,
      version,
      filename: buildInstallerFilename(version),
      objectKey: buildInstallerObjectKey(version),
      sha256,
      fileSize,
      contentType: validatedContentType,
    },
  };
}
