-- ============================================================
-- Affiliate payout proof and Stripe Connect tracking fields
--
-- Additive, idempotent migration for /admin/payouts payout proof
-- and Stripe Connect readiness/status display fields.
-- ============================================================

ALTER TABLE public.payout_items
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_destination text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_notes text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_status text,
  ADD COLUMN IF NOT EXISTS stripe_destination_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_payout_id text,
  ADD COLUMN IF NOT EXISTS stripe_payout_status text,
  ADD COLUMN IF NOT EXISTS stripe_payout_arrival_date timestamptz,
  ADD COLUMN IF NOT EXISTS payout_failure_code text,
  ADD COLUMN IF NOT EXISTS payout_failure_message text;

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS payout_method text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarding_status text,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_requirements_due jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS payout_items_payment_reference_idx
  ON public.payout_items (payment_reference);

CREATE INDEX IF NOT EXISTS payout_items_paid_at_idx
  ON public.payout_items (paid_at);

CREATE INDEX IF NOT EXISTS payout_items_stripe_transfer_id_idx
  ON public.payout_items (stripe_transfer_id);

CREATE INDEX IF NOT EXISTS payout_items_stripe_payout_id_idx
  ON public.payout_items (stripe_payout_id);

CREATE INDEX IF NOT EXISTS affiliates_stripe_connect_account_id_idx
  ON public.affiliates (stripe_connect_account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'affiliates_payout_method_check'
      AND conrelid = 'public.affiliates'::regclass
  ) THEN
    ALTER TABLE public.affiliates
      ADD CONSTRAINT affiliates_payout_method_check
      CHECK (
        payout_method IN (
          'manual',
          'stripe_connect',
          'paypal',
          'wise',
          'ach',
          'zelle',
          'bank_transfer',
          'other'
        )
      )
      NOT VALID;
  END IF;
END $$;
