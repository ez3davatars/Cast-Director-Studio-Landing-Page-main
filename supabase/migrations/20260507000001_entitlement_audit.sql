-- Migration: License Management & Entitlement Audit

-- Create entitlement_events table
CREATE TABLE IF NOT EXISTS public.entitlement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'license', 'subscription', 'credit'
    entity_id UUID NOT NULL,
    user_id UUID,
    event_type TEXT NOT NULL, -- 'manual_deactivate', 'auto_refund', 'partial_refund_flag'
    previous_status TEXT,
    new_status TEXT,
    reason TEXT,
    admin_user_id UUID REFERENCES auth.users(id),
    stripe_event_id TEXT,
    review_required BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on entitlement_events
ALTER TABLE public.entitlement_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view entitlement events" ON public.entitlement_events FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- Helper to check if caller is admin
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action.';
    END IF;
END;
$$;

-- RPC: admin_deactivate_license
CREATE OR REPLACE FUNCTION public.admin_deactivate_license(
    p_license_id uuid,
    p_reason text,
    p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_previous_status text;
    v_admin_id uuid;
BEGIN
    PERFORM check_is_admin();
    v_admin_id := auth.uid();

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A reason is required.';
    END IF;

    SELECT user_id, status::text INTO v_user_id, v_previous_status
    FROM public.licenses
    WHERE id = p_license_id
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'License not found.';
    END IF;

    IF v_previous_status = 'inactive' THEN
        RAISE EXCEPTION 'License is already inactive.';
    END IF;

    UPDATE public.licenses
    SET status = 'inactive', updated_at = NOW()
    WHERE id = p_license_id;

    INSERT INTO public.entitlement_events (
        entity_type, entity_id, user_id, event_type, previous_status, new_status, reason, admin_user_id, metadata
    ) VALUES (
        'license', p_license_id, v_user_id, 'manual_deactivate', v_previous_status, 'inactive', trim(p_reason), v_admin_id,
        jsonb_build_object('internal_note', trim(p_internal_note))
    );

    RETURN jsonb_build_object('license_id', p_license_id, 'new_status', 'inactive');
END;
$$;

-- RPC: admin_reactivate_license
CREATE OR REPLACE FUNCTION public.admin_reactivate_license(
    p_license_id uuid,
    p_reason text,
    p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_previous_status text;
    v_admin_id uuid;
BEGIN
    PERFORM check_is_admin();
    v_admin_id := auth.uid();

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A reason is required.';
    END IF;

    SELECT user_id, status::text INTO v_user_id, v_previous_status
    FROM public.licenses
    WHERE id = p_license_id
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'License not found.';
    END IF;

    IF v_previous_status = 'active' THEN
        RAISE EXCEPTION 'License is already active.';
    END IF;

    UPDATE public.licenses
    SET status = 'active', updated_at = NOW()
    WHERE id = p_license_id;

    INSERT INTO public.entitlement_events (
        entity_type, entity_id, user_id, event_type, previous_status, new_status, reason, admin_user_id, metadata
    ) VALUES (
        'license', p_license_id, v_user_id, 'manual_reactivate', v_previous_status, 'active', trim(p_reason), v_admin_id,
        jsonb_build_object('internal_note', trim(p_internal_note))
    );

    RETURN jsonb_build_object('license_id', p_license_id, 'new_status', 'active');
END;
$$;

-- RPC: admin_mark_license_refunded
CREATE OR REPLACE FUNCTION public.admin_mark_license_refunded(
    p_license_id uuid,
    p_reason text,
    p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_previous_status text;
    v_admin_id uuid;
BEGIN
    PERFORM check_is_admin();
    v_admin_id := auth.uid();

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A reason is required.';
    END IF;

    SELECT user_id, status::text INTO v_user_id, v_previous_status
    FROM public.licenses
    WHERE id = p_license_id
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'License not found.';
    END IF;

    IF v_previous_status = 'refunded' THEN
        RAISE EXCEPTION 'License is already marked refunded.';
    END IF;

    UPDATE public.licenses
    SET status = 'refunded', updated_at = NOW()
    WHERE id = p_license_id;

    INSERT INTO public.entitlement_events (
        entity_type, entity_id, user_id, event_type, previous_status, new_status, reason, admin_user_id, metadata
    ) VALUES (
        'license', p_license_id, v_user_id, 'manual_mark_refunded', v_previous_status, 'refunded', trim(p_reason), v_admin_id,
        jsonb_build_object('internal_note', trim(p_internal_note))
    );

    RETURN jsonb_build_object('license_id', p_license_id, 'new_status', 'refunded');
END;
$$;

-- RPC: admin_mark_license_swapped
CREATE OR REPLACE FUNCTION public.admin_mark_license_swapped(
    p_license_id uuid,
    p_reason text,
    p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_previous_status text;
    v_admin_id uuid;
BEGIN
    PERFORM check_is_admin();
    v_admin_id := auth.uid();

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A reason is required.';
    END IF;

    SELECT user_id, status::text INTO v_user_id, v_previous_status
    FROM public.licenses
    WHERE id = p_license_id
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'License not found.';
    END IF;

    IF v_previous_status = 'swapped' THEN
        RAISE EXCEPTION 'License is already marked swapped.';
    END IF;

    UPDATE public.licenses
    SET status = 'swapped', updated_at = NOW()
    WHERE id = p_license_id;

    INSERT INTO public.entitlement_events (
        entity_type, entity_id, user_id, event_type, previous_status, new_status, reason, admin_user_id, metadata
    ) VALUES (
        'license', p_license_id, v_user_id, 'manual_mark_swapped', v_previous_status, 'swapped', trim(p_reason), v_admin_id,
        jsonb_build_object('internal_note', trim(p_internal_note))
    );

    RETURN jsonb_build_object('license_id', p_license_id, 'new_status', 'swapped');
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.admin_deactivate_license(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_license(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reactivate_license(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_license(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_mark_license_refunded(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_license_refunded(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_mark_license_swapped(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_license_swapped(uuid, text, text) TO authenticated;
