-- Clear stale test-mode Stripe customer IDs from contacts table
-- so the create-checkout-session function creates new LIVE customers
-- This only affects contacts with test-mode customer IDs (cus_test_ prefix or 
-- any ID created before the live switch)

UPDATE public.contacts 
SET stripe_customer_id = NULL, 
    updated_at = now() 
WHERE stripe_customer_id IS NOT NULL 
  AND stripe_customer_id LIKE 'cus_%';
