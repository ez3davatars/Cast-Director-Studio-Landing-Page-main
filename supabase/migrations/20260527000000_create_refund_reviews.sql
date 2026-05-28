-- Migration: Create refund_reviews table with RLS and duplicate-protection index
CREATE TABLE IF NOT EXISTS public.refund_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id text NOT NULL,
    stripe_subscription_id text NOT NULL,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    plan_key text NOT NULL,
    plan_price_cents integer NOT NULL,
    included_credits integer NOT NULL,
    credits_used integer NOT NULL,
    used_credit_cost_cents integer NOT NULL,
    refundable_amount_cents integer NOT NULL,
    remaining_credits_to_revoke integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    reason text,
    customer_message text,
    request_source text NOT NULL DEFAULT 'customer_portal',
    admin_notes text,
    stripe_refund_id text,
    reviewed_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure refund_reviews remains RLS-enabled and locked down
ALTER TABLE public.refund_reviews ENABLE ROW LEVEL SECURITY;

-- Add duplicate-protection index if it does not already exist
CREATE UNIQUE INDEX IF NOT EXISTS refund_reviews_one_active_per_subscription_idx
ON public.refund_reviews(stripe_subscription_id)
WHERE status IN ('pending', 'approved', 'refunded')
  AND stripe_subscription_id IS NOT NULL;
