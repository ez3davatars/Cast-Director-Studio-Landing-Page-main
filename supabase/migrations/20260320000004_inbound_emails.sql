CREATE TABLE IF NOT EXISTS public.inbound_emails (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    from_email text NOT NULL,
    to_email text NOT NULL,
    subject text,
    text_content text,
    html_content text,
    provider_message_id text UNIQUE NOT NULL,
    received_at timestamptz DEFAULT now(),
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    thread_id text,
    reference_ids text[],
    attachment_metadata jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;

-- Admins can view/delete inbound emails
CREATE POLICY "Admins have full access to inbound_emails"
ON public.inbound_emails FOR ALL
TO authenticated
USING (auth.jwt() -> 'app_metadata' ->> 'is_admin' = 'true')
WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'is_admin' = 'true');

-- Edge Function uses Service Role Key which implicitly bypasses RLS for inserting.
