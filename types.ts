import { ReactNode } from 'react';

export interface FeatureCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  delay?: number;
}

export interface PricingTierProps {
  name: string;
  price: string;
  features: string[];
  isPopular?: boolean;
  ctaText?: string;
}

export enum SectionId {
  HERO = 'hero',
  BIOMETRIC = 'biometric',
  FEATURES = 'features',
  PRICING = 'pricing',
  CONTACT = 'contact'
}

export type OrderViewModel = {
  orderNumber: string
  productName: string
  amountFormatted: string
  paymentStatus: 'Paid' | 'Pending' | 'Failed' | 'Refunded' | string
  deliveryStatus: 'Fulfilled' | 'Pending' | 'Canceled' | string
  purchaseDate: string
  licenseStatus?: string
}

export type LicenseViewModel = {
  licenseName: string
  licenseKeyMasked?: string
  licenseKeyFull?: string
  status: 'Active' | 'Inactive' | 'Revoked' | 'Expired' | string
  type: 'Perpetual' | 'Subscription' | 'Trial' | string
  issuedOn: string
  assignedTo: string
  entitlements?: string[]
}

export interface DownloadViewModel {
    id: string;
    productName: string;
    platform: string;
    version: string;
    fileType: string;
    expiresAt?: string;
    canGenerateNewLink: boolean;
    isAvailable: boolean;
}

export type DownloadTokenRecord = {
  id?: string
  token: string
  expiresAt: string
  orderId?: string
  productId?: string
  downloadUrl?: string
  createdAt: string
  metadata?: any
}