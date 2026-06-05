-- ============================================================
-- Affiliate RLS Policies
-- Covers all 9 affiliate tables.
--
-- Admin pattern (matches all other CRM tables in this codebase):
--   (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
--
-- Affiliate-self pattern:
--   row's affiliate_id resolves to affiliates.user_id = auth.uid()
--
-- Service role (Edge Functions) bypasses RLS entirely — no policy
-- needed for Edge Function writes.
-- ============================================================

-- Enable RLS on every affiliate table
ALTER TABLE public.affiliates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_assets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_notes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_items      ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN

  -- ── affiliates ───────────────────────────────────────────────────────────────
  -- Admin: full access.
  -- Affiliate: read their own row (to display dashboard stats, commission_rate, etc.).
  -- No client-side insert/update — admin creates via Edge Function or direct service call.

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliates' AND policyname = 'Admins have full access to affiliates'
  ) THEN
    CREATE POLICY "Admins have full access to affiliates"
      ON public.affiliates FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliates' AND policyname = 'Affiliates can read own row'
  ) THEN
    CREATE POLICY "Affiliates can read own row"
      ON public.affiliates FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;


  -- ── affiliate_links ──────────────────────────────────────────────────────────
  -- Admin: full access.
  -- Affiliate: read their own links (to display in dashboard).

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_links' AND policyname = 'Admins have full access to affiliate_links'
  ) THEN
    CREATE POLICY "Admins have full access to affiliate_links"
      ON public.affiliate_links FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_links' AND policyname = 'Affiliates can read own links'
  ) THEN
    CREATE POLICY "Affiliates can read own links"
      ON public.affiliate_links FOR SELECT TO authenticated
      USING (
        affiliate_id IN (
          SELECT id FROM public.affiliates WHERE user_id = auth.uid()
        )
      );
  END IF;


  -- ── affiliate_clicks ─────────────────────────────────────────────────────────
  -- Admin: full access.
  -- Affiliate: read their own clicks (for stats display).
  -- No client insert — record-affiliate-click Edge Function uses service role.

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_clicks' AND policyname = 'Admins have full access to affiliate_clicks'
  ) THEN
    CREATE POLICY "Admins have full access to affiliate_clicks"
      ON public.affiliate_clicks FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_clicks' AND policyname = 'Affiliates can read own clicks'
  ) THEN
    CREATE POLICY "Affiliates can read own clicks"
      ON public.affiliate_clicks FOR SELECT TO authenticated
      USING (
        affiliate_id IN (
          SELECT id FROM public.affiliates WHERE user_id = auth.uid()
        )
      );
  END IF;


  -- ── affiliate_assets ─────────────────────────────────────────────────────────
  -- Admin: full access (create/update/delete assets).
  -- Authenticated (any logged-in user, including affiliates): read active assets only.
  -- Public (anon): no access — assets are for logged-in affiliates only.

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_assets' AND policyname = 'Admins have full access to affiliate_assets'
  ) THEN
    CREATE POLICY "Admins have full access to affiliate_assets"
      ON public.affiliate_assets FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_assets' AND policyname = 'Authenticated users can read active affiliate assets'
  ) THEN
    CREATE POLICY "Authenticated users can read active affiliate assets"
      ON public.affiliate_assets FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;


  -- ── affiliate_notes ───────────────────────────────────────────────────────────
  -- Admin-only. Affiliates cannot see internal notes about themselves.

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_notes' AND policyname = 'Admins have full access to affiliate_notes'
  ) THEN
    CREATE POLICY "Admins have full access to affiliate_notes"
      ON public.affiliate_notes FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;


  -- ── referrals ─────────────────────────────────────────────────────────────────
  -- Admin: full access.
  -- Affiliate: read their own referrals (conversion count, commission window, etc.).

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referrals' AND policyname = 'Admins have full access to referrals'
  ) THEN
    CREATE POLICY "Admins have full access to referrals"
      ON public.referrals FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referrals' AND policyname = 'Affiliates can read own referrals'
  ) THEN
    CREATE POLICY "Affiliates can read own referrals"
      ON public.referrals FOR SELECT TO authenticated
      USING (
        affiliate_id IN (
          SELECT id FROM public.affiliates WHERE user_id = auth.uid()
        )
      );
  END IF;


  -- ── commission_ledger ─────────────────────────────────────────────────────────
  -- Admin: full access (read + payout assignment via Edge Function).
  -- Affiliate: read their own commission rows (earnings, hold status).
  -- No client insert/update/delete — all writes are from stripe-webhook Edge Function.
  -- The immutability trigger in migration 20260606000002 provides an additional
  -- database-level guard independent of RLS.

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_ledger' AND policyname = 'Admins have full access to commission_ledger'
  ) THEN
    CREATE POLICY "Admins have full access to commission_ledger"
      ON public.commission_ledger FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'commission_ledger' AND policyname = 'Affiliates can read own commission ledger'
  ) THEN
    CREATE POLICY "Affiliates can read own commission ledger"
      ON public.commission_ledger FOR SELECT TO authenticated
      USING (
        affiliate_id IN (
          SELECT id FROM public.affiliates WHERE user_id = auth.uid()
        )
      );
  END IF;


  -- ── payout_batches ────────────────────────────────────────────────────────────
  -- Admin: full access.
  -- Affiliate: read batches that include one of their payout items.
  --            (So they can see payout history and status.)

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payout_batches' AND policyname = 'Admins have full access to payout_batches'
  ) THEN
    CREATE POLICY "Admins have full access to payout_batches"
      ON public.payout_batches FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payout_batches' AND policyname = 'Affiliates can read payout batches containing their items'
  ) THEN
    CREATE POLICY "Affiliates can read payout batches containing their items"
      ON public.payout_batches FOR SELECT TO authenticated
      USING (
        id IN (
          SELECT pi.batch_id
          FROM public.payout_items pi
          JOIN public.affiliates a ON a.id = pi.affiliate_id
          WHERE a.user_id = auth.uid()
        )
      );
  END IF;


  -- ── payout_items ──────────────────────────────────────────────────────────────
  -- Admin: full access.
  -- Affiliate: read their own payout items.

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payout_items' AND policyname = 'Admins have full access to payout_items'
  ) THEN
    CREATE POLICY "Admins have full access to payout_items"
      ON public.payout_items FOR ALL TO authenticated
      USING  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payout_items' AND policyname = 'Affiliates can read own payout items'
  ) THEN
    CREATE POLICY "Affiliates can read own payout items"
      ON public.payout_items FOR SELECT TO authenticated
      USING (
        affiliate_id IN (
          SELECT id FROM public.affiliates WHERE user_id = auth.uid()
        )
      );
  END IF;

END $$;
