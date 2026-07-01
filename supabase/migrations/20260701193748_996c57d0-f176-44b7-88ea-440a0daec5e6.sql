
CREATE OR REPLACE FUNCTION public.abandoned_carts_autotag_brand()
RETURNS TRIGGER AS $$
DECLARE
  v_brand_id UUID;
  v_pid TEXT;
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.cart_items IS NULL OR jsonb_typeof(NEW.cart_items) <> 'array' OR jsonb_array_length(NEW.cart_items) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_pid IN
    SELECT COALESCE(item->>'product_id', item->>'id')
    FROM jsonb_array_elements(NEW.cart_items) AS item
  LOOP
    IF v_pid IS NULL OR v_pid = '' THEN CONTINUE; END IF;
    BEGIN
      SELECT p.brand_id INTO v_brand_id FROM public.products p WHERE p.id = v_pid::uuid LIMIT 1;
    EXCEPTION WHEN others THEN
      v_brand_id := NULL;
    END;
    IF v_brand_id IS NOT NULL THEN
      NEW.brand_id := v_brand_id;
      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_abandoned_carts_autotag_brand ON public.abandoned_carts;
CREATE TRIGGER trg_abandoned_carts_autotag_brand
BEFORE INSERT OR UPDATE ON public.abandoned_carts
FOR EACH ROW EXECUTE FUNCTION public.abandoned_carts_autotag_brand();

-- Backfill existing rows missing brand_id
UPDATE public.abandoned_carts ac
SET brand_id = sub.brand_id
FROM (
  SELECT ac2.id, p.brand_id
  FROM public.abandoned_carts ac2
  CROSS JOIN LATERAL jsonb_array_elements(ac2.cart_items) AS item
  JOIN public.products p
    ON p.id = NULLIF(COALESCE(item->>'product_id', item->>'id'), '')::uuid
  WHERE ac2.brand_id IS NULL
    AND ac2.cart_items IS NOT NULL
    AND jsonb_typeof(ac2.cart_items) = 'array'
    AND p.brand_id IS NOT NULL
  ORDER BY ac2.id
) sub
WHERE ac.id = sub.id AND ac.brand_id IS NULL;
