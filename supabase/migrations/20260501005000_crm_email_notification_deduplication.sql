-- Add column to track the last time an admin sent an email notification for a CRM thread
ALTER TABLE public.crm_conversations 
  ADD COLUMN IF NOT EXISTS last_admin_email_notification_at timestamptz;

-- Add index for performance when sorting/filtering by notification state
CREATE INDEX IF NOT EXISTS crm_conversations_last_email_notif_idx 
  ON public.crm_conversations (last_admin_email_notification_at DESC NULLS LAST);
