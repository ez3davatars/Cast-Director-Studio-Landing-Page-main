import { describe, expect, it } from 'vitest';

import {
  ALLOWED_CONTENT_TYPES,
  DEFAULT_CONTENT_TYPE,
  DESKTOP_CHANNEL,
  DESKTOP_PLATFORM,
  MAX_INSTALLER_SIZE_BYTES,
  buildInstallerFilename,
  buildInstallerObjectKey,
  isAllowedContentType,
  isCanonicalInstallerFilename,
  isCanonicalObjectKey,
  isValidFileSize,
  isValidSha256,
  isValidVersion,
  validateDesktopReleaseInput,
} from '../supabase/functions/_shared/desktopReleases';
import {
  DEFAULT_ACTIVATION_LIMIT,
  DESKTOP_PRODUCT_KEYS,
  formatLicenseKeySuffix,
  isActiveLicenseStatus,
  isDesktopProductKey,
  isEntitledDesktopLicense,
  resolveActivationLimit,
  resolveDisplayName,
  toSafeDesktopLicense,
  type DesktopLicenseRecord,
} from '../supabase/functions/_shared/desktopEntitlement';

const VALID_SHA256 = 'a'.repeat(64);

describe('desktop release helpers', () => {
  it.each(['0.0.0', '1.0.0', '10.5.123'])(
    'accepts strict version %s',
    (version) => {
      expect(isValidVersion(version)).toBe(true);
    },
  );

  it.each([
    '',
    '1.0',
    'v1.0.0',
    '01.0.0',
    '1.01.0',
    '1.0.00',
    '1.0.0.0',
    '1.2.x',
    ' 1.0.0',
    '1.0.0 ',
  ])('rejects invalid version %j', (version) => {
    expect(isValidVersion(version)).toBe(false);
  });

  it('requires a lowercase 64-character SHA-256', () => {
    expect(isValidSha256(VALID_SHA256)).toBe(true);
    expect(isValidSha256('A'.repeat(64))).toBe(false);
    expect(isValidSha256('a'.repeat(63))).toBe(false);
    expect(isValidSha256('a'.repeat(65))).toBe(false);
    expect(isValidSha256(`${'a'.repeat(63)}g`)).toBe(false);
    expect(isValidSha256('')).toBe(false);
  });

  it('enforces the installer size range', () => {
    expect(isValidFileSize(1)).toBe(true);
    expect(isValidFileSize(MAX_INSTALLER_SIZE_BYTES)).toBe(true);
    expect(isValidFileSize(0)).toBe(false);
    expect(isValidFileSize(-1)).toBe(false);
    expect(isValidFileSize(MAX_INSTALLER_SIZE_BYTES + 1)).toBe(false);
    expect(isValidFileSize(1.5)).toBe(false);
  });

  it('allows exactly the database-approved content types', () => {
    for (const contentType of ALLOWED_CONTENT_TYPES) {
      expect(isAllowedContentType(contentType)).toBe(true);
    }

    expect(isAllowedContentType('text/plain')).toBe(false);
    expect(isAllowedContentType('application/zip')).toBe(false);
    expect(isAllowedContentType('')).toBe(false);
    expect(isAllowedContentType(null)).toBe(false);
  });

  it('builds the canonical filename and immutable object key', () => {
    expect(buildInstallerFilename('1.2.3')).toBe(
      'Cast Director Studio Setup 1.2.3.exe',
    );
    expect(buildInstallerObjectKey('1.2.3')).toBe(
      'installers/windows/1.2.3/Cast Director Studio Setup 1.2.3.exe',
    );
    expect(() => buildInstallerFilename('v1.2.3')).toThrow(RangeError);
    expect(() => buildInstallerObjectKey('01.2.3')).toThrow(RangeError);
  });

  it('accepts only exact canonical filenames and object keys', () => {
    const filename = 'Cast Director Studio Setup 1.2.3.exe';
    const objectKey = `installers/windows/1.2.3/${filename}`;

    expect(isCanonicalInstallerFilename(filename, '1.2.3')).toBe(true);
    expect(isCanonicalObjectKey(objectKey, '1.2.3')).toBe(true);

    expect(isCanonicalInstallerFilename('../installer.exe', '1.2.3')).toBe(
      false,
    );
    expect(
      isCanonicalInstallerFilename('nested\\installer.exe', '1.2.3'),
    ).toBe(false);
    expect(isCanonicalObjectKey('../windows/1.2.3/installer.exe', '1.2.3')).toBe(
      false,
    );
    expect(
      isCanonicalObjectKey(
        'installers/windows/1.2.3/../Cast Director Studio Setup 1.2.3.exe',
        '1.2.3',
      ),
    ).toBe(false);
  });

  it('derives canonical values and defaults the content type', () => {
    const result = validateDesktopReleaseInput({
      version: '1.2.3',
      sha256: VALID_SHA256,
      fileSize: 140_000_000,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        platform: DESKTOP_PLATFORM,
        channel: DESKTOP_CHANNEL,
        version: '1.2.3',
        filename: 'Cast Director Studio Setup 1.2.3.exe',
        objectKey:
          'installers/windows/1.2.3/Cast Director Studio Setup 1.2.3.exe',
        sha256: VALID_SHA256,
        fileSize: 140_000_000,
        contentType: DEFAULT_CONTENT_TYPE,
      },
    });
  });

  it('accepts a caller-supplied path only when it is canonical', () => {
    const version = '1.2.3';
    const filename = buildInstallerFilename(version);
    const objectKey = buildInstallerObjectKey(version);

    expect(
      validateDesktopReleaseInput({
        version,
        sha256: VALID_SHA256,
        fileSize: 1,
        contentType: 'application/x-msdownload',
        filename,
        objectKey,
      }).ok,
    ).toBe(true);

    const unsafeValues = [
      { filename: '../Cast Director Studio Setup 1.2.3.exe' },
      { filename: 'nested\\Cast Director Studio Setup 1.2.3.exe' },
      { objectKey: '/installers/windows/1.2.3/file.exe' },
      { objectKey: 'installers/windows/1.2.3/../file.exe' },
      { objectKey: 'installers/windows/9.9.9/file.exe' },
    ];

    for (const unsafe of unsafeValues) {
      const result = validateDesktopReleaseInput({
        version,
        sha256: VALID_SHA256,
        fileSize: 1,
        ...unsafe,
      });
      expect(result.ok).toBe(false);
    }
  });

  it('returns all applicable validation errors without throwing', () => {
    const result = validateDesktopReleaseInput({
      version: '01.0.0',
      sha256: 'BAD',
      fileSize: 0,
      contentType: 'text/plain',
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors).toHaveLength(4);
    }

    expect(validateDesktopReleaseInput(null)).toEqual({
      ok: false,
      errors: ['input must be an object'],
    });
  });
});

