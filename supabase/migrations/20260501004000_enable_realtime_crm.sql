-- ============================================================
-- Enable Supabase Realtime for CRM tables
-- ============================================================

DO $$
BEGIN
  -- crm_conversations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'crm_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_conversations;
  END IF;

  -- crm_messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'crm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_messages;
  END IF;

  -- crm_internal_notes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'crm_internal_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_internal_notes;
  END IF;
END $$;
