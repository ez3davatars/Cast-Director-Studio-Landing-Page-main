-- ============================================================
-- Affiliate Admin RPCs
--
-- 1. Harden admin_get_user_id_by_email
--    The function already existed (20260501001000_admin_force_claim_helpers.sql)
--    but was callable by ALL authenticated users — a privacy leak.
--    This migration replaces it with a version that requires either:
--      a. is_admin = true in app_metadata (authenticated admin users), OR
--      b. service_role JWT (Edge Functions using the service role key, e.g.
--         admin-force-claim — they have no user JWT, only role = 'service_role')
--
-- 2. admin_create_affiliate
--    Atomically: looks up user by email, creates affiliates row, creates the
--    default affiliate_links row (code=affiliate_code, dest=/pricing).
--    The whole operation is one Postgres transaction — no partial state.
--
-- 3. admin_create_affiliate_payout_batch
--    Atomically: finds eligible commission_ledger rows, enforces minimum
--    payout per affiliate, creates payout_batches, payout_items, and assigns
--    commission_ledger.payout_batch_id + payout_item_id.
--    Full rollback on any failure — no partial batches possible.
-- ============================================================


-- ── 1. Harden admin_get_user_id_by_email ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role    text;
    v_is_admin boolean;
    v_user_id uuid;
