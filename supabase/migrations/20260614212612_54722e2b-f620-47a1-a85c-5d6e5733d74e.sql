GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;

DROP TRIGGER IF EXISTS trg_set_abandoned_cart_brand ON public.abandoned_carts;
CREATE TRIGGER trg_set_abandoned_cart_brand
BEFORE INSERT OR UPDATE OF cart_items, brand_id ON public.abandoned_carts
FOR EACH ROW
EXECUTE FUNCTION public.set_abandoned_cart_brand();