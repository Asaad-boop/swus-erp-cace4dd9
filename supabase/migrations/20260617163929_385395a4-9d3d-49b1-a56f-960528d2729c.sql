CREATE POLICY "admins view all addresses"
ON public.addresses
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));