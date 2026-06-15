
-- erp_courier_settings: drop operations SELECT, keep admin-only ALL
DROP POLICY IF EXISTS "Operations can read courier settings" ON public.erp_courier_settings;

-- brands: replace open SELECT with staff-only
DROP POLICY IF EXISTS "Authenticated view brands" ON public.brands;
CREATE POLICY "Staff view brands" ON public.brands
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  );

-- erp_expense_categories: staff only
DROP POLICY IF EXISTS "Authenticated view categories" ON public.erp_expense_categories;
CREATE POLICY "Staff view expense categories" ON public.erp_expense_categories
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  );

-- erp_settings: staff only
DROP POLICY IF EXISTS "Authenticated view erp settings" ON public.erp_settings;
CREATE POLICY "Staff view erp settings" ON public.erp_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  );

-- abandoned_carts: explicit no INSERT policy from clients (writes happen via SECURITY DEFINER RPC upsert_abandoned_cart only)
-- No change needed — default deny applies since no INSERT policy exists.
-- This comment documents the intentional design.
