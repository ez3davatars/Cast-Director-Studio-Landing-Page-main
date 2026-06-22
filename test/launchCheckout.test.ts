import { describe, it, expect, vi } from 'vitest';
import {
  SUBSCRIPTION_PRODUCT_KEYS,
  BACKEND_LAUNCH_PRODUCT_KEYS,
  resolveSubscriptionProductKey,
  buildSubscriptionCheckoutBody,
  startSubscriptionCheckout,
  SubscriptionAuthRequiredError,
} from '../lib/launchCheckout';

// Fields that must NEVER appear in a website checkout request body. The backend
// owns the Stripe price, the billing amount, and the credit grant.
const FORBIDDEN_BODY_FIELDS = [
  'priceId',
  'price_id',
  'stripe_price_id',
  'credits',
  'monthly_credits',
  'amount',
  'price',
  'mode',
];

const LOCAL_ANON_KEY = 'sb_publishable_LOCAL_TEST_ONLY';

describe('subscription product-key contract', () => {
  it('maps Starter to subscription_starter', () => {
    expect(resolveSubscriptionProductKey('starter')).toBe('subscription_starter');
    expect(SUBSCRIPTION_PRODUCT_KEYS.starter).toBe('subscription_starter');
  });

  it('maps Pro to subscription_pro', () => {
    expect(resolveSubscriptionProductKey('pro')).toBe('subscription_pro');
    expect(SUBSCRIPTION_PRODUCT_KEYS.pro).toBe('subscription_pro');
  });

  it('does not use the stale keys starter_monthly / pro_monthly / starter / pro', () => {
    const sent = Object.values(SUBSCRIPTION_PRODUCT_KEYS);
    expect(sent).not.toContain('starter_monthly');
    expect(sent).not.toContain('pro_monthly');
    expect(sent).not.toContain('starter');
    expect(sent).not.toContain('pro');
  });

  it('builds a productKey-only body — no price id, credit amount, or client price', () => {
    for (const plan of ['starter', 'pro'] as const) {
      const body = buildSubscriptionCheckoutBody(plan, 'http://127.0.0.1:3000/get-started');
      expect(body.productKey).toBe(SUBSCRIPTION_PRODUCT_KEYS[plan]);
      expect(body.return_url).toBe('http://127.0.0.1:3000/get-started');
      for (const field of FORBIDDEN_BODY_FIELDS) {
        expect(body as Record<string, unknown>).not.toHaveProperty(field);
      }
      // Exactly the two allowed keys.
      expect(Object.keys(body).sort()).toEqual(['productKey', 'return_url']);
    }
  });
});

describe('registry alignment with the authoritative backend', () => {
  it('every key the website may send is a known backend launch product key', () => {
    for (const key of Object.values(SUBSCRIPTION_PRODUCT_KEYS)) {
      expect(BACKEND_LAUNCH_PRODUCT_KEYS).toContain(key);
    }
    // Preserved desktop add-on keys are also part of the backend registry.
    expect(BACKEND_LAUNCH_PRODUCT_KEYS).toContain('credit_pack_100');
    expect(BACKEND_LAUNCH_PRODUCT_KEYS).toContain('credit_pack_500');
  });

  it('mirrors the exact backend LAUNCH_PRODUCT_REGISTRY key set', () => {
    // Source of truth: supabase/functions/_shared/launchPricing.ts
    // (LAUNCH_PRODUCT_REGISTRY). Kept in sync so a backend rename fails the suite.
    expect([...BACKEND_LAUNCH_PRODUCT_KEYS].sort()).toEqual(
      [
        'agency_desktop_byok',
        'credit_pack_100',
        'credit_pack_500',
        'indie_desktop_byok',
        'subscription_pro',
        'subscription_starter',
      ].sort()
    );
  });
});

describe('startSubscriptionCheckout — authentication is mandatory', () => {
  it('throws AUTH_REQUIRED when no access token is present', async () => {
    const fetchImpl = vi.fn();
    await expect(
      startSubscriptionCheckout({
        plan: 'starter',
        accessToken: null,
        returnUrl: 'http://127.0.0.1:3000/x',
        supabaseUrl: 'http://127.0.0.1:54321',
        supabaseAnonKey: LOCAL_ANON_KEY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(SubscriptionAuthRequiredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to use the anon/publishable key as a bearer token', async () => {
    const fetchImpl = vi.fn();
    await expect(
      startSubscriptionCheckout({
        plan: 'pro',
        accessToken: LOCAL_ANON_KEY, // same as anon key => not a user token
        returnUrl: 'http://127.0.0.1:3000/x',
        supabaseUrl: 'http://127.0.0.1:54321',
        supabaseAnonKey: LOCAL_ANON_KEY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(SubscriptionAuthRequiredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('startSubscriptionCheckout — request shape', () => {
  function mockOkFetch() {
    return vi.fn(async () =>
      new Response(
        JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc', session_id: 'cs_test_abc' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }

  it('posts a productKey-only body with a real bearer token for Starter', async () => {
    const fetchImpl = mockOkFetch();
    const result = await startSubscriptionCheckout({
      plan: 'starter',
      accessToken: 'real-user-jwt-token-value',
      returnUrl: 'http://127.0.0.1:3000/get-started',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: LOCAL_ANON_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.url).toContain('cs_test_');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [calledUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe('http://127.0.0.1:54321/functions/v1/create-checkout-session');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer real-user-jwt-token-value');

    const body = JSON.parse(init.body as string);
    expect(body.productKey).toBe('subscription_starter');
    for (const field of FORBIDDEN_BODY_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('sends subscription_pro for Pro', async () => {
    const fetchImpl = mockOkFetch();
    await startSubscriptionCheckout({
      plan: 'pro',
      accessToken: 'real-user-jwt-token-value',
      returnUrl: 'http://127.0.0.1:3000/get-started',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: LOCAL_ANON_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.productKey).toBe('subscription_pro');
  });
});
