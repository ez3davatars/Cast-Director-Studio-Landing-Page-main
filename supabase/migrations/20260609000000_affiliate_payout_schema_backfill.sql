-- ============================================================
-- Affiliate payout schema backfill
--
-- Reasserts payout proof and Stripe Connect tracking schema for
-- remote databases where earlier migration versions were recorded
-- as applied without the expected columns.
-- ============================================================

ALTER TABLE public.payout_items
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_destination text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
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

CREATE OR REPLACE FUNCTION public.admin_record_affiliate_manual_payout(
  p_payout_item_id uuid,
  p_payment_method text,
  p_payment_destination text,
  p_payment_reference text,
  p_paid_at timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  payout_item_id uuid,
  batch_id uuid,
  batch_status text,
  batch_paid_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_item record;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_destination text := trim(coalesce(p_payment_destination, ''));
  v_reference text := trim(coalesce(p_payment_reference, ''));
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_batch_status text;
  v_batch_paid_at timestamptz;
BEGIN
  IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
    RAISE EXCEPTION 'Access denied: admin only.';
  END IF;

  v_admin_id := auth.uid();

  IF p_payout_item_id IS NULL THEN
    RAISE EXCEPTION 'Payout item is required.';
  END IF;

  IF v_method NOT IN ('paypal', 'ach', 'wise', 'stripe_manual', 'zelle', 'bank_transfer', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  IF v_destination = '' THEN
    RAISE EXCEPTION 'Payment destination is required.';
  END IF;

  IF v_reference = '' THEN
    RAISE EXCEPTION 'Payment reference is required.';
  END IF;

  SELECT
    pi.id,
    pi.batch_id,
    pi.status,
    pi.amount_cents,
    pb.status AS parent_status
  INTO v_item
  FROM public.payout_items pi
  JOIN public.payout_batches pb ON pb.id = pi.batch_id
  WHERE pi.id = p_payout_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout item not found.';
  END IF;

  IF v_item.parent_status <> 'approved' THEN
    RAISE EXCEPTION 'Payout batch must be approved before recording manual payment.';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending payout items can be recorded as paid.';
  END IF;

  IF coalesce(v_item.amount_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero.';
  END IF;

  UPDATE public.payout_items
  SET
    status = 'paid',
    payment_provider = 'manual',
    payment_method = v_method,
    payment_destination = v_destination,
    payment_reference = v_reference,
    paid_by = v_admin_id,
    paid_at = v_paid_at,
    paid_notes = v_notes
  WHERE id = p_payout_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payout_items
    WHERE batch_id = v_item.batch_id
      AND status <> 'paid'
  ) THEN
    SELECT max(pi.paid_at)
    INTO v_batch_paid_at
    FROM public.payout_items pi
    WHERE pi.batch_id = v_item.batch_id;

    UPDATE public.payout_batches
    SET
      status = 'paid',
      paid_at = v_batch_paid_at
    WHERE id = v_item.batch_id;
  END IF;

  SELECT status, paid_at
  INTO v_batch_status, v_batch_paid_at
  FROM public.payout_batches
  WHERE id = v_item.batch_id;

  RETURN QUERY SELECT p_payout_item_id, v_item.batch_id, v_batch_status, v_batch_paid_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_affiliate_manual_payout(uuid, text, text, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_affiliate_manual_payout(uuid, text, text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_affiliate_manual_payout(uuid, text, text, text, timestamptz, text) TO service_role;
