
ALTER TABLE public.abandoned_carts
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_brand_pending
  ON public.abandoned_carts (brand_id, updated_at DESC)
  WHERE is_converted = false;

CREATE OR REPLACE FUNCTION public.set_abandoned_cart_brand()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid; _bid uuid; _raw text;
BEGIN
  IF NEW.brand_id IS NULL AND NEW.cart_items IS NOT NULL AND jsonb_array_length(NEW.cart_items) > 0 THEN
    _raw := COALESCE(NEW.cart_items -> 0 ->> 'product_id', NEW.cart_items -> 0 ->> 'id');
    IF _raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      _pid := _raw::uuid;
      SELECT brand_id INTO _bid FROM public.products WHERE id = _pid;
      NEW.brand_id := _bid;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abandoned_cart_brand ON public.abandoned_carts;
CREATE TRIGGER trg_abandoned_cart_brand
  BEFORE INSERT OR UPDATE OF cart_items ON public.abandoned_carts
  FOR EACH ROW EXECUTE FUNCTION public.set_abandoned_cart_brand();

UPDATE public.abandoned_carts ac
SET brand_id = p.brand_id
FROM public.products p
WHERE ac.brand_id IS NULL
  AND jsonb_array_length(COALESCE(ac.cart_items,'[]'::jsonb)) > 0
  AND (ac.cart_items -> 0 ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND p.id = (ac.cart_items -> 0 ->> 'product_id')::uuid;

DROP POLICY IF EXISTS "staff update abandoned carts" ON public.abandoned_carts;
CREATE POLICY "staff update abandoned carts" ON public.abandoned_carts FOR UPDATE
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'customer_service'::app_role) OR has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'customer_service'::app_role) OR has_role(auth.uid(),'operations'::app_role));

DROP POLICY IF EXISTS "staff delete abandoned carts" ON public.abandoned_carts;
CREATE POLICY "staff delete abandoned carts" ON public.abandoned_carts FOR DELETE
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'customer_service'::app_role) OR has_role(auth.uid(),'operations'::app_role));

GRANT SELECT, UPDATE, DELETE ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;
