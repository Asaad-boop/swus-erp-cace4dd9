CREATE POLICY "moderators can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'moderator'::public.app_role));

CREATE POLICY "warehouse staff can view assigned orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'warehouse_staff'::public.app_role)
    OR public.has_role(auth.uid(), 'packer'::public.app_role)
  )
  AND (
    assigned_to = auth.uid()
    OR packaged_by = auth.uid()
  )
);

CREATE POLICY "staff can view low stock alerts"
ON public.low_stock_alerts
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));