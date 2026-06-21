import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Static audit of the website's production checkout call sites. These guard
// against regressions: stale product keys creeping back, the browser sending
// Stripe price ids / credit amounts, or the credit-pack add-on flow being lost.

const root = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const pricing = read('components/Pricing.tsx');
const dashboard = read('components/AccountDashboard.tsx');

/** Extract a single function/handler body by brace matching from its declaration. */
function sliceHandler(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`Declaration not found: ${declaration}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for: ${declaration}`);
}

describe('no stale subscription product keys remain in production code', () => {
  it('Pricing.tsx and AccountDashboard.tsx never reference starter_monthly / pro_monthly', () => {
    for (const src of [pricing, dashboard]) {
      expect(src).not.toContain('starter_monthly');
      expect(src).not.toContain('pro_monthly');
    }
  });

  it('the public Pricing checkout map sends the canonical subscription keys', () => {
    expect(pricing).toContain('SUBSCRIPTION_PRODUCT_KEYS.starter');
    expect(pricing).toContain('SUBSCRIPTION_PRODUCT_KEYS.pro');
  });
});

describe('subscription checkout sends a productKey only (no Stripe price ids / amounts)', () => {
  const subHandler = sliceHandler(dashboard, 'const handleSubscriptionCheckout');

  it('AccountDashboard.handleSubscriptionCheckout sends no priceId / mode / credits', () => {
    expect(subHandler).not.toContain('priceId');
    expect(subHandler).not.toContain('stripe_price_id');
    expect(subHandler).not.toMatch(/\bcredits\b/);
    // It delegates to the shared, tested helper rather than hand-rolling the call.
    expect(subHandler).toContain('startSubscriptionCheckout');
  });

  it('AccountDashboard.handleSubscriptionCheckout requires an authenticated session', () => {
    expect(subHandler).toContain('activeSession?.access_token');
    expect(subHandler).toContain('Please sign in');
  });

  it('Pricing subscription branch routes through the helper and requires auth', () => {
    const executeCheckout = sliceHandler(pricing, 'const executeCheckout');
    expect(executeCheckout).toContain('isSubscriptionPlan');
    expect(executeCheckout).toContain('startSubscriptionCheckout');
    // Guests are pushed to sign-in, never sent as anon subscription checkouts.
    expect(executeCheckout).toContain('onSignIn()');
  });
});

describe('desktop add-on credit-pack flow is preserved', () => {
  it('AccountDashboard still offers credit_pack_100 and credit_pack_500 top-ups', () => {
    expect(dashboard).toContain("handleTopUp('credit_pack_100')");
    expect(dashboard).toContain("handleTopUp('credit_pack_500')");
  });

  it('credit-pack top-up still sends the productKey-only contract', () => {
    const topUp = sliceHandler(dashboard, 'const handleTopUp');
    expect(topUp).toContain('productKey: packKey');
    expect(topUp).not.toContain('priceId');
  });
});
