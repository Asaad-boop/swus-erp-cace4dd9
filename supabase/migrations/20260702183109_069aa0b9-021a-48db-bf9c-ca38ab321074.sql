
-- Auto-mark abandoned carts as converted when a matching order is placed.
-- Matches by normalized phone (last 11 digits) within a 24h window, same brand when known.

CREATE OR REPLACE FUNCTION public.auto_convert_abandoned_cart()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  v_phone := COALESCE(NEW.shipping_phone, NEW.guest_phone);
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 10 THEN
    RETURN NEW;
  END IF;

  UPDATE public.abandoned_carts ac
  SET is_converted = true,
      converted_order_id = NEW.id,
      updated_at = now()
  WHERE ac.is_converted = false
    AND right(regexp_replace(COALESCE(ac.customer_phone,''), '\D', '', 'g'), 11)
        = right(regexp_replace(v_phone, '\D', '', 'g'), 11)
    AND (NEW.brand_id IS NULL OR ac.brand_id IS NULL OR ac.brand_id = NEW.brand_id)
    AND ac.updated_at >= now() - INTERVAL '24 hours';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_convert_abandoned_cart ON public.orders;
CREATE TRIGGER trg_auto_convert_abandoned_cart
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_convert_abandoned_cart();

-- Backfill: mark existing incomplete carts whose customer already placed an order within 24h of the cart update.
UPDATE public.abandoned_carts ac
SET is_converted = true,
    converted_order_id = o.id,
    updated_at = now()
FROM public.orders o
WHERE ac.is_converted = false
  AND ac.customer_phone IS NOT NULL
  AND right(regexp_replace(ac.customer_phone, '\D', '', 'g'), 11)
      = right(regexp_replace(COALESCE(o.shipping_phone, o.guest_phone, ''), '\D', '', 'g'), 11)
  AND o.created_at BETWEEN ac.updated_at - INTERVAL '10 minutes' AND ac.updated_at + INTERVAL '24 hours'
  AND (o.brand_id IS NULL OR ac.brand_id IS NULL OR ac.brand_id = o.brand_id);
