/**
 * Subscription display helpers (website side).
 *
 * The backend stripe-webhook writes the canonical product key
 * (subscription_starter / subscription_pro) into subscriptions.metadata. These
 * helpers normalize that key to the UI plan and a display name so the Account
 * Dashboard can show "Starter" / "Pro" WITHOUT depending on the products
 * catalog (which may be empty). Legacy keys ('starter' / 'pro') are also
 * accepted for backward compatibility with older rows.
 */

export type SubscriptionUiPlan = 'starter' | 'pro';

const PRODUCT_KEY_TO_PLAN: Record<string, SubscriptionUiPlan> = {
  subscription_starter: 'starter',
  subscription_pro: 'pro',
  // legacy / historical rows
  starter: 'starter',
  pro: 'pro',
};

const PLAN_DISPLAY_NAME: Record<SubscriptionUiPlan, string> = {
  starter: 'Starter',
  pro: 'Pro',
};

/** Normalize a stored product key to the UI plan, or null if it is not a hosted plan. */
export function resolveSubscriptionPlanKey(
  productKey: string | null | undefined
): SubscriptionUiPlan | null {
  if (!productKey) return null;
  return PRODUCT_KEY_TO_PLAN[productKey] ?? null;
}

/**
 * Display name for a subscription's product key. Falls back through the
 * canonical key so the plan renders even when the products catalog is empty.
 */
export function subscriptionPlanDisplayName(productKey: string | null | undefined): string {
  const plan = resolveSubscriptionPlanKey(productKey);
  return plan ? PLAN_DISPLAY_NAME[plan] : 'Subscription';
}
