CREATE POLICY "staff insert orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'customer_service'::app_role)
  OR public.has_role(auth.uid(), 'operations'::app_role)
);