-- Enables Admin access for the frontend React application where app_metadata.is_admin is explicitly true.
-- Specifically targeting the 'email_sends' table for Phase 2 operations.

DO $$ 
BEGIN
  IF to_regclass('public.email_sends') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'email_sends'
         AND policyname = 'Admins can view all email_sends'
     ) THEN
    CREATE POLICY "Admins can view all email_sends" ON public.email_sends FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END $$;
