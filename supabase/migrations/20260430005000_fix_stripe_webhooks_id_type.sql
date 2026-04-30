-- Fix stripe_webhooks table schema
-- The original schema expected 'id' to be a UUID, but Stripe event IDs are strings (e.g. evt_...).
-- This caused a type mismatch when the webhook tried to insert the event ID for idempotency.

ALTER TABLE public.stripe_webhooks
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text;
