-- ============================================================
-- Affiliate Manual Payout Proof RPC
--
-- Depends on 20260606000011_affiliate_payout_connect_fields.sql for
-- payout_items payment proof columns. This RPC records that money was
-- already sent outside Cast Director Studio; it does not send funds.
-- ============================================================

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
