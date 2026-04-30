-- Migration: Switch products table from TEST Stripe Price IDs to LIVE Stripe Price IDs
-- Date: 2026-04-30
-- WARNING: This does NOT delete old product rows, orders, subscriptions, or licenses.

UPDATE public.products SET stripe_price_id = 'price_1TRiI1DETDyl6ph1Hv32GRBU' WHERE product_key = 'starter';
UPDATE public.products SET stripe_price_id = 'price_1TRifODETDyl6ph1jkZefNuv' WHERE product_key = 'pro';
UPDATE public.products SET stripe_price_id = 'price_1TC6vuDETDyl6ph1S1HnhYPM' WHERE product_key = 'indie_desktop_byok';
UPDATE public.products SET stripe_price_id = 'price_1TRiIDDETDyl6ph1oltjWtaM' WHERE product_key = 'agency_desktop_byok';
UPDATE public.products SET stripe_price_id = 'price_1TRiIDDETDyl6ph1fH7tNwvd' WHERE product_key = 'indie_updates_support';
UPDATE public.products SET stripe_price_id = 'price_1TRiIEDETDyl6ph1K2Rsnrpf' WHERE product_key = 'agency_updates_support';
UPDATE public.products SET stripe_price_id = 'price_1TRiIEDETDyl6ph1OIY2Kw3v' WHERE product_key = 'credit_pack_100';
UPDATE public.products SET stripe_price_id = 'price_1TRiIFDETDyl6ph1mOZYr8zc' WHERE product_key = 'credit_pack_500';
