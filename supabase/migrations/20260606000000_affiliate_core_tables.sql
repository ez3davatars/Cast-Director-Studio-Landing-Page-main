-- ============================================================
-- Affiliate Core Tables
-- Creates: affiliates, affiliate_links, affiliate_assets,
--          affiliate_notes
-- All writes from clients are blocked by RLS (see migration
-- 20260606000003). Admin and Edge Functions use service role.
-- ============================================================

-- 1. affiliates
--    One row per affiliate user. Admin-created only in MVP.
CREATE TABLE IF NOT EXISTS public.affiliates (
    id                         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code                       text        NOT NULL,           -- URL slug, e.g. "studio-jane"
    status                     text        NOT NULL DEFAULT 'pending',
    commission_rate            numeric     NOT NULL DEFAULT 0.30,    -- 0.30 = 30%
    commission_duration_months integer     NOT NULL DEFAULT 12,
    payout_hold_days           integer     NOT NULL DEFAULT 30,
    minimum_payout_cents       integer     NOT NULL DEFAULT 5000,    -- $50.00
    attribution_window_days    integer     NOT NULL DEFAULT 60,
    paypal_email               text,                           -- used for manual payout records
    created_by                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT affiliates_status_check
        CHECK (status IN ('pending', 'active', 'suspended')),
    CONSTRAINT affiliates_commission_rate_check
        CHECK (commission_rate > 0 AND commission_rate <= 1),
    CONSTRAINT affiliates_duration_positive
        CHECK (commission_duration_months > 0),
    CONSTRAINT affiliates_hold_nonnegative
        CHECK (payout_hold_days >= 0),
    CONSTRAINT affiliates_minimum_payout_nonnegative
        CHECK (minimum_payout_cents >= 0),
    CONSTRAINT affiliates_attribution_window_positive
        CHECK (attribution_window_days > 0)
);

-- One affiliate account per user
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_user_id_uidx ON public.affiliates (user_id);
-- Code must be globally unique (used in click-tracking URLs)
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_code_uidx   ON public.affiliates (lower(code));
CREATE INDEX        IF NOT EXISTS affiliates_status_idx  ON public.affiliates (status);

DROP TRIGGER IF EXISTS trg_affiliates_set_updated_at ON public.affiliates;
CREATE TRIGGER trg_affiliates_set_updated_at
    BEFORE UPDATE ON public.affiliates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 2. affiliate_links
--    Each affiliate can have multiple links with different campaign codes.
--    The default link shares the affiliate's code; campaign links have unique codes.
CREATE TABLE IF NOT EXISTS public.affiliate_links (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    affiliate_id uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    code         text        NOT NULL,         -- link-level URL slug (globally unique)
    destination_url text     NOT NULL DEFAULT '/',
    campaign     text,                         -- optional label, e.g. "twitter-bio"
    is_active    boolean     NOT NULL DEFAULT true,
    click_count  integer     NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT affiliate_links_click_count_nonnegative
        CHECK (click_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_links_code_uidx        ON public.affiliate_links (lower(code));
CREATE INDEX        IF NOT EXISTS affiliate_links_affiliate_id_idx  ON public.affiliate_links (affiliate_id);
CREATE INDEX        IF NOT EXISTS affiliate_links_is_active_idx     ON public.affiliate_links (is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_affiliate_links_set_updated_at ON public.affiliate_links;
CREATE TRIGGER trg_affiliate_links_set_updated_at
    BEFORE UPDATE ON public.affiliate_links
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 3. affiliate_assets
--    Downloadable creative materials (banners, copy, templates).
--    Shared across all affiliates; admin-managed.
CREATE TABLE IF NOT EXISTS public.affiliate_assets (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    title        text        NOT NULL,
    type         text        NOT NULL,         -- banner | copy | email_template | logo | other
    description  text,
    storage_path text,                         -- Supabase Storage object key
    public_url   text,                         -- CDN URL shown to affiliates
    width        integer,                      -- pixels (images only)
    height       integer,                      -- pixels (images only)
    is_active    boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT affiliate_assets_type_check
        CHECK (type IN ('banner', 'copy', 'email_template', 'logo', 'other'))
);

CREATE INDEX IF NOT EXISTS affiliate_assets_type_idx      ON public.affiliate_assets (type);
CREATE INDEX IF NOT EXISTS affiliate_assets_is_active_idx ON public.affiliate_assets (is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_affiliate_assets_set_updated_at ON public.affiliate_assets;
CREATE TRIGGER trg_affiliate_assets_set_updated_at
    BEFORE UPDATE ON public.affiliate_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 4. affiliate_notes
--    Internal admin CRM notes about an affiliate. Not visible to affiliates.
CREATE TABLE IF NOT EXISTS public.affiliate_notes (
    id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    affiliate_id uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    author_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    author_email text,                         -- denormalized at write time
    body         text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
    -- Intentionally no updated_at — notes are append-only
);

CREATE INDEX IF NOT EXISTS affiliate_notes_affiliate_id_idx ON public.affiliate_notes (affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_notes_created_at_idx   ON public.affiliate_notes (created_at DESC);