describe('desktop entitlement helpers', () => {
  it('recognizes exactly the current desktop product keys', () => {
    for (const productKey of DESKTOP_PRODUCT_KEYS) {
      expect(isDesktopProductKey(productKey)).toBe(true);
    }

    for (const productKey of [
      'subscription_starter',
      'subscription_pro',
      'credit_pack_100',
      '',
      null,
      undefined,
    ]) {
      expect(isDesktopProductKey(productKey)).toBe(false);
    }
  });

  it('matches active status case-insensitively without trimming', () => {
    expect(isActiveLicenseStatus('active')).toBe(true);
    expect(isActiveLicenseStatus('ACTIVE')).toBe(true);
    expect(isActiveLicenseStatus('Active')).toBe(true);

    for (const status of [
      'inactive',
      'expired',
      'revoked',
      'canceled',
      '',
      ' active ',
      null,
      undefined,
    ]) {
      expect(isActiveLicenseStatus(status)).toBe(false);
    }
  });

  it('requires both active status and a recognized desktop product key', () => {
    expect(
      isEntitledDesktopLicense({
        status: 'ACTIVE',
        products: { product_key: 'indie_desktop_byok' },
      }),
    ).toBe(true);

    expect(
      isEntitledDesktopLicense({
        status: 'expired',
        products: { product_key: 'indie_desktop_byok' },
      }),
    ).toBe(false);

    expect(
      isEntitledDesktopLicense({
        status: 'active',
        products: { product_key: 'subscription_starter' },
      }),
    ).toBe(false);
  });

  it('preserves the activation-limit precedence', () => {
    expect(
      resolveActivationLimit({ max_activations: 5, device_limit: 3 }),
    ).toBe(5);
    expect(
      resolveActivationLimit({ max_activations: null, device_limit: 3 }),
    ).toBe(3);
    expect(
      resolveActivationLimit({ max_activations: null, device_limit: null }),
    ).toBe(DEFAULT_ACTIVATION_LIMIT);
    expect(resolveActivationLimit({ max_activations: 0, device_limit: 3 })).toBe(
      0,
    );
  });

  it('preserves the existing key-suffix behavior', () => {
    expect(formatLicenseKeySuffix(null)).toBe('');
    expect(formatLicenseKeySuffix('')).toBe('');
    expect(formatLicenseKeySuffix('12345678')).toBe('12345678');
    expect(formatLicenseKeySuffix('ABCD-1234-5678')).toBe('...234-5678');
  });

  it('preserves the display-name fallback chain', () => {
    expect(
      resolveDisplayName({
        license_name: 'My Studio Seat',
        products: { display_name: 'Product Name' },
      }),
    ).toBe('My Studio Seat');
    expect(
      resolveDisplayName({
        license_name: '',
        products: { display_name: 'Product Name' },
      }),
    ).toBe('Product Name');
    expect(resolveDisplayName({ license_name: null, products: null })).toBe(
      'Desktop License',
    );
  });

  it('maps a license to the existing safe response shape', () => {
    const license: DesktopLicenseRecord = {
      id: 'license-123',
      license_name: null,
      license_key: 'ABCD-1234-5678',
      status: 'active',
      device_limit: 3,
      max_activations: null,
      products: {
        product_key: 'agency_desktop_byok',
        display_name: 'Agency Desktop',
      },
    };

    expect(toSafeDesktopLicense(license, 2)).toEqual({
      id: 'license-123',
      productKey: 'agency_desktop_byok',
      displayName: 'Agency Desktop',
      licenseKeySuffix: '...234-5678',
      activationLimit: 3,
      activeDeviceCount: 2,
    });
  });
});
