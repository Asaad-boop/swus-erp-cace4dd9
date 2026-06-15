GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;

CREATE OR REPLACE FUNCTION public.set_abandoned_cart_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pid uuid;
  _bid uuid;
  _item jsonb;
  _raw text;
BEGIN
  IF NEW.brand_id IS NULL AND NEW.cart_items IS NOT NULL AND jsonb_typeof(NEW.cart_items) = 'array' THEN
    FOR _item IN SELECT value FROM jsonb_array_elements(NEW.cart_items)
    LOOP
      _raw := COALESCE(_item ->> 'product_id', _item ->> 'id');
      IF _raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        _pid := _raw::uuid;
        SELECT brand_id INTO _bid FROM public.products WHERE id = _pid;
        IF _bid IS NOT NULL THEN
          NEW.brand_id := _bid;
          EXIT;
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_abandoned_cart_brand ON public.abandoned_carts;
CREATE TRIGGER trg_set_abandoned_cart_brand
BEFORE INSERT OR UPDATE OF cart_items, brand_id ON public.abandoned_carts
FOR EACH ROW
EXECUTE FUNCTION public.set_abandoned_cart_brand();

WITH resolved AS (
  SELECT DISTINCT ON (ac.id)
    ac.id,
    p.brand_id
  FROM public.abandoned_carts ac
  CROSS JOIN LATERAL jsonb_array_elements(ac.cart_items) item
  JOIN public.products p
    ON p.id = COALESCE(item ->> 'product_id', item ->> 'id')::uuid
  WHERE ac.brand_id IS NULL
    AND ac.cart_items IS NOT NULL
    AND jsonb_typeof(ac.cart_items) = 'array'
    AND COALESCE(item ->> 'product_id', item ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND p.brand_id IS NOT NULL
)
UPDATE public.abandoned_carts ac
SET brand_id = resolved.brand_id,
    updated_at = now()
FROM resolved
WHERE ac.id = resolved.id;