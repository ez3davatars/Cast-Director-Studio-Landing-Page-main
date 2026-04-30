export type ProductKey =
  | 'indie_desktop_byok'
  | 'indie_updates_support'
  | 'starter'
  | 'pro'
  | 'agency_desktop_byok'
  | 'agency_updates_support'
  | 'credit_pack_100'
  | 'credit_pack_500'

export type ProductCatalogEntry = {
  productKey: ProductKey
  displayName: string
  stripePriceIds: string[]
  productType: 'desktop_license' | 'support_plan' | 'subscription' | 'downloadable' | 'credit_topup'
  licenseType?: 'perpetual' | 'subscription' | 'trial'
  platform?: 'Windows' | 'Mac' | 'Linux'
  fileType?: string
  duplicatePolicy: 'block' | 'warn' | 'allow'
}

export const SHARED_PRODUCT_CATALOG: Record<ProductKey, ProductCatalogEntry> = {
  indie_desktop_byok: {
    productKey: 'indie_desktop_byok',
    displayName: 'Indie Desktop BYOK',
    stripePriceIds: ['price_1TC6vuDETDyl6ph1S1HnhYPM', 'price_1TC59GDETDyl6ph1Vift3EjC'],
    productType: 'desktop_license',
    licenseType: 'perpetual',
    platform: 'Windows',
    fileType: 'Installer (.exe)',
    duplicatePolicy: 'block',
  },
  indie_updates_support: {
    productKey: 'indie_updates_support',
    displayName: 'Indie Updates & Support',
    stripePriceIds: ['price_1TRiIDDETDyl6ph1fH7tNwvd', 'price_1TCXVpDETDyl6ph1VcnFflZ5'],
    productType: 'support_plan',
    duplicatePolicy: 'warn',
  },
  starter: {
    productKey: 'starter',
    displayName: 'Starter',
    stripePriceIds: ['price_1TRiI1DETDyl6ph1Hv32GRBU', 'price_1TC4FLDETDyl6ph12zMfVdoP'],
    productType: 'subscription',
    duplicatePolicy: 'warn',
  },
  pro: {
    productKey: 'pro',
    displayName: 'Pro',
    stripePriceIds: ['price_1TRifODETDyl6ph1jkZefNuv', 'price_1TC4QgDETDyl6ph1ydjJICil'],
    productType: 'subscription',
    duplicatePolicy: 'warn',
  },
  agency_desktop_byok: {
    productKey: 'agency_desktop_byok',
    displayName: 'Agency Commercial BYOK',
    stripePriceIds: ['price_1TRiIDDETDyl6ph1oltjWtaM', 'price_1TC5ABDETDyl6ph1Um6in8g6'],
    productType: 'desktop_license',
    licenseType: 'perpetual',
    platform: 'Windows',
    fileType: 'Installer (.exe)',
    duplicatePolicy: 'block',
  },
  agency_updates_support: {
    productKey: 'agency_updates_support',
    displayName: 'Agency Updates & Priority Support',
    stripePriceIds: ['price_1TRiIEDETDyl6ph1K2Rsnrpf', 'price_1TC5E2DETDyl6ph1kOigQu2u'],
    productType: 'support_plan',
    duplicatePolicy: 'warn',
  },
  credit_pack_100: {
    productKey: 'credit_pack_100',
    displayName: '100 Credit Pack',
    stripePriceIds: ['price_1TRiIEDETDyl6ph1OIY2Kw3v'],
    productType: 'credit_topup',
    duplicatePolicy: 'allow',
  },
  credit_pack_500: {
    productKey: 'credit_pack_500',
    displayName: '500 Credit Pack',
    stripePriceIds: ['price_1TRiIFDETDyl6ph1mOZYr8zc'],
    productType: 'credit_topup',
    duplicatePolicy: 'allow',
  },
}

export function getProductByKey(productKey: ProductKey | string | null | undefined): ProductCatalogEntry | undefined {
    if (!productKey) return undefined;
    return SHARED_PRODUCT_CATALOG[productKey as ProductKey];
}

export function getProductByStripePriceId(priceId: string | null | undefined): ProductCatalogEntry | undefined {
    if (!priceId) return undefined;
    return Object.values(SHARED_PRODUCT_CATALOG).find(p => p.stripePriceIds.includes(priceId));
}

export function getDuplicatePolicy(productKey: ProductKey | string | null): 'block' | 'warn' | 'allow' {
    const product = getProductByKey(productKey);
    return product ? product.duplicatePolicy : 'allow'; // safe default
}

export function resolveCatalogEntryFromDbProduct(productRow: any): ProductCatalogEntry | undefined {
  if (!productRow) return undefined;
  
  const key = productRow.product_key || productRow.metadata?.product_key;
  if (key) {
    const mapped = getProductByKey(key);
    if (mapped) return mapped;
  }
  
  if (productRow.stripe_price_id) {
    const mapped = getProductByStripePriceId(productRow.stripe_price_id);
    if (mapped) return mapped;
  }
  
  return undefined;
}

export function resolveDisplayName({ productKey, stripePriceId, fallbackName }: { productKey?: string, stripePriceId?: string, fallbackName?: string }): string {
  if (productKey) {
    const mapped = getProductByKey(productKey);
    if (mapped?.displayName) return mapped.displayName;
  }
  if (stripePriceId) {
    const mapped = getProductByStripePriceId(stripePriceId);
    if (mapped?.displayName) return mapped.displayName;
  }
  return fallbackName || 'Cast Director Studio Product';
}

export function isSubscriptionProduct(entry: ProductCatalogEntry | undefined): boolean {
  return entry?.productType === 'subscription';
}

export function isSupportPlan(entry: ProductCatalogEntry | undefined): boolean {
  return entry?.productType === 'support_plan';
}

export function isDesktopLicense(entry: ProductCatalogEntry | undefined): boolean {
  return entry?.productType === 'desktop_license';
}

export function isCreditTopup(entry: ProductCatalogEntry | undefined): boolean {
  return entry?.productType === 'credit_topup';
}
