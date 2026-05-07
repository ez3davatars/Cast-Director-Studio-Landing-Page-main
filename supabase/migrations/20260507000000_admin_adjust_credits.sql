-- Migration: Admin Credit Adjustment
-- Add ADMIN_ADJUSTMENT to credit_transaction_kind if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.credit_transaction_kind'::regtype
    AND enumlabel = 'ADMIN_ADJUSTMENT'
  ) THEN
    ALTER TYPE public.credit_transaction_kind ADD VALUE 'ADMIN_ADJUSTMENT';
  END IF;
END$$;

-- Create secure RPC
CREATE OR REPLACE FUNCTION public.admin_adjust_user_credits(
    p_user_id uuid,
    p_amount integer,
    p_reason text,
    p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance_before integer;
    v_balance_after integer;
    v_admin_id uuid;
BEGIN
    -- 1. Check if caller is admin
    IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can adjust credits.';
    END IF;

    v_admin_id := auth.uid();

    -- 2. Validate amount and reason
    IF p_amount = 0 THEN
        RAISE EXCEPTION 'Adjustment amount cannot be zero.';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A reason is required.';
    END IF;

    -- 3. Lock profile and fetch balance
    SELECT credit_balance INTO v_balance_before
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_balance_before IS NULL THEN
        RAISE EXCEPTION 'Profile not found for user_id: %', p_user_id;
    END IF;

    -- 4. Calculate balance_after
    v_balance_after := v_balance_before + p_amount;

    IF v_balance_after < 0 THEN
        RAISE EXCEPTION 'This adjustment would make the customer’s balance negative.';
    END IF;

    -- 5. Update balance
    UPDATE public.profiles
    SET credit_balance = v_balance_after
    WHERE id = p_user_id;

    -- 6. Insert ledger entry
    INSERT INTO public.credit_transactions (
        user_id,
        kind,
        amount,
        balance_before,
        balance_after,
        reason,
        metadata
    ) VALUES (
        p_user_id,
        'ADMIN_ADJUSTMENT',
        p_amount,
        v_balance_before,
        v_balance_after,
        trim(p_reason),
        jsonb_build_object(
            'adjusted_by', v_admin_id,
            'internal_note', trim(p_internal_note)
        )
    );

    -- 7. Return summary
    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'balance_before', v_balance_before,
        'adjustment', p_amount,
        'balance_after', v_balance_after
    );
END;
$$;

-- Grant execute
REVOKE ALL ON FUNCTION public.admin_adjust_user_credits(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_credits(uuid, integer, text, text) TO authenticated;
