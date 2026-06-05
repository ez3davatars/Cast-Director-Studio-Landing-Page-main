-- ============================================================
-- Affiliate Tracking Tables
-- Creates: affiliate_clicks (server-side session token),
--          referrals
--
-- Attribution strategy:
--   1. Visitor hits ?ref=<link_code>
--   2. record-affiliate-click Edge Function creates a row here,
--      generating a cryptographically random session_token.
--   3. Only the token (not the affiliate code) is stored in a
--      first-party cookie. Keeps attribution reliable across
--      the full attribution_window_days period.
--   4. On checkout, create-checkout-session reads the cookie,
--      looks up the token, and embeds affiliate metadata in
--      the Stripe session.
--   5. stripe-webhook converts the click into a referral and
--      writes the first commission_ledger row.
-- ============================================================

-- 1. affiliate_clicks
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
    id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    link_id            uuid        NOT NULL REFERENCES public.affiliate_links(id) ON DELETE CASCADE,
    affiliate_id       uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,

    -- Opaque token stored in the visitor's browser cookie.
    -- The Edge Function generates this with crypto.randomUUID().
    session_token      text        NOT NULL,

    -- Optional visitor context (store minimally; IP may be hashed/truncated
    -- for privacy before insertion).
    visitor_ip         text,
    referrer           text,
    user_agent         text,

    -- Set by stripe-webhook when the visitor converts (checkout.session.completed)
    attributed_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    converted          boolean     NOT NULL DEFAULT false,
    converted_at       timestamptz,

    -- Computed from attribution_window_days at insertion time.
    -- Edge Function sets: now() + (affiliate.attribution_window_days || ' days')::interval
    expires_at         timestamptz NOT NULL,

    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_clicks_session_token_uidx ON public.affiliate_clicks (session_token);
CREATE INDEX        IF NOT EXISTS affiliate_clicks_affiliate_id_idx   ON public.affiliate_clicks (affiliate_id);
CREATE INDEX        IF NOT EXISTS affiliate_clicks_link_id_idx        ON public.affiliate_clicks (link_id);
-- Used by the cleanup job (future) and attribution window check
CREATE INDEX        IF NOT EXISTS affiliate_clicks_expires_at_idx     ON public.affiliate_clicks (expires_at);
-- Fast lookup of converted clicks for reporting
CREATE INDEX        IF NOT EXISTS affiliate_clicks_converted_idx      ON public.affiliate_clicks (converted) WHERE converted = true;


-- 2. referrals
--    One row per affiliate ↔ referred-user relationship.
--    Created on first successful checkout within the attribution window.
--
--    commission_expires_at enforces the 12-month duration:
--    after that date no further commission_ledger rows should be
--    written for this referral, even if the customer keeps paying.
--
--    Last-click attribution:
--    The Edge Function voids any existing active referral for
--    referred_user_id before inserting a new one (if attribution
--    window of the prior click has not yet expired but a later
--    click wins). The partial unique index below enforces that
--    at most one active referral exists per referred user.
CREATE TABLE IF NOT EXISTS public.referrals (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    affiliate_id          uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    click_id              uuid        REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL,
    referred_user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

    -- Stripe identifiers captured at conversion time for audit
    stripe_customer_id    text,
    stripe_session_id     text,
    order_id              uuid        REFERENCES public.orders(id) ON DELETE SET NULL,

    attributed_at         timestamptz NOT NULL DEFAULT now(),

    -- = attributed_at + (affiliate.commission_duration_months months)
    -- Computed and stored by the Edge Function so it is immutable after creation.
    commission_expires_at timestamptz NOT NULL,

    status                text        NOT NULL DEFAULT 'active',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT referrals_status_check
        CHECK (status IN ('active', 'expired', 'voided')),

    -- Self-referral prevention is enforced in the Edge Function, not here,
    -- because a table constraint cannot cheaply cross-reference affiliates.user_id.

    CONSTRAINT referrals_commission_expires_after_attribution
        CHECK (commission_expires_at > attributed_at)
);

-- At most one *active* referral per referred user (last-click).
-- Edge Function voids the previous active referral before inserting.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_active_per_user_uidx
    ON public.referrals (referred_user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS referrals_affiliate_id_idx    ON public.referrals (affiliate_id);
CREATE INDEX IF NOT EXISTS referrals_order_id_idx        ON public.referrals (order_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx          ON public.referrals (status);
CREATE INDEX IF NOT EXISTS referrals_expires_at_idx      ON public.referrals (commission_expires_at);

DROP TRIGGER IF EXISTS trg_referrals_set_updated_at ON public.referrals;
CREATE TRIGGER trg_referrals_set_updated_at
    BEFORE UPDATE ON public.referrals
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
