
-- Update reservation function: reserve only during packing phase
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
      AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry');
    UPDATE product_variants SET reserved_stock = v_qty WHERE id = p_variant_id;
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)::int INTO v_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND oi.variant_id IS NULL
      AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry');
    UPDATE products SET reserved_stock = v_qty WHERE id = p_product_id;
  END IF;
END;
$$;

-- Backfill: products
UPDATE public.products p SET reserved_stock = COALESCE(sub.qty, 0)
FROM (
  SELECT oi.product_id, SUM(oi.quantity)::int AS qty
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NULL
    AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry')
  GROUP BY oi.product_id
) sub
WHERE sub.product_id = p.id;

UPDATE public.products SET reserved_stock = 0
WHERE id NOT IN (
  SELECT DISTINCT oi.product_id
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NULL
    AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry')
) AND reserved_stock <> 0;

-- Backfill: variants
UPDATE public.product_variants v SET reserved_stock = COALESCE(sub.qty, 0)
FROM (
  SELECT oi.variant_id, SUM(oi.quantity)::int AS qty
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NOT NULL
    AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry')
  GROUP BY oi.variant_id
) sub
WHERE sub.variant_id = v.id;

UPDATE public.product_variants SET reserved_stock = 0
WHERE id NOT IN (
  SELECT DISTINCT oi.variant_id
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.variant_id IS NOT NULL
    AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry')
) AND reserved_stock <> 0;
