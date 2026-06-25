import { describe, expect, it, vi } from 'vitest';
import {
  handleAdminCreateReleaseUpload,
  type CreateReleaseUploadDeps,
  type DesktopReleaseRow as CreateRow,
} from '../supabase/functions/admin-create-release-upload/handler';
import {
  handleAdminPublishDesktopRelease,
  type DesktopReleaseRow as PublishRow,
  type PublishDesktopReleaseDeps,
} from '../supabase/functions/admin-publish-desktop-release/handler';
import {
  handleGetLatestDesktopRelease,
  type CurrentDesktopReleaseRow,
  type GetLatestDesktopReleaseDeps,
} from '../supabase/functions/get-latest-desktop-release/handler';
import type { DesktopLicenseRecord } from '../supabase/functions/_shared/desktopEntitlement';

const SHA = 'a'.repeat(64);
const OTHER_SHA = 'b'.repeat(64);
const VERSION = '1.2.3';
const RELEASE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OBJECT_KEY =
  'installers/windows/1.2.3/Cast Director Studio Setup 1.2.3.exe';
const FILENAME = 'Cast Director Studio Setup 1.2.3.exe';

function request(
  body?: unknown,
  token = 'token',
  method = 'POST',
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request('https://example.test/function', {
    method,
    headers,
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  });
}

async function payload(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

function createRow(overrides: Partial<CreateRow> = {}): CreateRow {
  return {
    id: RELEASE_ID,
    platform: 'windows',
    channel: 'stable',
    version: VERSION,
    object_key: OBJECT_KEY,
    filename: FILENAME,
    sha256: SHA,
    file_size: 123,
    content_type: 'application/octet-stream',
    release_notes: null,
    created_by: USER_ID,
    created_at: '2026-06-25T00:00:00.000Z',
    published_at: null,
    is_current: false,
    ...overrides,
  };
}

function createDeps(
  overrides: Partial<CreateReleaseUploadDeps> = {},
): CreateReleaseUploadDeps {
  return {
    getUser: vi.fn(async () => ({
      id: USER_ID,
      app_metadata: { is_admin: true },
    })),
    findReleaseByVersion: vi.fn(async () => null),
    insertDraft: vi.fn(async (input) =>
      createRow({
        platform: input.platform,
        channel: input.channel,
        version: input.version,
        object_key: input.object_key,
        filename: input.filename,
        sha256: input.sha256,
        file_size: input.file_size,
        content_type: input.content_type,
        release_notes: input.release_notes,
        created_by: input.created_by,
      }),
    ),
    headObject: vi.fn(async () => null),
    presignPut: vi.fn(async ({ contentType, sha256 }) => ({
      url: 'https://upload.example/signed',
      method: 'PUT' as const,
      headers: {
        'Content-Type': contentType,
        'x-amz-meta-sha256': sha256,
      },
      expiresInSeconds: 3600,
    })),
    ...overrides,
  };
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    version: VERSION,
    sha256: SHA,
    fileSize: 123,
    contentType: 'application/octet-stream',
    ...overrides,
  };
}

function publishRow(overrides: Partial<PublishRow> = {}): PublishRow {
  return { ...createRow(), ...overrides };
}

function publishDeps(
  overrides: Partial<PublishDesktopReleaseDeps> = {},
): PublishDesktopReleaseDeps {
  let row = publishRow();
  return {
    getUser: vi.fn(async () => ({
      id: USER_ID,
      app_metadata: { is_admin: true },
    })),
    getReleaseById: vi.fn(async () => row),
    updateReleaseNotes: vi.fn(async (_id, notes) => {
      row = { ...row, release_notes: notes };
    }),
    promoteRelease: vi.fn(async () => {
      row = {
        ...row,
        is_current: true,
        published_at: row.published_at ?? '2026-06-25T01:00:00.000Z',
      };
    }),
    headObject: vi.fn(async () => ({
      contentLength: 123,
      contentType: 'application/octet-stream',
      sha256: SHA,
      etag: 'not-a-sha',
    })),
    ...overrides,
  };
}

function license(overrides: Partial<DesktopLicenseRecord> = {}): DesktopLicenseRecord {
  return {
    id: 'license-1',
    status: 'active',
    license_key: 'KEY-1234567890',
    products: {
      product_key: 'indie_desktop_byok',
      display_name: 'Indie Desktop',
    },
    ...overrides,
  };
}

