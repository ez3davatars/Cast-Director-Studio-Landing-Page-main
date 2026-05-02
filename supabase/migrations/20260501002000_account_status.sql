-- Migration: Account Status Controls (Pause / Cancel / Reactivate)

-- 1. Add account status columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS account_status_reason text,
  ADD COLUMN IF NOT EXISTS account_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_status_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_canceled_at timestamptz;

-- 2. Add check constraint for allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'paused', 'canceled'));
  END IF;
END
$$;

-- 3. Add audit log columns for status tracking
ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS new_status text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false;

-- 4. Allow admins to read all profiles (required for admin CRM to view customer data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can read all profiles'
  ) THEN
    CREATE POLICY "Admins can read all profiles" ON public.profiles
      FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END
$$;
