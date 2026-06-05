-- ============================================================
-- Add contact_email to affiliates
-- Denormalized display field populated at creation time by the
-- admin UI. Avoids needing a service-role call to auth.users
-- just to show an email in the affiliate list/detail pages.
-- ============================================================

ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS contact_email text;

CREATE INDEX IF NOT EXISTS affiliates_contact_email_idx
    ON public.affiliates (lower(contact_email));