function currentRelease(
  overrides: Partial<CurrentDesktopReleaseRow> = {},
): CurrentDesktopReleaseRow {
  return {
    id: RELEASE_ID,
    platform: 'windows',
    channel: 'stable',
    version: VERSION,
    object_key: OBJECT_KEY,
    filename: FILENAME,
    sha256: SHA,
    file_size: 123,
    content_type: 'application/octet-stream',
    release_notes: 'Release notes',
    published_at: '2026-06-25T01:00:00.000Z',
    is_current: true,
    ...overrides,
  };
}

function latestDeps(
  overrides: Partial<GetLatestDesktopReleaseDeps> = {},
): GetLatestDesktopReleaseDeps {
  return {
    getUser: vi.fn(async () => ({ id: USER_ID })),
    listLicensesForUser: vi.fn(async () => [license()]),
    getCurrentRelease: vi.fn(async () => currentRelease()),
    presignGet: vi.fn(async () => ({
      url: 'https://download.example/signed-1',
      expiresInSeconds: 300,
    })),
    ...overrides,
  };
}

describe('admin-create-release-upload handler', () => {
  it('answers CORS preflight without dependencies', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(undefined, '', 'OPTIONS'),
      createDeps(),
    );
    expect(response.status).toBe(200);
  });

  it('rejects missing authentication', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody(), ''),
      createDeps(),
    );
    expect(response.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      createDeps({ getUser: vi.fn(async () => null) }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects a non-admin user', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      createDeps({
        getUser: vi.fn(async () => ({ id: USER_ID, app_metadata: {} })),
      }),
    );
    expect(response.status).toBe(403);
  });

  it.each([
    ['invalid semver', { version: 'v1.2.3' }],
    ['uppercase hash', { sha256: 'A'.repeat(64) }],
    ['zero size', { fileSize: 0 }],
    ['negative size', { fileSize: -1 }],
    ['fractional size', { fileSize: 1.5 }],
    ['excessive size', { fileSize: 2_147_483_649 }],
    ['bad content type', { contentType: 'application/zip' }],
  ])('rejects %s', async (_label, override) => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody(override)),
      createDeps(),
    );
    expect(response.status).toBe(400);
    expect((await payload(response)).error).toBe('validation_failed');
  });

  it('rejects caller-controlled path and platform fields', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody({ objectKey: '../evil.exe', platform: 'linux' })),
      createDeps(),
    );
    expect(response.status).toBe(400);
    expect((await payload(response)).error).toBe('forbidden_fields');
  });

  it('derives the canonical filename/object key and issues a bound PUT URL', async () => {
    const deps = createDeps();
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody({ releaseNotes: 'Notes' })),
      deps,
    );
    const body = await payload(response);
    expect(response.status).toBe(200);
    expect(body.filename).toBe(FILENAME);
    expect(body.objectKey).toBe(OBJECT_KEY);
    expect(body.uploadComplete).toBe(false);
    expect(body.upload.method).toBe('PUT');
    expect(body.upload.headers).toEqual({
      'Content-Type': 'application/octet-stream',
      'x-amz-meta-sha256': SHA,
    });
    expect(deps.insertDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'windows',
        channel: 'stable',
        object_key: OBJECT_KEY,
        filename: FILENAME,
        created_by: USER_ID,
      }),
    );
  });

  it('reuses a matching draft and issues a fresh URL when the object is absent', async () => {
    const deps = createDeps({
      findReleaseByVersion: vi.fn(async () => createRow()),
    });
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.insertDraft).not.toHaveBeenCalled();
    expect(deps.presignPut).toHaveBeenCalledTimes(1);
  });

  it('returns uploadComplete for a matching existing object', async () => {
    const deps = createDeps({
      findReleaseByVersion: vi.fn(async () => createRow()),
      headObject: vi.fn(async () => ({
        contentLength: 123,
        contentType: 'application/octet-stream',
        sha256: SHA,
      })),
    });
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      deps,
    );
    const body = await payload(response);
    expect(body.uploadComplete).toBe(true);
    expect(body.upload).toBeUndefined();
    expect(deps.presignPut).not.toHaveBeenCalled();
  });

  it('rejects an existing version with different immutable metadata', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      createDeps({
        findReleaseByVersion: vi.fn(async () => createRow({ sha256: OTHER_SHA })),
      }),
    );
    expect(response.status).toBe(409);
    expect((await payload(response)).error).toBe('version_conflict');
  });

  it('rejects an orphaned immutable object', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      createDeps({
        headObject: vi.fn(async () => ({
          contentLength: 123,
          contentType: 'application/octet-stream',
          sha256: SHA,
        })),
      }),
    );
    expect(response.status).toBe(409);
    expect((await payload(response)).error).toBe('orphaned_object');
  });

  it('rejects a matching draft whose uploaded object metadata differs', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      createDeps({
        findReleaseByVersion: vi.fn(async () => createRow()),
        headObject: vi.fn(async () => ({
          contentLength: 999,
          contentType: 'application/octet-stream',
          sha256: SHA,
        })),
      }),
    );
    expect(response.status).toBe(409);
    expect((await payload(response)).error).toBe('object_mismatch');
  });

  it('does not return credential-shaped fields', async () => {
    const response = await handleAdminCreateReleaseUpload(
      request(validCreateBody()),
      createDeps(),
    );
    const text = JSON.stringify(await payload(response));
    expect(text).not.toMatch(/secretAccessKey|accessKeyId|service_role/i);
  });
});

