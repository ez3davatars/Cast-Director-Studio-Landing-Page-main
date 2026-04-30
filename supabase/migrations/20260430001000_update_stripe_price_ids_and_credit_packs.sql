-- Update existing products with new Stripe Price IDs
-- Aligned to actual products table schema:
--   product_key, display_name, stripe_price_id, product_type, is_active
-- Safe to run multiple times: UPDATE WHERE is idempotent
-- Does not delete old products or modify subscriptions/purchase history

-- Drop overly restrictive product_type check constraint
-- Application-layer validation in stripe-webhook handles routing safely
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;


UPDATE products
SET stripe_price_id = 'price_1TRiI1DETDyl6ph1Hv32GRBU',
    product_type = 'subscription',
    is_active = true
WHERE product_key = 'starter';

UPDATE products
SET stripe_price_id = 'price_1TRifODETDyl6ph1jkZefNuv',
    product_type = 'subscription',
    is_active = true
WHERE product_key = 'pro';

UPDATE products
SET stripe_price_id = 'price_1TC6vuDETDyl6ph1S1HnhYPM',
    product_type = 'desktop_license',
    is_active = true
WHERE product_key = 'indie_desktop_byok';

UPDATE products
SET stripe_price_id = 'price_1TRiIDDETDyl6ph1oltjWtaM',
    product_type = 'desktop_license',
    is_active = true
WHERE product_key = 'agency_desktop_byok';

UPDATE products
SET stripe_price_id = 'price_1TRiIDDETDyl6ph1fH7tNwvd',
    product_type = 'support_plan',
    is_active = true
WHERE product_key = 'indie_updates_support';

UPDATE products
SET stripe_price_id = 'price_1TRiIEDETDyl6ph1K2Rsnrpf',
    product_type = 'support_plan',
    is_active = true
WHERE product_key = 'agency_updates_support';

-- Insert credit pack products (upsert — safe to run multiple times)
INSERT INTO products (
  product_key,
  name,
  sku,
  display_name,
  stripe_price_id,
  product_type,
  is_active,
  price_usd
)
VALUES
(
  'credit_pack_100',
  'Cast Director Studio 100 Credit Pack',
  'CDS-CREDIT-100',
  'Cast Director Studio 100 Credit Pack',
  'price_1TRiIEDETDyl6ph1OIY2Kw3v',
  'credit_topup',
  true,
  10
),
(
  'credit_pack_500',
  'Cast Director Studio 500 Credit Pack',
  'CDS-CREDIT-500',
  'Cast Director Studio 500 Credit Pack',
  'price_1TRiIFDETDyl6ph1mOZYr8zc',
  'credit_topup',
  true,
  45
)
ON CONFLICT (product_key)
DO UPDATE SET
  name = EXCLUDED.name,
  sku = EXCLUDED.sku,
  display_name = EXCLUDED.display_name,
  stripe_price_id = EXCLUDED.stripe_price_id,
  product_type = EXCLUDED.product_type,
  is_active = EXCLUDED.is_active,
  price_usd = EXCLUDED.price_usd;
