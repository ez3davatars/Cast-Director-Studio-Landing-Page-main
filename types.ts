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