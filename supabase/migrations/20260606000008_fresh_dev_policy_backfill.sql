-- Fresh-dev replay compatibility backfill.
-- Applies policies and legacy constraints skipped by guarded older migrations.

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS credit_balance integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS account_status_reason text,
      ADD COLUMN IF NOT EXISTS account_status_updated_at timestamptz,
      ADD COLUMN IF NOT EXISTS account_status_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS account_paused_at timestamptz,
      ADD COLUMN IF NOT EXISTS account_canceled_at timestamptz;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'profiles_credit_balance_nonnegative'
     ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_credit_balance_nonnegative
      CHECK (credit_balance >= 0);
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'profiles_account_status_check'
     ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'paused', 'canceled'));
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'profiles'
         AND policyname = 'Admins can read all profiles'
     ) THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Admins can read all profiles" ON public.profiles
      FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF to_regclass('public.contacts') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'contacts'
         AND policyname = 'Admins can view all contacts'
     ) THEN
    ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Admins can view all contacts" ON public.contacts
      FOR SELECT
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF to_regclass('public.email_sends') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'email_sends'
         AND policyname = 'Admins can view all email_sends'
     ) THEN
    ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Admins can view all email_sends" ON public.email_sends
      FOR SELECT
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF to_regclass('public.inbound_emails') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'inbound_emails'
         AND policyname = 'Admins have full access to inbound_emails'
     ) THEN
    ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Admins have full access to inbound_emails"
      ON public.inbound_emails FOR ALL
      TO authenticated
      USING (auth.jwt() -> 'app_metadata' ->> 'is_admin' = 'true')
      WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'is_admin' = 'true');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.contacts') IS NOT NULL
     AND to_regclass('public.inbound_emails') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'inbound_emails_contact_id_fkey'
         AND conrelid = to_regclass('public.inbound_emails')
     ) THEN
    ALTER TABLE public.inbound_emails
      ADD CONSTRAINT inbound_emails_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.contacts') IS NOT NULL
     AND to_regclass('public.email_sends') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'email_sends_contact_id_fkey'
         AND conrelid = to_regclass('public.email_sends')
     ) THEN
    ALTER TABLE public.email_sends
      ADD CONSTRAINT email_sends_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
  END IF;
END $$;