describe('admin-publish-desktop-release handler', () => {
  it('rejects missing authentication', async () => {
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID }, ''),
      publishDeps(),
    );
    expect(response.status).toBe(401);
  });

  it('rejects a non-admin user', async () => {
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID }),
      publishDeps({
        getUser: vi.fn(async () => ({ id: USER_ID, app_metadata: {} })),
      }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects malformed UUIDs and caller-supplied object paths', async () => {
    const badId = await handleAdminPublishDesktopRelease(
      request({ releaseId: 'bad' }),
      publishDeps(),
    );
    expect(badId.status).toBe(400);

    const forbidden = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID, objectKey: '../evil.exe' }),
      publishDeps(),
    );
    expect((await payload(forbidden)).error).toBe('forbidden_fields');
  });

  it('returns release_not_found', async () => {
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID }),
      publishDeps({ getReleaseById: vi.fn(async () => null) }),
    );
    expect(response.status).toBe(404);
  });

  it.each([
    ['object_missing', null],
    [
      'file_size_mismatch',
      { contentLength: 999, contentType: 'application/octet-stream', sha256: SHA },
    ],
    [
      'sha_metadata_missing',
      { contentLength: 123, contentType: 'application/octet-stream', sha256: null },
    ],
    [
      'sha_mismatch',
      { contentLength: 123, contentType: 'application/octet-stream', sha256: OTHER_SHA },
    ],
    [
      'content_type_mismatch',
      { contentLength: 123, contentType: 'application/zip', sha256: SHA },
    ],
  ])('rejects %s', async (expectedError, head) => {
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID }),
      publishDeps({ headObject: vi.fn(async () => head) }),
    );
    expect(response.status).toBe(409);
    expect((await payload(response)).error).toBe(expectedError);
  });

  it('never treats ETag as SHA-256', async () => {
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID }),
      publishDeps({
        headObject: vi.fn(async () => ({
          contentLength: 123,
          contentType: 'application/octet-stream',
          sha256: null,
          etag: SHA,
        })),
      }),
    );
    expect((await payload(response)).error).toBe('sha_metadata_missing');
  });

  it('publishes successfully using only the promotion RPC dependency', async () => {
    const deps = publishDeps();
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID }),
      deps,
    );
    const body = await payload(response);
    expect(response.status).toBe(200);
    expect(body.isCurrent).toBe(true);
    expect(body.publishedAt).toBeTruthy();
    expect(deps.promoteRelease).toHaveBeenCalledWith(RELEASE_ID);
    expect(deps.updateReleaseNotes).not.toHaveBeenCalled();
  });

  it('updates optional notes and remains idempotent when already current', async () => {
    const deps = publishDeps({
      getReleaseById: vi.fn(async () =>
        publishRow({
          is_current: true,
          published_at: '2026-06-24T00:00:00.000Z',
          release_notes: 'Old',
        }),
      ),
    });
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID, releaseNotes: 'New' }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.updateReleaseNotes).toHaveBeenCalledWith(RELEASE_ID, 'New');
    expect(deps.promoteRelease).toHaveBeenCalledTimes(1);
  });

  it('does not return credentials', async () => {
    const response = await handleAdminPublishDesktopRelease(
      request({ releaseId: RELEASE_ID }),
      publishDeps(),
    );
    expect(JSON.stringify(await payload(response))).not.toMatch(
      /secretAccessKey|accessKeyId|service_role/i,
    );
  });
});

