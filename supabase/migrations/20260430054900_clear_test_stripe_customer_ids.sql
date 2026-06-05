-- Clear stale test-mode Stripe customer IDs from contacts table
-- so the create-checkout-session function creates new LIVE customers
-- This only affects contacts with test-mode customer IDs (cus_test_ prefix or 
-- any ID created before the live switch)

DO $$
BEGIN
  IF to_regclass('public.contacts') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'contacts'
         AND column_name = 'stripe_customer_id'
     )
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'contacts'
         AND column_name = 'updated_at'
     ) THEN
    UPDATE public.contacts
    SET stripe_customer_id = NULL,
        updated_at = now()
    WHERE stripe_customer_id IS NOT NULL
      AND stripe_customer_id LIKE 'cus_%';
  END IF;
END $$;
