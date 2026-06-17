DROP POLICY IF EXISTS "Staff view brands" ON public.brands;
CREATE POLICY "Authenticated users view brands"
  ON public.brands FOR SELECT
  TO authenticated
  USING (true);