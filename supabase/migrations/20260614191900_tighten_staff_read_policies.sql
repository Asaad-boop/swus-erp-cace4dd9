-- Tighten SELECT policies: ERP/internal tables should only be readable by staff,
-- and courier credential SELECT must be admin-only (credentials are sensitive).

-- brands: replace "authenticated true" with staff-only read
DROP POLICY IF EXISTS "Authenticated view brands" ON public.brands;
CREATE POLICY "Staff view brands" ON public.brands
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
  );

-- erp_expense_categories: staff-only read
DROP POLICY IF EXISTS "Authenticated view categories" ON public.erp_expense_categories;
CREATE POLICY "Staff view expense categories" ON public.erp_expense_categories
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
  );

-- erp_settings: staff-only read
DROP POLICY IF EXISTS "Authenticated view erp settings" ON public.erp_settings;
CREATE POLICY "Staff view erp settings" ON public.erp_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
  );

-- erp_courier_settings: remove operations SELECT; only admin can read the
-- plaintext credentials directly. Server functions that need creds use the
-- service-role client (loadPathaoCreds / loadSteadfastCreds).
DROP POLICY IF EXISTS "Operations can read courier settings" ON public.erp_courier_settings;
CREATE POLICY "Admins read courier settings" ON public.erp_courier_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
