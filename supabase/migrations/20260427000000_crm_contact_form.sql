-- CRM Contact Form Tables
-- System of record for website contact form submissions.

-- 1. crm_contacts
CREATE TABLE IF NOT EXISTS public.crm_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    email text NOT NULL,
    name text,
    company text,
    phone text,
    source text NOT NULL DEFAULT 'website_contact_form',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_uidx ON public.crm_contacts (email);
CREATE INDEX IF NOT EXISTS crm_contacts_user_id_idx ON public.crm_contacts (user_id);

-- 2. crm_conversations
CREATE TABLE IF NOT EXISTS public.crm_conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ticket_id text UNIQUE NOT NULL,
    subject text,
    inquiry_type text,
    status text NOT NULL DEFAULT 'new',
    source text NOT NULL DEFAULT 'website_contact_form',
    assigned_to text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_conversations_contact_id_idx ON public.crm_conversations (contact_id);
CREATE INDEX IF NOT EXISTS crm_conversations_status_idx ON public.crm_conversations (status);
CREATE INDEX IF NOT EXISTS crm_conversations_created_at_idx ON public.crm_conversations (created_at DESC);

-- 3. crm_messages
CREATE TABLE IF NOT EXISTS public.crm_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
    direction text NOT NULL DEFAULT 'inbound',
    source text NOT NULL DEFAULT 'website_contact_form',
    sender_email text,
    sender_name text,
    body text,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_messages_conversation_id_idx ON public.crm_messages (conversation_id);

-- 4. RLS
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_contacts' AND policyname = 'Admins have full access to crm_contacts') THEN
    CREATE POLICY "Admins have full access to crm_contacts" ON public.crm_contacts FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_conversations' AND policyname = 'Admins have full access to crm_conversations') THEN
    CREATE POLICY "Admins have full access to crm_conversations" ON public.crm_conversations FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_messages' AND policyname = 'Admins have full access to crm_messages') THEN
    CREATE POLICY "Admins have full access to crm_messages" ON public.crm_messages FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END $$;

-- 5. Updated-at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_crm_contacts_set_updated_at ON public.crm_contacts;
CREATE TRIGGER trg_crm_contacts_set_updated_at BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_conversations_set_updated_at ON public.crm_conversations;
CREATE TRIGGER trg_crm_conversations_set_updated_at BEFORE UPDATE ON public.crm_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
