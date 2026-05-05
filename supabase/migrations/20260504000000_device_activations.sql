-- Device Activation & License Protection
-- Adds device_limit to licenses and creates the device_activations table

-- 1. Add device_limit column to licenses
ALTER TABLE public.licenses
ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 2;

-- 2. Create device_activations table
CREATE TABLE IF NOT EXISTS public.device_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_label text,
  platform text,
  app_version text,
  status text NOT NULL DEFAULT 'active',
  first_activated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  deactivation_source text, -- 'self_service', 'admin', 'system'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_id, device_fingerprint)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS device_activations_user_id_idx
  ON public.device_activations (user_id);

CREATE INDEX IF NOT EXISTS device_activations_license_id_status_idx
  ON public.device_activations (license_id, status);

CREATE INDEX IF NOT EXISTS device_activations_device_fingerprint_idx
  ON public.device_activations (device_fingerprint);

-- 4. RLS
ALTER TABLE public.device_activations ENABLE ROW LEVEL SECURITY;

-- Users can read their own device activations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'device_activations' AND policyname = 'Users can view own device activations'
  ) THEN
    CREATE POLICY "Users can view own device activations"
      ON public.device_activations
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END$$;

-- No direct insert/update/delete from clients — all through Edge Functions (service role)

-- 5. Backfill device_limit on existing licenses based on product_key
UPDATE public.licenses l
SET device_limit = CASE
  WHEN p.product_key = 'agency_commercial_byok' THEN 5
  ELSE 2
END
FROM public.products p
WHERE l.product_id = p.id
  AND l.device_limit = 2
  AND p.product_key = 'agency_commercial_byok';
