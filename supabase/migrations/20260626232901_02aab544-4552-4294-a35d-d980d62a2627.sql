
-- Map a normalized courier status to our main order_status enum.
CREATE OR REPLACE FUNCTION public.map_courier_status_to_order(_raw text)
RETURNS public.order_status
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  k := lower(regexp_replace(trim(_raw), '[\s\-]+', '_', 'g'));
  IF k = '' THEN RETURN NULL; END IF;

  IF k IN ('delivered') THEN RETURN 'delivered'::order_status; END IF;
  IF k IN ('partial_delivery','partial_delivered') THEN RETURN 'partial_delivered'::order_status; END IF;
  IF k IN ('returned') THEN RETURN 'returned'::order_status; END IF;
  IF k IN ('return','returning','return_processing','pending_return','return_in_transit','return_to_pickup','return_to_merchant') THEN RETURN 'pending_return'::order_status; END IF;
  IF k IN ('exchange','exchanged') THEN RETURN 'exchange'::order_status; END IF;
  IF k IN ('cancelled','canceled','pickup_cancelled','cancelled_by_courier') THEN RETURN 'cancelled'::order_status; END IF;
  IF k IN ('hold','on_hold','delivery_hold','delivery_failed','lost','damaged') THEN RETURN 'on_hold'::order_status; END IF;
  IF k IN ('picked','pickup','picked_up','collected','at_the_sorting_hub','at_sorting_hub','in_transit','received_at_last_mile_hub','assigned_for_delivery','on_delivery','out_for_delivery','hub_received','rider_assigned','forwarded','reached','sorting_hub','last_mile_hub') THEN RETURN 'in_transit'::order_status; END IF;
  IF k IN ('pickup_requested','assigned_for_pickup','pickup_failed') THEN RETURN 'ready_to_ship'::order_status; END IF;
  RETURN NULL;
END;
$$;

-- Trigger: keep orders.status in sync with latest courier_shipments.status
CREATE OR REPLACE FUNCTION public.sync_order_status_from_courier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapped public.order_status;
  cur public.order_status;
BEGIN
  IF NEW.status IS NULL THEN RETURN NEW; END IF;
  mapped := public.map_courier_status_to_order(NEW.status);
  IF mapped IS NULL THEN RETURN NEW; END IF;

  SELECT status INTO cur FROM public.orders WHERE id = NEW.order_id;
  IF cur IS NULL THEN RETURN NEW; END IF;

  -- Don't overwrite terminal finance/closing states
  IF cur IN ('paid','completed','paid_return','unpaid_return') THEN RETURN NEW; END IF;
  IF cur = mapped THEN RETURN NEW; END IF;

  UPDATE public.orders
    SET status = mapped, updated_at = now()
    WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_status_from_courier ON public.courier_shipments;
CREATE TRIGGER trg_sync_order_status_from_courier
AFTER INSERT OR UPDATE OF status ON public.courier_shipments
FOR EACH ROW EXECUTE FUNCTION public.sync_order_status_from_courier();

-- Backfill: fix existing mismatches using the latest shipment per order
WITH latest AS (
  SELECT DISTINCT ON (order_id) order_id, status
  FROM public.courier_shipments
  WHERE status IS NOT NULL
  ORDER BY order_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
)
UPDATE public.orders o
SET status = m.mapped, updated_at = now()
FROM (
  SELECT l.order_id, public.map_courier_status_to_order(l.status) AS mapped
  FROM latest l
) m
WHERE o.id = m.order_id
  AND m.mapped IS NOT NULL
  AND o.status <> m.mapped
  AND o.status NOT IN ('paid','completed','paid_return','unpaid_return');
