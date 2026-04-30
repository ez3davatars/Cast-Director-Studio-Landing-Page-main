-- Corrective migration: Set product_key and update stripe_price_id
-- The original products were created without product_key values
-- This matches on the known old Stripe Price IDs to set product_key
-- and update to the new Stripe Price IDs

-- Starter: old price_1TC4FLDETDyl6ph12zMfVdoP → new price_1TRiI1DETDyl6ph1Hv32GRBU
UPDATE products
SET product_key = 'starter',
    stripe_price_id = 'price_1TRiI1DETDyl6ph1Hv32GRBU',
    product_type = 'subscription',
    price_usd = 49
WHERE stripe_price_id = 'price_1TC4FLDETDyl6ph12zMfVdoP'
  AND product_key IS NULL;

-- Pro: old price_1TC4QgDETDyl6ph1ydjJICil → new price_1TRifODETDyl6ph1jkZefNuv
UPDATE products
SET product_key = 'pro',
    stripe_price_id = 'price_1TRifODETDyl6ph1jkZefNuv',
    product_type = 'subscription',
    price_usd = 99
WHERE stripe_price_id = 'price_1TC4QgDETDyl6ph1ydjJICil'
  AND product_key IS NULL;

-- Indie Desktop BYOK: old price_1TC59GDETDyl6ph1Vift3EjC → new price_1TC6vuDETDyl6ph1S1HnhYPM
UPDATE products
SET product_key = 'indie_desktop_byok',
    stripe_price_id = 'price_1TC6vuDETDyl6ph1S1HnhYPM',
    product_type = 'desktop_license',
    price_usd = 199
WHERE stripe_price_id = 'price_1TC59GDETDyl6ph1Vift3EjC'
  AND product_key IS NULL;

-- Agency Commercial BYOK: old price_1TC5ABDETDyl6ph1Um6in8g6 → new price_1TRiIDDETDyl6ph1oltjWtaM
UPDATE products
SET product_key = 'agency_desktop_byok',
    stripe_price_id = 'price_1TRiIDDETDyl6ph1oltjWtaM',
    product_type = 'desktop_license',
    price_usd = 499
WHERE stripe_price_id = 'price_1TC5ABDETDyl6ph1Um6in8g6'
  AND product_key IS NULL;

-- Indie Updates & Support: old price_1TCXVpDETDyl6ph1VcnFflZ5 → new price_1TRiIDDETDyl6ph1fH7tNwvd
UPDATE products
SET product_key = 'indie_updates_support',
    stripe_price_id = 'price_1TRiIDDETDyl6ph1fH7tNwvd',
    product_type = 'support_plan',
    price_usd = 99
WHERE stripe_price_id = 'price_1TCXVpDETDyl6ph1VcnFflZ5'
  AND product_key IS NULL;

-- Agency Updates & Priority Support: old price_1TC5E2DETDyl6ph1kOigQu2u → new price_1TRiIEDETDyl6ph1K2Rsnrpf
UPDATE products
SET product_key = 'agency_updates_support',
    stripe_price_id = 'price_1TRiIEDETDyl6ph1K2Rsnrpf',
    product_type = 'support_plan',
    price_usd = 249
WHERE stripe_price_id = 'price_1TC5E2DETDyl6ph1kOigQu2u'
  AND product_key IS NULL;
