-- 1. Create audit log table to track account claiming history
CREATE TABLE IF NOT EXISTS public.claim_audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL, -- references auth.users(id) conceptually
    email text NOT NULL,
    claimed_orders int DEFAULT 0,
    claimed_contacts int DEFAULT 0,
    claimed_licenses int DEFAULT 0,
    claimed_downloads int DEFAULT 0,
    claimed_subscriptions int DEFAULT 0,
    claimed_at timestamptz DEFAULT now()
);

-- Enable RLS so users can only see their own logs if queried via frontend
ALTER TABLE public.claim_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own audit logs" 
    ON public.claim_audit_logs FOR SELECT 
    USING (auth.uid() = user_id);

-- 2. Create the secure claiming RPC function
-- SECURITY DEFINER allows this function to securely bypass RLS and `auth.users` blocks internal to the function body, 
-- ensuring unauthenticated users or malicious actors cannot manipulate `user_id`s on arbitrary rows.
CREATE OR REPLACE FUNCTION public.claim_guest_purchases()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_email text;
    v_stripe_customer_id text;
    
    v_claimed_contacts int := 0;
    v_claimed_orders int := 0;
    v_claimed_licenses int := 0;
    v_claimed_downloads int := 0;
    v_claimed_subscriptions int := 0;

    v_order_ids uuid[];
BEGIN
    -- 1. Strict Authentication Check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated: Only signed-in users can claim purchases.';
    END IF;

    -- Extract verified email safely from the JWT session (source of truth)
    v_email := auth.jwt()->>'email';
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Session missing email payload.';
    END IF;

    -- 2. Claim Contacts (Exact Match on email)
    WITH updated_contacts AS (
        UPDATE public.contacts
        SET user_id = v_user_id, updated_at = now()
        WHERE email = v_email AND user_id IS NULL
        RETURNING stripe_customer_id
    )
    SELECT count(*), max(stripe_customer_id) INTO v_claimed_contacts, v_stripe_customer_id
    FROM updated_contacts;

    -- 3. Claim Orders (Exact Match on customer_email)
    WITH updated_orders AS (
        UPDATE public.orders
        SET user_id = v_user_id, updated_at = now()
        WHERE customer_email = v_email AND user_id IS NULL
        RETURNING id, stripe_customer_id
    )
    SELECT count(*), array_agg(id) INTO v_claimed_orders, v_order_ids
    FROM updated_orders;

    -- If the contact table didn't yield a stripe_customer_id, try recovering it from the newly claimed orders
    IF v_stripe_customer_id IS NULL THEN
        SELECT stripe_customer_id INTO v_stripe_customer_id
        FROM public.orders
        WHERE customer_email = v_email AND stripe_customer_id IS NOT NULL AND stripe_customer_id != ''
        LIMIT 1;
    END IF;

    -- 4. Claim Licenses and Downloads (Nested relationships via order_id)
    IF v_order_ids IS NOT NULL AND array_length(v_order_ids, 1) > 0 THEN
        WITH updated_licenses AS (
            UPDATE public.licenses
            SET user_id = v_user_id, updated_at = now()
            WHERE order_id = ANY(v_order_ids) AND user_id IS NULL
            RETURNING id
        )
        SELECT count(*) INTO v_claimed_licenses FROM updated_licenses;

        WITH updated_downloads AS (
            UPDATE public.downloads
            SET user_id = v_user_id
            -- note: downloads usually don't have updated_at
            WHERE order_id = ANY(v_order_ids) AND user_id IS NULL
            RETURNING id
        )
        SELECT count(*) INTO v_claimed_downloads FROM updated_downloads;
    END IF;

    -- 5. Claim Subscriptions (Safely matched by stripe_customer_id)
    IF v_stripe_customer_id IS NOT NULL THEN
        WITH updated_subs AS (
            UPDATE public.subscriptions
            SET user_id = v_user_id, updated_at = now()
            WHERE stripe_customer_id = v_stripe_customer_id AND user_id IS NULL
            RETURNING id
        )
        SELECT count(*) INTO v_claimed_subscriptions FROM updated_subs;
    END IF;

    -- 6. Insert Audit Log for historical tracking
    IF (v_claimed_contacts > 0 OR v_claimed_orders > 0 OR v_claimed_licenses > 0 OR v_claimed_downloads > 0 OR v_claimed_subscriptions > 0) THEN
        INSERT INTO public.claim_audit_logs 
        (user_id, email, claimed_contacts, claimed_orders, claimed_licenses, claimed_downloads, claimed_subscriptions)
        VALUES 
        (v_user_id, v_email, v_claimed_contacts, v_claimed_orders, v_claimed_licenses, v_claimed_downloads, v_claimed_subscriptions);
    END IF;

    -- 7. Return structured summary
    RETURN json_build_object(
        'contacts', v_claimed_contacts,
        'orders', v_claimed_orders,
        'licenses', v_claimed_licenses,
        'downloads', v_claimed_downloads,
        'subscriptions', v_claimed_subscriptions
    );
END;
$$;
