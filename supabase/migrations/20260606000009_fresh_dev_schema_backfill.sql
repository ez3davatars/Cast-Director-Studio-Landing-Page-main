-- Fresh-dev schema compatibility backfill.
-- Adds current-schema columns that older data migrations assume exist.

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS price_usd numeric,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
