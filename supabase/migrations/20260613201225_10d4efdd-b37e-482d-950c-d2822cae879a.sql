-- Allow staff (admin, customer_service, operations) to insert and update order_items
-- so the ERP order detail page can add/edit line items on existing orders.

CREATE POLICY "staff insert order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);

CREATE POLICY "staff update order items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);

CREATE POLICY "staff delete order items"
ON public.order_items
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  OR public.has_role(auth.uid(), 'operations'::public.app_role)
);