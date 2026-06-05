-- ============================================================
-- Affiliate Access Hardening
--
-- 1. Removes the affiliate SELECT policy on affiliate_clicks.
--    Raw click rows contain session_token, visitor_ip, referrer,
--    and user_agent — affiliates must not query them directly.
--    All click stats are served through get_affiliate_dashboard_stats().
--
-- 2. Tightens affiliate_assets access: active-affiliates-only
--    (replaces the overly broad "all authenticated users" policy).
--
-- 3. Adds a safe aggregate RPC get_affiliate_dashboard_stats()
--    that never exposes session_token, visitor_ip, user_agent,
--    raw referred_user_id values, or raw Stripe IDs.
--
-- 4. Adds a partial UNIQUE index on commission_ledger to prevent
--    duplicate reversal rows for the same order (idempotency guard
--    that complements the event-level stripe_webhooks deduplication).
-- ============================================================


-- ── 1. Drop affiliate SELECT policy on affiliate_clicks ──────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_clicks'
      AND policyname = 'Affiliates can read own clicks'
  ) THEN
    DROP POLICY "Affiliates can read own clicks" ON public.affiliate_clicks;
  END IF;
END $$;
-- After this drop, affiliate_clicks is accessible only to:
--   • Admins: via the existing "Admins have full access to affiliate_clicks" policy
--   • Service role: Edge Functions bypass RLS entirely
-- Affiliates call get_affiliate_dashboard_stats() for all aggregated stats.


-- ── 2. Replace overly broad affiliate_assets SELECT policy ───────────────────
-- Drop the old policy that let every authenticated user read assets.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_assets'
      AND policyname = 'Authenticated users can read active affiliate assets'
  ) THEN
    DROP POLICY "Authenticated users can read active affiliate assets"
      ON public.affiliate_assets;
  END IF;
END $$;

-- Add a policy that restricts reads to active affiliates and admins only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'affiliate_assets'
      AND policyname = 'Active affiliates and admins can read affiliate assets'
  ) THEN
    CREATE POLICY "Active affiliates and admins can read affiliate assets"
      ON public.affiliate_assets FOR SELECT TO authenticated
      USING (
        is_active = true
        AND (
          -- Admin access
          (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
          OR
          -- Active affiliate access (status must be 'active', not 'pending' or 'suspended')
          EXISTS (
            SELECT 1 FROM public.affiliates
            WHERE user_id = auth.uid()
              AND status   = 'active'
          )
        )
      );
  END IF;
END $$;


-- ── 3. Reversal idempotency — one reversal row per order ─────────────────────
-- Prevents duplicate reversal rows if a refund webhook is replayed or the
-- Edge Function retries. The event-level stripe_webhooks table deduplicates
-- the Stripe event itself; this index is the database-level complement
-- specific to commission reversal rows.
--
-- Note: subscription renewals each produce their own order_id, so one
-- reversal per order_id is semantically correct across all payment types.
CREATE UNIQUE INDEX IF NOT EXISTS commission_ledger_one_reversal_per_order_uidx
    ON public.commission_ledger (order_id)
    WHERE type = 'reversal'
      AND order_id IS NOT NULL;


-- ── 4. Safe aggregate dashboard stats RPC ────────────────────────────────────
--
-- Returns click, referral, and commission aggregates for one affiliate.
-- What this function intentionally NEVER exposes:
--   • session_token, visitor_ip, user_agent, referrer (from affiliate_clicks)
--   • referred_user_id values — only COUNTs
--   • raw Stripe IDs from commission rows
--   • customer emails
--
-- Access control: the calling user must own the affiliate row (user_id = auth.uid())
-- OR have is_admin = true in app_metadata. All other callers get an exception.
--
-- SECURITY DEFINER: runs as the function owner so it can read affiliate_clicks
-- (which has no SELECT policy for authenticated users) without granting that
-- permission to affiliates in general.
--
-- Stat definitions:
--   pending_commission_cents  — earned, currently in hold period, not yet batched
--   payable_commission_cents  — earned, past hold, not batched (net of reversals, ≥ 0)
--   paid_commission_cents     — earned rows whose payout batch status = 'paid'

CREATE OR REPLACE FUNCTION public.get_affiliate_dashboard_stats(
    p_affiliate_id uuid
)
RETURNS TABLE (
    clicks_count              bigint,
    converted_clicks_count    bigint,
    referrals_count           bigint,
    paid_customers_count      bigint,
    pending_commission_cents  bigint,
    payable_commission_cents  bigint,
    paid_commission_cents     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ownership or admin check.
    -- auth.uid() and auth.jwt() are session variables set by Supabase PostgREST
    -- and remain available inside SECURITY DEFINER functions.
    IF NOT (
        EXISTS (
            SELECT 1 FROM public.affiliates
            WHERE id      = p_affiliate_id
              AND user_id = auth.uid()
        )
        OR (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
    ) THEN
        RAISE EXCEPTION 'Access denied: you do not own this affiliate account.';
    END IF;

    RETURN QUERY
    SELECT

        -- ── Click stats (no raw click data) ──
        (
            SELECT COUNT(*)::bigint
            FROM public.affiliate_clicks ac
            WHERE ac.affiliate_id = p_affiliate_id
        ),

        (
            SELECT COUNT(*)::bigint
            FROM public.affiliate_clicks ac
            WHERE ac.affiliate_id = p_affiliate_id
              AND ac.converted    = true
        ),

        -- ── Referral stats ──
        (
            SELECT COUNT(*)::bigint
            FROM public.referrals r
            WHERE r.affiliate_id = p_affiliate_id
              AND r.status       = 'active'
        ),

        -- Count of distinct referred users with an active referral.
        -- User IDs are never returned — only the count.
        (
            SELECT COUNT(DISTINCT r.referred_user_id)::bigint
            FROM public.referrals r
            WHERE r.affiliate_id = p_affiliate_id
              AND r.status       = 'active'
        ),

        -- ── Commission stats ──

        -- Earned commissions in the hold period (locked, not yet payable)
        COALESCE((
            SELECT SUM(cl.amount_cents)::bigint
            FROM public.commission_ledger cl
            WHERE cl.affiliate_id    = p_affiliate_id
              AND cl.type            = 'earned'
              AND cl.hold_until      > now()
              AND cl.payout_batch_id IS NULL
        ), 0)::bigint,

        -- Net commissions past hold, not yet in a payout batch.
        -- Earned rows minus reversal rows (both past hold, no batch).
        -- Clamped to 0 — if more was reversed than earned, the floor is zero.
        GREATEST(0, COALESCE((
            SELECT SUM(
                CASE WHEN cl.type = 'earned'   THEN  cl.amount_cents
                     WHEN cl.type = 'reversal' THEN -cl.amount_cents
                     ELSE 0 END
            )::bigint
            FROM public.commission_ledger cl
            WHERE cl.affiliate_id    = p_affiliate_id
              AND cl.hold_until     <= now()
              AND cl.payout_batch_id IS NULL
        ), 0))::bigint,

        -- Earned commissions whose payout batch has been marked as paid
        COALESCE((
            SELECT SUM(cl.amount_cents)::bigint
            FROM public.commission_ledger cl
            JOIN public.payout_batches pb ON pb.id = cl.payout_batch_id
            WHERE cl.affiliate_id = p_affiliate_id
              AND cl.type         = 'earned'
              AND pb.status       = 'paid'
        ), 0)::bigint;

END;
$$;

REVOKE ALL    ON FUNCTION public.get_affiliate_dashboard_stats(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_affiliate_dashboard_stats(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_affiliate_dashboard_stats(uuid) TO service_role;
