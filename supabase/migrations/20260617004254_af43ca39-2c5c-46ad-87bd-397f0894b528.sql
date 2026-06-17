
DROP POLICY IF EXISTS "audit_insert" ON public.erp_finance_audit;
CREATE POLICY "audit_insert" ON public.erp_finance_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_staff(auth.uid()));
