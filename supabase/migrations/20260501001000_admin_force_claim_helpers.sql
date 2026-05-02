-- Admin Force Claim Helpers

-- 1. Create a secure RPC to fetch an auth.users UUID by email
-- This avoids downloading the entire user directory via the JS client
CREATE OR REPLACE FUNCTION public.admin_get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM auth.users WHERE email = lower(p_email) LIMIT 1;
$$;

-- Grant execute securely
REVOKE ALL ON FUNCTION public.admin_get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_id_by_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_id_by_email(text) TO authenticated;

-- 2. Create an admin audit logging table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    target_email text NOT NULL,
    target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action text NOT NULL,
    created_auth_user boolean DEFAULT false,
    linked_orders_count integer DEFAULT 0,
    linked_subscriptions_count integer DEFAULT 0,
    linked_licenses_count integer DEFAULT 0,
    linked_downloads_count integer DEFAULT 0,
    linked_contacts_count integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read logs, service_role can write logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'admin_audit_logs' AND policyname = 'Admins can view audit logs') THEN
    CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END
$$;
