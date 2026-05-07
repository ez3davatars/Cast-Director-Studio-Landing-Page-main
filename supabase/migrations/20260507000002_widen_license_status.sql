-- Migration: Widen the licenses.status CHECK constraint
-- The old constraint only allowed a subset of values (e.g. 'active', 'expired', 'revoked').
-- This migration drops it and recreates it with the full set of allowed statuses.

-- Drop whichever constraint name exists
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_status_check;

-- Recreate with the complete set of allowed values
ALTER TABLE public.licenses ADD CONSTRAINT licenses_status_check
  CHECK (status IN ('active', 'inactive', 'refunded', 'swapped', 'revoked', 'expired'));
