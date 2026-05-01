-- Migration: Add Credits from Admin Dashboard

CREATE OR REPLACE FUNCTION public.admin_add_credits(
    p_contact_email text,
    p_amount integer,
    p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_balance_before integer;
    v_balance_after integer;
BEGIN
    -- 1. Check if the caller is an admin
    IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can adjust credits.';
    END IF;

    -- 2. Retrieve user_id from crm_contacts
    SELECT user_id INTO v_user_id
    FROM public.crm_contacts
    WHERE email = p_contact_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Contact not found or has not claimed an account (no user_id).';
    END IF;

    -- 3. Lock profile and fetch balance
    SELECT credit_balance INTO v_balance_before
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_balance_before IS NULL THEN
        RAISE EXCEPTION 'Profile not found for user_id: %', v_user_id;
    END IF;

    -- 4. Update balance
    v_balance_after := v_balance_before + p_amount;
    
    -- Ensure balance does not drop below zero, though we might allow it depending on rules. 
    -- But our constraint `profiles_credit_balance_nonnegative` will fail if < 0.
    IF v_balance_after < 0 THEN
        RAISE EXCEPTION 'Credit adjustment would result in a negative balance.';
    END IF;

    UPDATE public.profiles
    SET credit_balance = v_balance_after
    WHERE id = v_user_id;

    -- 5. Insert ledger entry
    -- Note: We use amount = p_amount. If p_amount is 0, credit_transactions_amount_nonzero will fail.
    IF p_amount <> 0 THEN
        INSERT INTO public.credit_transactions (
            user_id,
            kind,
            amount,
            balance_before,
            balance_after,
            reason,
            metadata
        ) VALUES (
            v_user_id,
            'MANUAL_ADJUSTMENT',
            p_amount,
            v_balance_before,
            v_balance_after,
            p_reason,
            jsonb_build_object(
                'adjusted_by', auth.uid(),
                'contact_email', p_contact_email
            )
        );
    END IF;

    RETURN v_balance_after;
END;
$$;

-- Grant execute to authenticated users (the function itself enforces is_admin)
REVOKE ALL ON FUNCTION public.admin_add_credits(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_credits(text, integer, text) TO authenticated;
