-- Fix stripe_webhooks table schema properly
-- The table actually has an 'event_id' column that is NOT NULL.
-- We revert 'id' back to uuid with its default, and ensure 'event_id' exists and is unique.

ALTER TABLE public.stripe_webhooks
  ALTER COLUMN id TYPE uuid USING (gen_random_uuid()),
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.stripe_webhooks
  ADD COLUMN IF NOT EXISTS event_id text UNIQUE;
