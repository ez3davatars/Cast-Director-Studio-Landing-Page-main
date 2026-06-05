-- ============================================================
-- Affiliate Helper Functions
-- Atomic click counter increment called by the
-- record-affiliate-click Edge Function via supabaseAdmin.rpc().
-- Uses SECURITY DEFINER so it runs as the function owner
-- and bypasses RLS on affiliate_links.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_affiliate_link_clicks(p_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.affiliate_links
  SET click_count = click_count + 1,
      updated_at  = now()
  WHERE id = p_link_id;
$$;

-- Restrict direct invocation to service role and authenticated users
-- (Edge Functions call this via service role; no client needs it)
REVOKE ALL ON FUNCTION public.increment_affiliate_link_clicks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_affiliate_link_clicks(uuid) TO service_role;