BEGIN
    -- Determine caller identity
    v_role     := auth.jwt() ->> 'role';
    v_is_admin := (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean;

    -- Allow: service_role (Edge Functions) or authenticated admins
    IF NOT (v_role = 'service_role' OR v_is_admin = true) THEN
        RAISE EXCEPTION 'Access denied: admin only.';
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = lower(trim(p_email))
    LIMIT 1;

    RETURN v_user_id;
END;
$$;

-- Grants unchanged — service_role and authenticated both permitted;
-- the function body enforces the admin/service_role distinction.
REVOKE ALL ON FUNCTION public.admin_get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_id_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_id_by_email(text) TO authenticated;


-- ── 2. admin_create_affiliate ─────────────────────────────────────────────────
--
-- Creates an affiliate row and its default tracking link in one transaction.
-- Called from /admin/affiliates "New Affiliate" modal.
--
-- Returns: TABLE(affiliate_id uuid, link_id uuid)

CREATE OR REPLACE FUNCTION public.admin_create_affiliate(
    p_email                      text,
    p_code                       text,
    p_commission_rate            numeric  DEFAULT 0.30,
    p_commission_duration_months integer  DEFAULT 12
)
RETURNS TABLE (affiliate_id uuid, link_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email        text    := lower(trim(p_email));
    v_code         text    := lower(trim(p_code));
    v_user_id      uuid;
    v_affiliate_id uuid;
    v_link_id      uuid;
BEGIN
    -- Admin-only
    IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
        RAISE EXCEPTION 'Access denied: admin only.';
    END IF;

    -- Input validation
    IF v_email = '' OR v_code = '' THEN
        RAISE EXCEPTION 'Email and code are required.';
    END IF;
    IF p_commission_rate <= 0 OR p_commission_rate > 1 THEN
        RAISE EXCEPTION 'Commission rate must be between 0.01 and 1.00.';
    END IF;
    IF p_commission_duration_months < 1 THEN
        RAISE EXCEPTION 'Commission duration must be at least 1 month.';
    END IF;

    -- Validate code format (lowercase alphanum + hyphens, 2–40 chars)
    IF v_code !~ '^[a-z0-9][a-z0-9\-]{1,39}$' THEN
        RAISE EXCEPTION 'Code must be 2–40 characters: lowercase letters, numbers, hyphens only.';
    END IF;

    -- Look up user by email (requires auth.users access — safe inside SECURITY DEFINER)
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No registered account found for: %', v_email;
    END IF;

    -- Duplicate affiliate check (one affiliate per user)
    IF EXISTS (SELECT 1 FROM public.affiliates WHERE user_id = v_user_id) THEN
        RAISE EXCEPTION 'User already has an affiliate account.';
    END IF;

    -- Duplicate code check
    IF EXISTS (SELECT 1 FROM public.affiliates WHERE lower(code) = v_code) THEN
        RAISE EXCEPTION 'Affiliate code "%" is already in use.', v_code;
    END IF;

    -- Create affiliate (status = pending; admin activates separately)
    INSERT INTO public.affiliates (
        user_id,
        contact_email,
        code,
        status,
        commission_rate,
        commission_duration_months
    )
    VALUES (
        v_user_id,
        v_email,
        v_code,
        'pending',
        p_commission_rate,
        p_commission_duration_months
    )
    RETURNING id INTO v_affiliate_id;

    -- Create default tracking link.
    -- destination_url = '/pricing' (the primary conversion page).
    -- Uses the same code as the affiliate for the canonical ?ref= link.
    -- If affiliate_links.code already conflicts (edge case: two affiliates
    -- with identical codes), the unique index raises 23505 and the whole
    -- transaction rolls back — no orphaned affiliate row.
    INSERT INTO public.affiliate_links (
        affiliate_id,
        code,
        destination_url,
        campaign,
        is_active
    )
    VALUES (
        v_affiliate_id,
        v_code,
        '/pricing',
        'default',
        true
    )
    RETURNING id INTO v_link_id;

    RETURN QUERY SELECT v_affiliate_id, v_link_id;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_create_affiliate(text, text, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_affiliate(text, text, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_affiliate(text, text, numeric, integer) TO service_role;


-- ── 3. admin_create_affiliate_payout_batch ───────────────────────────────────
--
-- Replaces the multi-step client-side batch creation in /admin/payouts.
-- Everything runs inside a single Postgres transaction — either the entire
-- batch (batch row + all items + all ledger assignments) commits, or nothing
-- does. No partial batches are possible.
--
-- Logic per selected affiliate:
--   • Sum commission_ledger rows: earned - reversals, payout_batch_id IS NULL,
--     hold_until <= now()
--   • Skip affiliates below their minimum_payout_cents
--   • Create payout_items row
--   • UPDATE commission_ledger SET payout_batch_id, payout_item_id
--     (the immutability trigger allows these two columns to be updated)
--
-- Returns: TABLE(batch_id uuid, total_amount_cents bigint, affiliate_count integer)

CREATE OR REPLACE FUNCTION public.admin_create_affiliate_payout_batch(
    p_affiliate_ids  uuid[],
    p_notes          text DEFAULT NULL
)
RETURNS TABLE (
    batch_id          uuid,
    total_amount_cents bigint,
    affiliate_count   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id      uuid;
    v_batch_id      uuid;
    v_total_cents   bigint  := 0;
    v_aff_count     integer := 0;
    v_now           timestamptz := now();
    v_aff_id        uuid;
    v_net_cents     bigint;
    v_min_payout    integer;
    v_paypal_email  text;
    v_item_id       uuid;
BEGIN
    -- Admin-only
    IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
        RAISE EXCEPTION 'Access denied: admin only.';
    END IF;

    v_admin_id := auth.uid();

    IF p_affiliate_ids IS NULL OR array_length(p_affiliate_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No affiliates selected.';
    END IF;

    -- Create the batch record (total will be updated at the end)
    INSERT INTO public.payout_batches (status, total_amount_cents, notes, created_by)
    VALUES ('draft', 0, p_notes, v_admin_id)
    RETURNING id INTO v_batch_id;

    -- Process each selected affiliate
    FOREACH v_aff_id IN ARRAY p_affiliate_ids LOOP

        -- Compute net payable: earned minus reversals, unbatched, past hold
        SELECT COALESCE(
            SUM(CASE
                    WHEN type = 'earned'   THEN  amount_cents
                    WHEN type = 'reversal' THEN -amount_cents
                    ELSE 0
                END
            ), 0
        )
        INTO v_net_cents
        FROM public.commission_ledger
        WHERE affiliate_id    = v_aff_id
          AND payout_batch_id IS NULL
          AND hold_until      <= v_now;

        -- Get affiliate settings
        SELECT minimum_payout_cents, paypal_email
        INTO   v_min_payout, v_paypal_email
        FROM   public.affiliates
        WHERE  id = v_aff_id;

        -- Skip if nothing payable or below minimum payout
        IF v_net_cents <= 0 OR v_net_cents < COALESCE(v_min_payout, 5000) THEN
            CONTINUE;
        END IF;

        -- Create payout item
        INSERT INTO public.payout_items (
            batch_id,
            affiliate_id,
            amount_cents,
            paypal_email,
            status
        )
        VALUES (v_batch_id, v_aff_id, v_net_cents, v_paypal_email, 'pending')
        RETURNING id INTO v_item_id;

        -- Assign eligible commission_ledger rows to this batch + item.
        -- The commission_ledger_guard_update trigger allows updates that only
        -- change payout_batch_id and payout_item_id — this UPDATE qualifies.
        UPDATE public.commission_ledger
        SET    payout_batch_id = v_batch_id,
               payout_item_id  = v_item_id
        WHERE  affiliate_id    = v_aff_id
          AND  payout_batch_id IS NULL
          AND  hold_until      <= v_now;

        v_total_cents := v_total_cents + v_net_cents;
        v_aff_count   := v_aff_count + 1;

    END LOOP;

    -- Fail (and roll back everything) if none of the selected affiliates
    -- had eligible, above-minimum payable commissions.
    IF v_aff_count = 0 THEN
        RAISE EXCEPTION
            'No eligible affiliates in selection. '
            'All selected affiliates are either below their minimum payout '
            'threshold or have no commissions past the hold period.';
    END IF;

    -- Patch the batch total with the actual computed amount
    UPDATE public.payout_batches
    SET    total_amount_cents = v_total_cents
    WHERE  id = v_batch_id;

    RETURN QUERY SELECT v_batch_id, v_total_cents, v_aff_count;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_create_affiliate_payout_batch(uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_affiliate_payout_batch(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_affiliate_payout_batch(uuid[], text) TO service_role;
