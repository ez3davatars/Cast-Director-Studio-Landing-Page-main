-- ============================================================
-- Commission Ledger & Payout Tables
-- Creates: payout_batches, payout_items, commission_ledger
--
-- LEDGER RULES (from CLAUDE.md):
--   - commission_ledger is append-only (immutable rows).
--   - Refunds/chargebacks produce 'reversal' rows; they never
--     overwrite or delete 'earned' rows.
--   - Only payout_batch_id and payout_item_id may be updated
--     (set when a payout batch claims the commission row).
--   - All other mutations are blocked by a BEFORE trigger.
--
-- Creation order: payout_batches → payout_items → commission_ledger
-- (commission_ledger holds FKs to both payout tables).
-- ============================================================


-- 1. payout_batches
--    An admin-created batch of payouts. Manual approval flow only (no Stripe Connect).
CREATE TABLE IF NOT EXISTS public.payout_batches (
    id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    status             text        NOT NULL DEFAULT 'draft',
    total_amount_cents integer     NOT NULL DEFAULT 0,
    approved_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at        timestamptz,
    paid_at            timestamptz,
    notes              text,
    created_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT payout_batches_status_check
        CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
    CONSTRAINT payout_batches_total_nonnegative
        CHECK (total_amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS payout_batches_status_idx     ON public.payout_batches (status);
CREATE INDEX IF NOT EXISTS payout_batches_created_at_idx ON public.payout_batches (created_at DESC);

DROP TRIGGER IF EXISTS trg_payout_batches_set_updated_at ON public.payout_batches;
CREATE TRIGGER trg_payout_batches_set_updated_at
    BEFORE UPDATE ON public.payout_batches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 2. payout_items
--    One row per affiliate per payout batch.
--    paypal_email is denormalized from affiliates.paypal_email at
--    batch creation time so the record is self-contained.
CREATE TABLE IF NOT EXISTS public.payout_items (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    batch_id     uuid        NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
    affiliate_id uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    amount_cents integer     NOT NULL,
    status       text        NOT NULL DEFAULT 'pending',
    paypal_email text,                         -- denormalized at batch creation time
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT payout_items_status_check
        CHECK (status IN ('pending', 'paid', 'failed')),
    CONSTRAINT payout_items_amount_positive
        CHECK (amount_cents > 0),
    -- One payout item per affiliate per batch
    CONSTRAINT payout_items_one_per_affiliate_per_batch
        UNIQUE (batch_id, affiliate_id)
);

CREATE INDEX IF NOT EXISTS payout_items_batch_id_idx     ON public.payout_items (batch_id);
CREATE INDEX IF NOT EXISTS payout_items_affiliate_id_idx ON public.payout_items (affiliate_id);
CREATE INDEX IF NOT EXISTS payout_items_status_idx       ON public.payout_items (status);

DROP TRIGGER IF EXISTS trg_payout_items_set_updated_at ON public.payout_items;
CREATE TRIGGER trg_payout_items_set_updated_at
    BEFORE UPDATE ON public.payout_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 3. commission_ledger
--    Immutable double-entry ledger. Every payment that earns a
--    commission creates an 'earned' row. Every refund / chargeback
--    creates a 'reversal' row. Rows are never updated or deleted.
--
--    Idempotency: UNIQUE on stripe_event_id WHERE type = 'earned'
--    prevents double-commissioning the same Stripe event even if the
--    webhook fires twice (the stripe_webhooks table catches event-level
--    duplicates, but this is a second line of defence specific to
--    commission writes).
CREATE TABLE IF NOT EXISTS public.commission_ledger (
    id                       uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    affiliate_id             uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    referral_id              uuid        REFERENCES public.referrals(id) ON DELETE RESTRICT,
    order_id                 uuid        REFERENCES public.orders(id) ON DELETE RESTRICT,

    -- Stripe event that triggered this row (for audit + idempotency)
    stripe_event_id          text,
    stripe_invoice_id        text,              -- set for recurring subscription payments
    stripe_payment_intent_id text,

    type                     text        NOT NULL,   -- earned | reversal
    amount_cents             integer     NOT NULL,   -- always positive; type gives direction
    currency                 text        NOT NULL DEFAULT 'usd',

    -- Set when this row is claimed by a payout batch (the only allowed updates)
    payout_batch_id          uuid        REFERENCES public.payout_batches(id) ON DELETE SET NULL,
    payout_item_id           uuid        REFERENCES public.payout_items(id) ON DELETE SET NULL,

    -- Eligible for payout only after hold_until passes.
    -- = created_at + (affiliate.payout_hold_days || ' days')::interval
    -- Stored by the Edge Function so it cannot drift if settings change later.
    hold_until               timestamptz NOT NULL,

    created_at               timestamptz NOT NULL DEFAULT now(),

    -- No updated_at: the immutability trigger blocks all updates except
    -- payout_batch_id / payout_item_id (see trigger below).

    CONSTRAINT commission_ledger_type_check
        CHECK (type IN ('earned', 'reversal')),
    CONSTRAINT commission_ledger_amount_positive
        CHECK (amount_cents > 0),
    CONSTRAINT commission_ledger_hold_until_after_created
        CHECK (hold_until >= created_at)
);

-- Idempotency: at most one 'earned' row per Stripe event
CREATE UNIQUE INDEX IF NOT EXISTS commission_ledger_stripe_event_earned_uidx
    ON public.commission_ledger (stripe_event_id)
    WHERE type = 'earned' AND stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commission_ledger_affiliate_id_idx  ON public.commission_ledger (affiliate_id);
CREATE INDEX IF NOT EXISTS commission_ledger_referral_id_idx   ON public.commission_ledger (referral_id);
CREATE INDEX IF NOT EXISTS commission_ledger_type_idx          ON public.commission_ledger (type);
-- Used by payout batch builder to find eligible, unclaimed commissions
CREATE INDEX IF NOT EXISTS commission_ledger_payout_eligible_idx
    ON public.commission_ledger (affiliate_id, hold_until)
    WHERE payout_batch_id IS NULL;
CREATE INDEX IF NOT EXISTS commission_ledger_payout_batch_idx
    ON public.commission_ledger (payout_batch_id)
    WHERE payout_batch_id IS NOT NULL;


-- 4. Immutability trigger for commission_ledger
--
--    UPDATE: allowed ONLY if the financial/audit fields are unchanged
--            (i.e., only payout_batch_id / payout_item_id are being set).
--    DELETE: always blocked.

CREATE OR REPLACE FUNCTION public.commission_ledger_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Allow if only payout assignment columns changed
    IF (
        OLD.affiliate_id             IS NOT DISTINCT FROM NEW.affiliate_id             AND
        OLD.referral_id              IS NOT DISTINCT FROM NEW.referral_id              AND
        OLD.order_id                 IS NOT DISTINCT FROM NEW.order_id                 AND
        OLD.stripe_event_id          IS NOT DISTINCT FROM NEW.stripe_event_id          AND
        OLD.stripe_invoice_id        IS NOT DISTINCT FROM NEW.stripe_invoice_id        AND
        OLD.stripe_payment_intent_id IS NOT DISTINCT FROM NEW.stripe_payment_intent_id AND
        OLD.type                     IS NOT DISTINCT FROM NEW.type                     AND
        OLD.amount_cents             IS NOT DISTINCT FROM NEW.amount_cents             AND
        OLD.currency                 IS NOT DISTINCT FROM NEW.currency                 AND
        OLD.hold_until               IS NOT DISTINCT FROM NEW.hold_until               AND
        OLD.created_at               IS NOT DISTINCT FROM NEW.created_at
    ) THEN
        RETURN NEW;  -- Only payout_batch_id / payout_item_id changed — permit
    END IF;

    RAISE EXCEPTION
        'commission_ledger rows are immutable. '
        'Only payout_batch_id and payout_item_id may be updated after creation. '
        'To correct a financial entry, insert a reversal row.';
END;
$$;

CREATE OR REPLACE FUNCTION public.commission_ledger_block_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'commission_ledger rows cannot be deleted. '
        'They are permanent audit records. '
        'To cancel a commission, insert a reversal row.';
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_ledger_guard_update ON public.commission_ledger;
DROP TRIGGER IF EXISTS trg_commission_ledger_block_delete ON public.commission_ledger;

CREATE TRIGGER trg_commission_ledger_guard_update
    BEFORE UPDATE ON public.commission_ledger
    FOR EACH ROW EXECUTE FUNCTION public.commission_ledger_guard_update();

CREATE TRIGGER trg_commission_ledger_block_delete
    BEFORE DELETE ON public.commission_ledger
    FOR EACH ROW EXECUTE FUNCTION public.commission_ledger_block_delete();
