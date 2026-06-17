-- Admin dashboard flow upgrades.
-- Adds a compact admin summary RPC and a real source of truth for affiliate
-- program operating terms. All objects are guarded/idempotent for fresh dev.

CREATE TABLE IF NOT EXISTS public.affiliate_program_settings (
  id text PRIMARY KEY DEFAULT 'default',
  commission_rate numeric NOT NULL DEFAULT 0.30,
  commission_duration_months integer NOT NULL DEFAULT 12,
  attribution_window_days integer NOT NULL DEFAULT 60,
  payout_hold_days integer NOT NULL DEFAULT 30,
  minimum_payout_cents integer NOT NULL DEFAULT 5000,
  attribution_model text NOT NULL DEFAULT 'last-click',
  support_email text NOT NULL DEFAULT 'support@castdirectorstudio.com',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT affiliate_program_settings_singleton CHECK (id = 'default'),
  CONSTRAINT affiliate_program_settings_commission_rate_check CHECK (commission_rate > 0 AND commission_rate <= 1),
  CONSTRAINT affiliate_program_settings_duration_positive CHECK (commission_duration_months > 0),
  CONSTRAINT affiliate_program_settings_attribution_window_positive CHECK (attribution_window_days > 0),
  CONSTRAINT affiliate_program_settings_payout_hold_nonnegative CHECK (payout_hold_days >= 0),
  CONSTRAINT affiliate_program_settings_minimum_payout_nonnegative CHECK (minimum_payout_cents >= 0)
);

