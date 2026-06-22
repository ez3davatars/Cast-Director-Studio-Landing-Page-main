/**
 * Launch checkout contract (website side).
 *
 * This is the single source of truth on the website for how the browser asks the
 * authoritative `create-checkout-session` Edge Function to start a hosted
 * subscription. It mirrors the server-owned launch-pricing registry
 * (`supabase/functions/_shared/launchPricing.ts`) in the authoritative backend.
 *
 * Hard rules enforced here (audited against the backend contract):
 *  - The website sends a PRODUCT KEY only. Never a Stripe price id, an env-var
 *    name, a credit amount, a display-plan name, or a client-calculated price.
 *  - The backend derives the Stripe price, the amount ($59 / $119), and the
 *    paid-credit grant (600 / 1200) server-side from the product key.
 *  - Hosted subscriptions require an authenticated Supabase bearer token. There
 *    is no guest subscription checkout — the backend rejects it (401).
 */

/** Canonical hosted-subscription product keys understood by the backend registry. */
export const SUBSCRIPTION_PRODUCT_KEYS = {
  starter: 'subscription_starter',
  pro: 'subscription_pro',
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PRODUCT_KEYS;
export type SubscriptionProductKey = (typeof SUBSCRIPTION_PRODUCT_KEYS)[SubscriptionPlan];

/**
 * Every launch product key the authoritative backend registry accepts for new
 * checkout. Mirrors LAUNCH_PRODUCT_REGISTRY keys in launchPricing.ts. Used by the
 * registry-alignment test; the website only ever *sends* the subscription keys
 * (here) and the credit-pack keys (preserved in AccountDashboard).
 */
export const BACKEND_LAUNCH_PRODUCT_KEYS = [
  'credit_pack_100',
  'credit_pack_500',
  'subscription_starter',
  'subscription_pro',
  'indie_desktop_byok',
  'agency_desktop_byok',
] as const;

/** Resolve a UI plan ('starter' | 'pro') to its canonical backend product key. */
export function resolveSubscriptionProductKey(plan: SubscriptionPlan): SubscriptionProductKey {
  const key = SUBSCRIPTION_PRODUCT_KEYS[plan];
  if (!key) {
    throw new Error(`Unknown subscription plan: ${String(plan)}`);
  }
  return key;
}

export class SubscriptionAuthRequiredError extends Error {
  code = 'AUTH_REQUIRED' as const;
  constructor(message = 'Please sign in to start your subscription.') {
    super(message);
    this.name = 'SubscriptionAuthRequiredError';
  }
}

/**
 * Build the exact request body sent to create-checkout-session for a hosted
 * subscription. Intentionally productKey-only: no priceId, no mode, no credits,
 * no price. `return_url` is the one piece of client context the backend accepts.
 */
export function buildSubscriptionCheckoutBody(
  plan: SubscriptionPlan,
  returnUrl: string
): { productKey: SubscriptionProductKey; return_url: string } {
  return {
    productKey: resolveSubscriptionProductKey(plan),
    return_url: returnUrl,
  };
}

export interface StartSubscriptionCheckoutArgs {
  plan: SubscriptionPlan;
  /** A real Supabase user access token. Must NOT be the anon/publishable key. */
  accessToken: string | null | undefined;
  returnUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Optional extra headers (e.g. affiliate attribution). Never overrides auth. */
  extraHeaders?: Record<string, string>;
}

export interface SubscriptionCheckoutResult {
  url: string;
  sessionId: string | null;
}

/**
 * Start a hosted subscription checkout against the authoritative Edge Function.
 * Requires an authenticated bearer token (throws SubscriptionAuthRequiredError
 * otherwise). Returns the Stripe Checkout URL — the caller redirects to it.
 */
export async function startSubscriptionCheckout(
  args: StartSubscriptionCheckoutArgs
): Promise<SubscriptionCheckoutResult> {
  const {
    plan,
    accessToken,
    returnUrl,
    supabaseUrl,
    supabaseAnonKey,
    fetchImpl,
    extraHeaders,
  } = args;

  // Auth is mandatory for hosted subscriptions. The anon/publishable key is not
  // a user token and must never be used to impersonate a buyer.
  if (!accessToken || accessToken === supabaseAnonKey) {
    throw new SubscriptionAuthRequiredError();
  }

  const doFetch = fetchImpl ?? fetch;
  const body = buildSubscriptionCheckoutBody(plan, returnUrl);

  const response = await doFetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(body),
  });

  let parsed: any = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      parsed?.error || parsed?.message || `Checkout failed with status ${response.status}`;
    throw new Error(message);
  }

  const url = parsed?.url || parsed?.checkout_url;
  if (!url) {
    throw new Error('Checkout session was created but no checkout URL was returned.');
  }

  return { url, sessionId: parsed?.session_id ?? null };
}
