-- Affiliate application intake for logged-in non-affiliate users.

CREATE TABLE IF NOT EXISTS public.affiliate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  website_url text,
  social_url text,
  audience_description text,
  promotion_plan text,
  estimated_audience_size text,
  primary_country text,
  status text NOT NULL DEFAULT 'pending',
  agreed_to_terms boolean NOT NULL DEFAULT false,
  agreed_to_disclosure_rules boolean NOT NULL DEFAULT false,
  admin_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT affiliate_applications_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'))
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_applications_one_pending_per_user_uidx
  ON public.affiliate_applications (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS affiliate_applications_user_id_idx
  ON public.affiliate_applications (user_id);

CREATE INDEX IF NOT EXISTS affiliate_applications_status_created_idx
  ON public.affiliate_applications (status, created_at DESC);

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.affiliate_applications') IS NOT NULL
     AND to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_affiliate_applications_set_updated_at
      ON public.affiliate_applications;
    CREATE TRIGGER trg_affiliate_applications_set_updated_at
      BEFORE UPDATE ON public.affiliate_applications
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF to_regclass('public.affiliate_applications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'affiliate_applications'
         AND policyname = 'Admins can read all affiliate applications'
     ) THEN
    CREATE POLICY "Admins can read all affiliate applications"
      ON public.affiliate_applications FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF to_regclass('public.affiliate_applications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'affiliate_applications'
         AND policyname = 'Admins can update all affiliate applications'
     ) THEN
    CREATE POLICY "Admins can update all affiliate applications"
      ON public.affiliate_applications FOR UPDATE TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF to_regclass('public.affiliate_applications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'affiliate_applications'
         AND policyname = 'Users can create own affiliate application'
     ) THEN
    CREATE POLICY "Users can create own affiliate application"
      ON public.affiliate_applications FOR INSERT TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND lower(email) = lower(auth.jwt() ->> 'email')
        AND status = 'pending'
        AND agreed_to_terms = true
        AND agreed_to_disclosure_rules = true
      );
  END IF;

  IF to_regclass('public.affiliate_applications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'affiliate_applications'
         AND policyname = 'Users can read own affiliate applications'
     ) THEN
    CREATE POLICY "Users can read own affiliate applications"
      ON public.affiliate_applications FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF to_regclass('public.affiliate_applications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'affiliate_applications'
         AND policyname = 'Users can update own pending affiliate application'
     ) THEN
    CREATE POLICY "Users can update own pending affiliate application"
      ON public.affiliate_applications FOR UPDATE TO authenticated
      USING (user_id = auth.uid() AND status = 'pending')
      WITH CHECK (
        user_id = auth.uid()
        AND status IN ('pending', 'withdrawn')
        AND agreed_to_terms = true
        AND agreed_to_disclosure_rules = true
      );
  END IF;
END $$;
