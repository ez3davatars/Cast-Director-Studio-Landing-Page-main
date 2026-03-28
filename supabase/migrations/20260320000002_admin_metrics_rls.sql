-- Enables Admin access for the frontend React application where app_metadata.is_admin is explicitly true.
-- Ensures that ops dashboard can securely read production records without Service Role exposure in the browser.

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Admins can view all orders') THEN
    CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'Admins can view all order_items') THEN
    CREATE POLICY "Admins can view all order_items" ON public.order_items FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Admins can view all subscriptions') THEN
    CREATE POLICY "Admins can view all subscriptions" ON public.subscriptions FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'licenses' AND policyname = 'Admins can view all licenses') THEN
    CREATE POLICY "Admins can view all licenses" ON public.licenses FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stripe_webhooks' AND policyname = 'Admins can view all stripe_webhooks') THEN
    CREATE POLICY "Admins can view all stripe_webhooks" ON public.stripe_webhooks FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'downloads' AND policyname = 'Admins can view all downloads') THEN
    CREATE POLICY "Admins can view all downloads" ON public.downloads FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
  
  -- Add contacts just in case it is queried later for customer mapping
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contacts' AND policyname = 'Admins can view all contacts') THEN
    CREATE POLICY "Admins can view all contacts" ON public.contacts FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
  END IF;
END $$;
