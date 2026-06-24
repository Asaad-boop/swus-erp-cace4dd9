
-- Pending order statuses that should reserve stock
CREATE OR REPLACE FUNCTION public.recompute_reserved_stock(p_product_id uuid, p_variant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty integer;
BEGIN
  IF p_variant_id IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)::int INTO v_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.variant_id = p_variant_id
      AND o.status IN ('new','confirmed');
    UPDATE product_variants SET reserved_stock = v_qty WHERE id = p_variant_id;
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)::int INTO v_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND oi.variant_id IS NULL
      AND o.status IN ('new','confirmed');
    UPDATE products SET reserved_stock = v_qty WHERE id = p_product_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_order_items_reserved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_reserved_stock(OLD.product_id, OLD.variant_id);
    RETURN OLD;
  END IF;

  PERFORM public.recompute_reserved_stock(NEW.product_id, NEW.variant_id);

  IF TG_OP = 'UPDATE' AND (
    NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
  ) THEN
    PERFORM public.recompute_reserved_stock(OLD.product_id, OLD.variant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_reserved_stock ON public.order_items;
CREATE TRIGGER order_items_reserved_stock
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_order_items_reserved();

CREATE OR REPLACE FUNCTION public.trg_orders_reserved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT DISTINCT product_id, variant_id
    FROM order_items
    WHERE order_id = COALESCE(NEW.id, OLD.id)
  LOOP
    PERFORM public.recompute_reserved_stock(r.product_id, r.variant_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS orders_reserved_stock ON public.orders;
CREATE TRIGGER orders_reserved_stock
AFTER INSERT OR UPDATE OF status OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_orders_reserved();

-- Backfill
UPDATE public.products p SET reserved_stock = COALESCE(sub.qty, 0)
FROM (
  SELECT oi.product_id, SUM(oi.quantity)::int AS qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NULL AND o.status IN ('new','confirmed')
  GROUP BY oi.product_id
) sub
WHERE sub.product_id = p.id;

UPDATE public.products SET reserved_stock = 0
WHERE id NOT IN (
  SELECT DISTINCT oi.product_id
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NULL AND o.status IN ('new','confirmed')
) AND reserved_stock <> 0;

UPDATE public.product_variants v SET reserved_stock = COALESCE(sub.qty, 0)
FROM (
  SELECT oi.variant_id, SUM(oi.quantity)::int AS qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NOT NULL AND o.status IN ('new','confirmed')
  GROUP BY oi.variant_id
) sub
WHERE sub.variant_id = v.id;

UPDATE public.product_variants SET reserved_stock = 0
WHERE id NOT IN (
  SELECT DISTINCT oi.variant_id
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NOT NULL AND o.status IN ('new','confirmed')
) AND reserved_stock <> 0;
