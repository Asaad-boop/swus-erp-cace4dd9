GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;

GRANT SELECT ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

GRANT EXECUTE ON FUNCTION public.mark_abandoned_cart_converted(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_cart_converted(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_set_abandoned_cart_brand'
      AND tgrelid = 'public.abandoned_carts'::regclass
  ) THEN
    CREATE TRIGGER trg_set_abandoned_cart_brand
    BEFORE INSERT OR UPDATE OF cart_items, brand_id
    ON public.abandoned_carts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_abandoned_cart_brand();
  END IF;
END $$;