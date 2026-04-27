-- ============================================================
-- Support Tickets RLS Policies
-- Allows authenticated users to read their own CRM tickets
-- and messages via the linked_user_id foreign key.
-- ============================================================

-- Enable RLS on CRM tables (if not already enabled)
ALTER TABLE crm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT their own conversations
-- (matched via linked_user_id = auth.uid())
CREATE POLICY "Users can view own conversations"
  ON crm_conversations
  FOR SELECT
  TO authenticated
  USING (linked_user_id = auth.uid());

-- Allow authenticated users to SELECT messages belonging to
-- their own conversations
CREATE POLICY "Users can view own conversation messages"
  ON crm_messages
  FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM crm_conversations
      WHERE linked_user_id = auth.uid()
    )
  );

-- NOTE: Admin/service-role access is unaffected by these policies.
-- The service role key bypasses RLS entirely, so admin operations
-- (Leads panel, email functions, etc.) continue working as before.
