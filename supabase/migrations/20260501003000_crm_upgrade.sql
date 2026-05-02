-- ============================================================
-- CRM Support-Flow Upgrade
-- Adds priority, category, timestamps, internal notes table.
-- Migrates status 'open' → 'in_progress'.
-- Backfills existing data with sane defaults.
-- ============================================================

-- 1. Add new columns to crm_conversations (safe additive)
ALTER TABLE public.crm_conversations
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general_support',
  ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_admin_reply_at timestamptz;

-- 2. Migrate status 'open' → 'in_progress'
UPDATE public.crm_conversations SET status = 'in_progress' WHERE status = 'open';

-- 3. Status constraint
ALTER TABLE public.crm_conversations DROP CONSTRAINT IF EXISTS crm_conversations_status_check;
ALTER TABLE public.crm_conversations ADD CONSTRAINT crm_conversations_status_check
  CHECK (status IN ('new', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'));

-- 4. Priority constraint
ALTER TABLE public.crm_conversations DROP CONSTRAINT IF EXISTS crm_conversations_priority_check;
ALTER TABLE public.crm_conversations ADD CONSTRAINT crm_conversations_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- 5. Category constraint
ALTER TABLE public.crm_conversations DROP CONSTRAINT IF EXISTS crm_conversations_category_check;
ALTER TABLE public.crm_conversations ADD CONSTRAINT crm_conversations_category_check
  CHECK (category IN (
    'billing', 'license_activation', 'hosted_credits', 'byok_setup',
    'generation_failed', 'app_bug', 'download_install', 'feature_question',
    'account_access', 'refund_cancellation', 'general_support'
  ));

-- 6. Indexes
CREATE INDEX IF NOT EXISTS crm_conversations_priority_idx ON public.crm_conversations (priority);
CREATE INDEX IF NOT EXISTS crm_conversations_category_idx ON public.crm_conversations (category);
CREATE INDEX IF NOT EXISTS crm_conversations_last_customer_msg_idx ON public.crm_conversations (last_customer_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS crm_conversations_last_admin_reply_idx ON public.crm_conversations (last_admin_reply_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS crm_conversations_linked_user_idx ON public.crm_conversations (linked_user_id);

-- 7. Backfill last_customer_message_at from existing messages
UPDATE public.crm_conversations c
SET last_customer_message_at = sub.latest
FROM (
  SELECT conversation_id, MAX(created_at) AS latest
  FROM public.crm_messages
  WHERE direction = 'inbound'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id AND c.last_customer_message_at IS NULL;

-- 8. Backfill last_admin_reply_at from existing messages
UPDATE public.crm_conversations c
SET last_admin_reply_at = sub.latest
FROM (
  SELECT conversation_id, MAX(created_at) AS latest
  FROM public.crm_messages
  WHERE direction = 'outbound'
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id AND c.last_admin_reply_at IS NULL;

-- 9. Internal Notes table
CREATE TABLE IF NOT EXISTS public.crm_internal_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_internal_notes_convo_idx ON public.crm_internal_notes (conversation_id);
CREATE INDEX IF NOT EXISTS crm_internal_notes_created_idx ON public.crm_internal_notes (created_at DESC);

-- 10. RLS for crm_internal_notes
ALTER TABLE public.crm_internal_notes ENABLE ROW LEVEL SECURITY;

-- Admin-only access: no customer policy exists = customers cannot see notes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_internal_notes' AND policyname = 'Admins have full access to crm_internal_notes') THEN
    CREATE POLICY "Admins have full access to crm_internal_notes"
      ON public.crm_internal_notes FOR ALL TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END $$;
