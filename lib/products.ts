export type ProductKey =
  | 'indie_desktop_byok'
  | 'indie_updates_support'
  | 'starter'
  | 'pro'
  | 'agency_desktop_byok'
  | 'agency_updates_support'

export type ProductCatalogEntry = {
  productKey: ProductKey
  displayName: string
  stripePriceIds: string[]
  productType: 'desktop_license' | 'support_plan' | 'subscription' | 'downloadable'
  licenseType?: 'perpetual' | 'subscription' | 'trial'
  platform?: 'Windows' | 'Mac' | 'Linux'
  fileType?: string
  duplicatePolicy: 'block' | 'warn' | 'allow'
}

export const SHARED_PRODUCT_CATALOG: Record<ProductKey, ProductCatalogEntry> = {
  indie_desktop_byok: {
    productKey: 'indie_desktop_byok',
    displayName: 'Indie Desktop BYOK',
    stripePriceIds: ['price_1TC59GDETDyl6ph1Vift3EjC'], // Real stripe_price_id from DB
    productType: 'desktop_license',
    licenseType: 'perpetual',
    platform: 'Windows',
    fileType: 'Installer (.exe)',
    duplicatePolicy: 'block',
  },
  indie_updates_support: {
    productKey: 'indie_updates_support',
    displayName: 'Indie Updates & Support',
    stripePriceIds: ['price_1TCXVpDETDyl6ph1VcnFflZ5'], // Real stripe_price_id from DB
    productType: 'support_plan',
    duplicatePolicy: 'warn',
  },
  starter: {
    productKey: 'starter',
    displayName: 'Starter',
    stripePriceIds: ['price_1TC4FLDETDyl6ph12zMfVdoP'],
    productType: 'subscription',
    duplicatePolicy: 'warn',
  },
  pro: {
    productKey: 'pro',
    displayName: 'Pro',
    stripePriceIds: ['price_1TC4QgDETDyl6ph1ydjJICil'],
    productType: 'subscription',
    duplicatePolicy: 'warn',
  },
  agency_desktop_byok: {
    productKey: 'agency_desktop_byok',
    displayName: 'Agency Commercial BYOK',
    stripePriceIds: ['price_1TC5ABDETDyl6ph1Um6in8g6'],
    productType: 'desktop_license',
    licenseType: 'perpetual',
    platform: 'Windows',
    fileType: 'Installer (.exe)',
    duplicatePolicy: 'block',
  },
  agency_updates_support: {
    productKey: 'agency_updates_support',
    displayName: 'Agency Updates & Priority Support',
    stripePriceIds: ['price_1TC5E2DETDyl6ph1kOigQu2u'],
    productType: 'support_plan',
    duplicatePolicy: 'warn',
  }
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