INSERT INTO public.affiliate_program_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Current admin pages and claim helpers expect these operational columns.
-- Guarded ALTERs keep fresh-dev replay safe without creating placeholder tables.
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE IF EXISTS public.licenses
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS license_key text,
  ADD COLUMN IF NOT EXISTS activation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_activations integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_perpetual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updates_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS support_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE IF EXISTS public.stripe_webhooks
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.affiliate_program_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.affiliate_program_settings') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'affiliate_program_settings'
         AND policyname = 'Admins can manage affiliate program settings'
     ) THEN
    CREATE POLICY "Admins can manage affiliate program settings"
      ON public.affiliate_program_settings
      FOR ALL TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF to_regclass('public.affiliate_program_settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_affiliate_program_settings_set_updated_at
      ON public.affiliate_program_settings;
    CREATE TRIGGER trg_affiliate_program_settings_set_updated_at
      BEFORE UPDATE ON public.affiliate_program_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_operations_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_last_30 timestamptz := now() - interval '30 days';
  v_result jsonb := '{}'::jsonb;
  v_total_revenue numeric := NULL;
  v_recent_revenue numeric := NULL;
  v_hold_cents bigint := 0;
  v_payable_cents bigint := 0;
  v_paid_cents bigint := 0;
BEGIN
  IF NOT ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) THEN
    RAISE EXCEPTION 'Access denied: admin only.';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    SELECT COALESCE(sum(total_amount), 0) INTO v_total_revenue FROM public.orders;
    SELECT COALESCE(sum(total_amount), 0) INTO v_recent_revenue FROM public.orders WHERE created_at >= v_last_30;

    v_result := v_result || jsonb_build_object(
      'totalRevenue', v_total_revenue,
      'recentRevenue', v_recent_revenue,
      'totalOrders', (SELECT count(*) FROM public.orders),
      'recentOrders', (SELECT count(*) FROM public.orders WHERE created_at >= v_last_30),
      'paymentWarnings', (
        SELECT count(*)
        FROM public.orders
        WHERE COALESCE(payment_status, '') <> 'paid'
           OR COALESCE(fulfillment_status, '') <> 'fulfilled'
      )
    );
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'activeSubscriptions', (SELECT count(*) FROM public.subscriptions WHERE status = 'active')
    );
  END IF;

  IF to_regclass('public.licenses') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'totalLicenses', (SELECT count(*) FROM public.licenses)
    );
  END IF;

  IF to_regclass('public.downloads') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'totalDownloads', (SELECT count(*) FROM public.downloads)
    );
  END IF;

  IF to_regclass('public.crm_contacts') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'customers', (SELECT count(*) FROM public.crm_contacts)
    );
  ELSIF to_regclass('public.contacts') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'customers', (SELECT count(*) FROM public.contacts)
    );
  END IF;

  IF to_regclass('public.crm_conversations') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'openContactLeads', (
        SELECT count(*)
        FROM public.crm_conversations
        WHERE status NOT IN ('resolved', 'closed')
      )
    );
  END IF;

  IF to_regclass('public.email_sends') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'recentEmails', (SELECT count(*) FROM public.email_sends WHERE created_at >= v_last_30)
    );
  END IF;

  IF to_regclass('public.affiliates') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'totalAffiliates', (SELECT count(*) FROM public.affiliates),
      'activeAffiliates', (SELECT count(*) FROM public.affiliates WHERE status = 'active'),
      'pendingAffiliates', (SELECT count(*) FROM public.affiliates WHERE status = 'pending'),
      'suspendedAffiliates', (SELECT count(*) FROM public.affiliates WHERE status = 'suspended')
    );
  END IF;

  IF to_regclass('public.affiliate_applications') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'pendingApplications', (SELECT count(*) FROM public.affiliate_applications WHERE status = 'pending')
    );
  END IF;

  IF to_regclass('public.affiliate_clicks') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'totalClicks', (SELECT count(*) FROM public.affiliate_clicks)
    );
  END IF;

  IF to_regclass('public.referrals') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'totalReferrals', (SELECT count(*) FROM public.referrals)
    );
  END IF;

  IF to_regclass('public.commission_ledger') IS NOT NULL THEN
    SELECT
      COALESCE(sum(CASE WHEN hold_until > v_now THEN CASE WHEN type = 'earned' THEN amount_cents ELSE -amount_cents END ELSE 0 END), 0),
      COALESCE(sum(CASE WHEN hold_until <= v_now OR hold_until IS NULL THEN CASE WHEN type = 'earned' THEN amount_cents ELSE -amount_cents END ELSE 0 END), 0)
    INTO v_hold_cents, v_payable_cents
    FROM public.commission_ledger
    WHERE payout_batch_id IS NULL;

    v_result := v_result || jsonb_build_object(
      'commissionsInHoldCents', greatest(v_hold_cents, 0),
      'payableCommissionsCents', greatest(v_payable_cents, 0)
    );
  END IF;

  IF to_regclass('public.payout_items') IS NOT NULL THEN
    SELECT COALESCE(sum(amount_cents), 0) INTO v_paid_cents
    FROM public.payout_items
    WHERE status = 'paid';

    v_result := v_result || jsonb_build_object(
      'paidCommissionsCents', v_paid_cents,
      'failedPayoutItems', (SELECT count(*) FROM public.payout_items WHERE status = 'failed')
    );
  END IF;

  IF to_regclass('public.payout_batches') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'pendingPayoutBatches', (SELECT count(*) FROM public.payout_batches WHERE status = 'approved'),
      'recentBatches', COALESCE((
        SELECT jsonb_agg(to_jsonb(b))
        FROM (
          SELECT id, status, total_amount_cents, created_at
          FROM public.payout_batches
          ORDER BY created_at DESC
          LIMIT 3
        ) b
      ), '[]'::jsonb)
    );
  END IF;

  IF to_regclass('public.stripe_webhooks') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'latestWebhookAt', (SELECT created_at FROM public.stripe_webhooks ORDER BY created_at DESC LIMIT 1),
      'failedWebhooks', (SELECT count(*) FROM public.stripe_webhooks WHERE processing_status = 'failed'),
      'recentWebhookEvents', COALESCE((
        SELECT jsonb_agg(to_jsonb(w))
        FROM (
          SELECT id, event_type, processing_status, created_at
          FROM public.stripe_webhooks
          ORDER BY created_at DESC
          LIMIT 3
        ) w
      ), '[]'::jsonb)
    );
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'recentOrdersList', COALESCE((
        SELECT jsonb_agg(to_jsonb(o))
        FROM (
          SELECT id, order_number, total_amount, payment_status, created_at
          FROM public.orders
          ORDER BY created_at DESC
          LIMIT 3
        ) o
      ), '[]'::jsonb)
    );
  END IF;

  IF to_regclass('public.affiliate_applications') IS NOT NULL THEN
    v_result := v_result || jsonb_build_object(
      'recentApplications', COALESCE((
        SELECT jsonb_agg(to_jsonb(a))
        FROM (
          SELECT id, email, status, created_at
          FROM public.affiliate_applications
          ORDER BY created_at DESC
          LIMIT 3
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_operations_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_operations_summary() TO authenticated;
