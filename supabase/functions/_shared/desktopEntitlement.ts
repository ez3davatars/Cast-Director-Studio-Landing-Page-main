/**
 * Pure desktop-entitlement helpers extracted from get-my-desktop-licenses.
 * These functions intentionally preserve the existing product-key, status,
 * display-name, activation-limit, and key-suffix behavior.
 */

export const DESKTOP_PRODUCT_KEYS = [
  'indie_desktop_byok',
  'agency_desktop_byok',
  'agency_commercial_byok',
] as const;

export const ACTIVE_LICENSE_STATUS = 'active' as const;
export const DEFAULT_ACTIVATION_LIMIT = 2;

export type DesktopProductKey = (typeof DESKTOP_PRODUCT_KEYS)[number];

export interface DesktopLicenseProduct {
  product_key?: string | null;
  display_name?: string | null;
}

export interface DesktopLicenseRecord {
  id: string;
  license_name?: string | null;
  license_key?: string | null;
  status?: string | null;
  device_limit?: number | null;
  max_activations?: number | null;
  products?: DesktopLicenseProduct | null;
}

export interface SafeDesktopLicense {
  id: string;
  productKey: string;
  displayName: string;
  licenseKeySuffix: string;
  activationLimit: number;
  activeDeviceCount: number;
}

export function isDesktopProductKey(
  productKey: unknown,
): productKey is DesktopProductKey {
  return (
    typeof productKey === 'string' &&
    (DESKTOP_PRODUCT_KEYS as readonly string[]).includes(productKey)
  );
}

/** Mirrors the existing case-insensitive `status ILIKE 'active'` gate. */
export function isActiveLicenseStatus(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    status.toLowerCase() === ACTIVE_LICENSE_STATUS
  );
}

export function resolveActivationLimit(
  license: Pick<DesktopLicenseRecord, 'max_activations' | 'device_limit'>,
): number {
  return (
    license.max_activations ??
    license.device_limit ??
    DEFAULT_ACTIVATION_LIMIT
  );
}

export function formatLicenseKeySuffix(
  rawKey: string | null | undefined,
): string {
  if (!rawKey) return '';
  return rawKey.length > 8 ? `...${rawKey.slice(-8)}` : rawKey;
}

export function resolveDisplayName(
  license: Pick<DesktopLicenseRecord, 'license_name' | 'products'>,
): string {
  return (
    license.license_name ||
    license.products?.display_name ||
    'Desktop License'
  );
}

export function isEntitledDesktopLicense(
  license: Pick<DesktopLicenseRecord, 'status' | 'products'>,
): boolean {
  return (
    isActiveLicenseStatus(license.status) &&
    isDesktopProductKey(license.products?.product_key)
  );
}

/**
 * Mirrors the existing get-my-desktop-licenses response mapping. Callers remain
 * responsible for querying active-device counts and enforcing user ownership.
 */
export function toSafeDesktopLicense(
  license: DesktopLicenseRecord,
  activeDeviceCount = 0,
): SafeDesktopLicense {
  return {
    id: license.id,
    productKey: license.products?.product_key || '',
    displayName: resolveDisplayName(license),
    licenseKeySuffix: formatLicenseKeySuffix(license.license_key),
    activationLimit: resolveActivationLimit(license),
    activeDeviceCount,
  };
}
