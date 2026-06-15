GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;

GRANT EXECUTE ON FUNCTION public.upsert_abandoned_cart(uuid, text, text, text, text, text, text, text, text, numeric, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_cart_converted(uuid, uuid) TO authenticated;

DROP TRIGGER IF EXISTS trg_abandoned_cart_brand ON public.abandoned_carts;
DROP TRIGGER IF EXISTS trg_set_abandoned_cart_brand ON public.abandoned_carts;

CREATE TRIGGER trg_set_abandoned_cart_brand
  BEFORE INSERT OR UPDATE OF cart_items, brand_id ON public.abandoned_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_abandoned_cart_brand();