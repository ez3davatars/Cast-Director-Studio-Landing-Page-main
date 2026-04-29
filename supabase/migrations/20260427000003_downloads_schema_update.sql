---------------------------------------------------------
-- Add Missing Columns to Downloads Table
---------------------------------------------------------

ALTER TABLE public.downloads
ADD COLUMN IF NOT EXISTS customer_email text,
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS installer_id text,
ADD COLUMN IF NOT EXISTS download_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_downloads integer;
