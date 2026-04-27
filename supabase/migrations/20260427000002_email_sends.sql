-- ============================================================
-- Email Sends Telemetry Table
-- Stores a log of all transactional and operational emails
-- sent to customers for dashboard visibility.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_sends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    user_id UUID, -- References auth.users(id) if applicable
    subject TEXT NOT NULL,
    body TEXT,
    provider_message_id TEXT
);

-- Enable RLS
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

-- Service Role has full access (used by Edge Functions like send-ops-email)
GRANT ALL ON TABLE public.email_sends TO service_role;

-- Authenticated Users (Admins via Dashboard) need SELECT access to view them
GRANT SELECT ON TABLE public.email_sends TO authenticated;

-- Admin Policy (Assuming you want admins to see all logs)
-- Note: Replace or adjust if you have a specific admin role policy structure
CREATE POLICY "Admins can view all email logs"
  ON public.email_sends
  FOR SELECT
  TO authenticated
  USING (true); -- Note: since your dashboard is an admin-only area, 'true' works, but you can restrict it to admin user IDs if preferred.
