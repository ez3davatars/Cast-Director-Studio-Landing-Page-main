-- Update admin_create_affiliate so newly-created default affiliate links
-- send visitors to the landing hero instead of directly to pricing.

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

    -- Validate code format (lowercase alphanum + hyphens, 2-40 chars)
    IF v_code !~ '^[a-z0-9][a-z0-9\-]{1,39}$' THEN
        RAISE EXCEPTION 'Code must be 2-40 characters: lowercase letters, numbers, hyphens only.';
    END IF;

    -- Look up user by email (requires auth.users access - safe inside SECURITY DEFINER)
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
    -- destination_url = '/' so referred visitors see the landing hero first.
    -- Uses the same code as the affiliate for the canonical ?ref= link.
    -- If affiliate_links.code already conflicts (edge case: two affiliates
    -- with identical codes), the unique index raises 23505 and the whole
    -- transaction rolls back - no orphaned affiliate row.
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
        '/',
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
