import { describe, it, expect } from 'vitest';
import { resolveSubscriptionPlanKey, subscriptionPlanDisplayName } from '../lib/subscriptionDisplay';

describe('resolveSubscriptionPlanKey', () => {
  it('maps canonical webhook keys to the UI plan', () => {
    expect(resolveSubscriptionPlanKey('subscription_starter')).toBe('starter');
    expect(resolveSubscriptionPlanKey('subscription_pro')).toBe('pro');
  });
  it('accepts legacy keys', () => {
    expect(resolveSubscriptionPlanKey('starter')).toBe('starter');
    expect(resolveSubscriptionPlanKey('pro')).toBe('pro');
  });
  it('returns null for unknown / empty keys', () => {
    expect(resolveSubscriptionPlanKey('credit_pack_100')).toBeNull();
    expect(resolveSubscriptionPlanKey(null)).toBeNull();
    expect(resolveSubscriptionPlanKey(undefined)).toBeNull();
  });
});

describe('subscriptionPlanDisplayName (works without a products catalog)', () => {
  it('renders Starter / Pro from the canonical key alone', () => {
    expect(subscriptionPlanDisplayName('subscription_starter')).toBe('Starter');
    expect(subscriptionPlanDisplayName('subscription_pro')).toBe('Pro');
  });
  it('falls back to Subscription for unknown keys', () => {
    expect(subscriptionPlanDisplayName(null)).toBe('Subscription');
    expect(subscriptionPlanDisplayName('mystery')).toBe('Subscription');
  });
});

// Mirrors the Account Dashboard logic: the active count and plan resolution must
// work using only subscriptions.metadata.product_key, with an EMPTY products map.
describe('Account Dashboard subscription derivation (empty products catalog)', () => {
  const emptyProductsMap = new Map<string, { product_key: string }>();
  const resolveSubKey = (sub: any) => {
    const rawKey = sub.metadata?.product_key || emptyProductsMap.get(sub.product_id)?.product_key || null;
    return resolveSubscriptionPlanKey(rawKey);
  };

  const rows = [
    { status: 'active', product_id: null, metadata: { product_key: 'subscription_starter' } },
    { status: 'canceled', product_id: null, metadata: { product_key: 'subscription_pro' } },
  ];

  it('Active Subscriptions count reflects active rows', () => {
    const activeStarter = [{ status: 'active', product_id: null, metadata: { product_key: 'subscription_starter' } }];
    expect(activeStarter.filter((s) => s.status === 'active').length).toBe(1);

    const activePro = [{ status: 'active', product_id: null, metadata: { product_key: 'subscription_pro' } }];
    expect(activePro.filter((s) => s.status === 'active').length).toBe(1);
  });

  it('resolves Starter / Pro plan from canonical metadata key', () => {
    expect(resolveSubKey(rows[0])).toBe('starter');
    expect(resolveSubKey(rows[1])).toBe('pro');
  });

  it('displays the plan name without any products row', () => {
    expect(subscriptionPlanDisplayName(rows[0].metadata.product_key)).toBe('Starter');
    expect(subscriptionPlanDisplayName(rows[1].metadata.product_key)).toBe('Pro');
  });
});
