-- ============================================================
-- CRM Ticket Presence Tracking
-- Enables backend email suppression when a recipient is
-- actively viewing a conversation.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_ticket_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'customer')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS crm_ticket_presence_conversation_role_seen_idx
  ON public.crm_ticket_presence (conversation_id, role, last_seen_at DESC);

-- RLS
ALTER TABLE public.crm_ticket_presence ENABLE ROW LEVEL SECURITY;

-- Admins: full access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_ticket_presence' AND policyname = 'Admins full access crm_ticket_presence') THEN
    CREATE POLICY "Admins full access crm_ticket_presence"
      ON public.crm_ticket_presence FOR ALL TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END $$;

-- Customers: own rows only
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_ticket_presence' AND policyname = 'Customers own presence crm_ticket_presence') THEN
    CREATE POLICY "Customers own presence crm_ticket_presence"
      ON public.crm_ticket_presence FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
