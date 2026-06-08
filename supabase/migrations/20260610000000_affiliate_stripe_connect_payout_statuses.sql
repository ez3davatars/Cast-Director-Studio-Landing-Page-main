-- Phase F: Stripe Connect payout processing statuses and webhook event storage.
-- Safe to run on fresh or existing projects.

DO $$
BEGIN
  IF to_regclass('public.payout_items') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'payout_items_status_check'
        AND conrelid = 'public.payout_items'::regclass
    ) THEN
      ALTER TABLE public.payout_items
        DROP CONSTRAINT payout_items_status_check;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'payout_items_status_check'
        AND conrelid = 'public.payout_items'::regclass
    ) THEN
      ALTER TABLE public.payout_items
        ADD CONSTRAINT payout_items_status_check
        CHECK (status IN ('pending', 'processing', 'transferred', 'paid', 'failed'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.payout_batches') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'payout_batches_status_check'
        AND conrelid = 'public.payout_batches'::regclass
    ) THEN
      ALTER TABLE public.payout_batches
        DROP CONSTRAINT payout_batches_status_check;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'payout_batches_status_check'
        AND conrelid = 'public.payout_batches'::regclass
    ) THEN
      ALTER TABLE public.payout_batches
        ADD CONSTRAINT payout_batches_status_check
        CHECK (status IN ('draft', 'approved', 'processing', 'transferred', 'paid', 'failed', 'cancelled'));
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.stripe_connect_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  connected_account_id text,
  object_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_connect_webhook_events_event_type_idx
  ON public.stripe_connect_webhook_events (event_type);

CREATE INDEX IF NOT EXISTS stripe_connect_webhook_events_connected_account_idx
  ON public.stripe_connect_webhook_events (connected_account_id);

ALTER TABLE public.stripe_connect_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stripe_connect_webhook_events'
      AND policyname = 'Admins can view stripe_connect_webhook_events'
  ) THEN
    CREATE POLICY "Admins can view stripe_connect_webhook_events"
      ON public.stripe_connect_webhook_events
      FOR SELECT
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END $$;