describe('get-latest-desktop-release handler', () => {
  it('rejects missing and invalid authentication', async () => {
    const missing = await handleGetLatestDesktopRelease(
      request(undefined, '', 'GET'),
      latestDeps(),
    );
    expect(missing.status).toBe(401);

    const invalid = await handleGetLatestDesktopRelease(
      request(undefined, 'bad', 'GET'),
      latestDeps({ getUser: vi.fn(async () => null) }),
    );
    expect(invalid.status).toBe(401);
  });

  it.each([
    license({ status: 'inactive' }),
    license({ status: 'revoked' }),
    license({ status: 'expired' }),
    license({ products: { product_key: 'subscription_pro' } }),
  ])('rejects a non-entitled license %#', async (record) => {
    const response = await handleGetLatestDesktopRelease(
      request(undefined, 'token', 'GET'),
      latestDeps({ listLicensesForUser: vi.fn(async () => [record]) }),
    );
    expect(response.status).toBe(403);
  });

  it('queries licenses only for the authenticated user', async () => {
    const listLicensesForUser = vi.fn(async () => [license()]);
    const response = await handleGetLatestDesktopRelease(
      request(undefined, 'token', 'GET'),
      latestDeps({ listLicensesForUser }),
    );
    expect(response.status).toBe(200);
    expect(listLicensesForUser).toHaveBeenCalledWith(USER_ID);
  });

  it('returns no_release_available when there is no current release', async () => {
    const response = await handleGetLatestDesktopRelease(
      request(undefined, 'token', 'GET'),
      latestDeps({ getCurrentRelease: vi.fn(async () => null) }),
    );
    expect(response.status).toBe(404);
  });

  it('returns the exact release metadata with a fresh signed URL', async () => {
    const deps = latestDeps();
    const response = await handleGetLatestDesktopRelease(
      request(undefined, 'token', 'GET'),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await payload(response)).toEqual({
      version: VERSION,
      filename: FILENAME,
      sha256: SHA,
      fileSize: 123,
      contentType: 'application/octet-stream',
      releaseNotes: 'Release notes',
      publishedAt: '2026-06-25T01:00:00.000Z',
      downloadUrl: 'https://download.example/signed-1',
      expiresInSeconds: 300,
    });
    expect(deps.presignGet).toHaveBeenCalledWith({
      objectKey: OBJECT_KEY,
      filename: FILENAME,
      contentType: 'application/octet-stream',
    });
  });

  it('mints a new URL on every invocation and has no persistence dependency', async () => {
    let count = 0;
    const deps = latestDeps({
      presignGet: vi.fn(async () => ({
        url: `https://download.example/signed-${++count}`,
        expiresInSeconds: 300,
      })),
    });
    const first = await payload(
      await handleGetLatestDesktopRelease(
        request(undefined, 'token', 'GET'),
        deps,
      ),
    );
    const second = await payload(
      await handleGetLatestDesktopRelease(
        request(undefined, 'token', 'GET'),
        deps,
      ),
    );
    expect(first.downloadUrl).not.toBe(second.downloadUrl);
    expect(Object.keys(deps).sort()).toEqual([
      'getCurrentRelease',
      'getUser',
      'listLicensesForUser',
      'presignGet',
    ]);
  });

  it('does not expose credentials or license records', async () => {
    const response = await handleGetLatestDesktopRelease(
      request(undefined, 'token', 'GET'),
      latestDeps(),
    );
    const text = JSON.stringify(await payload(response));
    expect(text).not.toMatch(/license_key|secretAccessKey|accessKeyId|service_role/i);
  });
});
