-- Affiliate asset library storage and metadata backfill.
-- Creates a public Supabase Storage bucket for affiliate promo files while
-- keeping uploads/deletes admin-only.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'affiliate-assets',
  'affiliate-assets',
  true,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'video/mp4',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.affiliate_assets
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS copy_body text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'affiliate-assets',
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.affiliate_assets
SET storage_bucket = 'affiliate-assets'
WHERE storage_bucket IS NULL;

DO $$
BEGIN
  IF to_regclass('public.affiliate_assets') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'affiliate_assets_type_check'
         AND conrelid = 'public.affiliate_assets'::regclass
     ) THEN
    ALTER TABLE public.affiliate_assets
      DROP CONSTRAINT affiliate_assets_type_check;
  END IF;

  IF to_regclass('public.affiliate_assets') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'affiliate_assets_type_check'
         AND conrelid = 'public.affiliate_assets'::regclass
     ) THEN
    ALTER TABLE public.affiliate_assets
      ADD CONSTRAINT affiliate_assets_type_check
      CHECK (type IN ('banner', 'copy', 'email_template', 'social_post', 'logo', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS affiliate_assets_archived_at_idx
  ON public.affiliate_assets (archived_at);

CREATE INDEX IF NOT EXISTS affiliate_assets_storage_bucket_path_idx
  ON public.affiliate_assets (storage_bucket, storage_path);

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = 'Admins can read affiliate asset files'
     ) THEN
    CREATE POLICY "Admins can read affiliate asset files"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'affiliate-assets'
        AND (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
      );
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = 'Admins can upload affiliate asset files'
     ) THEN
    CREATE POLICY "Admins can upload affiliate asset files"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'affiliate-assets'
        AND (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
      );
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = 'Admins can update affiliate asset files'
     ) THEN
    CREATE POLICY "Admins can update affiliate asset files"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'affiliate-assets'
        AND (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
      )
      WITH CHECK (
        bucket_id = 'affiliate-assets'
        AND (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
      );
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'storage'
         AND tablename = 'objects'
         AND policyname = 'Admins can delete affiliate asset files'
     ) THEN
    CREATE POLICY "Admins can delete affiliate asset files"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'affiliate-assets'
        AND (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
      );
  END IF;
END $$;
