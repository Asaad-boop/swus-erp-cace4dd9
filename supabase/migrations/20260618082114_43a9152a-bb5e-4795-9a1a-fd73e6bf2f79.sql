
-- Trigger function: react to order.status changes
CREATE OR REPLACE FUNCTION public.tg_orders_stock_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE items jsonb;
BEGIN
  -- Only react when status actually changes
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Build items payload from order_items
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', oi.product_id,
    'variant_id', oi.variant_id,
    'qty', oi.quantity
  )), '[]'::jsonb)
  INTO items
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id;

  -- INSERT path: if order is created already-confirmed
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public.reserve_stock(NEW.id, items);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: status transitioned
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    PERFORM public.reserve_stock(NEW.id, items);
  ELSIF NEW.status IN ('cancelled','returned','partial_return','delivered','partial_delivered','paid')
        AND OLD.status NOT IN ('cancelled','returned','partial_return','delivered','partial_delivered','paid') THEN
    PERFORM public.release_stock_reservation(NEW.id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_stock_reservation ON public.orders;
CREATE TRIGGER trg_orders_stock_reservation
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_stock_reservation();

-- Tighten: revoke execute on definer fns from anon (RLS already blocks data, but tidy linter)
REVOKE EXECUTE ON FUNCTION public.reserve_stock(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.release_stock_reservation(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_weighted_avg_cost(uuid, uuid, integer, numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_reorder_triggers(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_reorder_triggers_all_brands() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_stock_reservation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_weighted_avg_cost(uuid, uuid, integer, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_reorder_triggers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_reorder_triggers_all_brands() TO service_role;
