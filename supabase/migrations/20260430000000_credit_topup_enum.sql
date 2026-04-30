-- Add TOPUP_PURCHASE and SUBSCRIPTION_RENEWAL to credit_transaction_kind enum
-- TOPUP_PURCHASE: used when a credit pack is purchased (100 or 500 packs)
-- SUBSCRIPTION_RENEWAL: used when monthly subscription credits are replenished

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'TOPUP_PURCHASE'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_transaction_kind')
  ) THEN
    ALTER TYPE public.credit_transaction_kind ADD VALUE 'TOPUP_PURCHASE';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SUBSCRIPTION_RENEWAL'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_transaction_kind')
  ) THEN
    ALTER TYPE public.credit_transaction_kind ADD VALUE 'SUBSCRIPTION_RENEWAL';
  END IF;
END$$;
