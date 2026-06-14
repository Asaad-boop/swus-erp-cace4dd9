-- Add `paid` terminal status (COD settled by courier)
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'paid';

-- Track when courier paid out the COD
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Extend status-change trigger to set paid_at (and backfill delivered_at if missing)
CREATE OR REPLACE FUNCTION public.handle_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.status = 'new'::public.order_status
      AND NEW.status = 'confirmed'::public.order_status) THEN
    PERFORM public.reserve_stock(NEW.id);
    PERFORM public.finalize_order_on_confirm(NEW.id);
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
    NEW.verified_at := COALESCE(NEW.verified_at, now());
  END IF;

  IF (NEW.status IN ('cancelled'::public.order_status, 'fake'::public.order_status)
      AND OLD.status IN (
        'confirmed'::public.order_status, 'packaging'::public.order_status,
        'packed'::public.order_status, 'ready_to_ship'::public.order_status
      )) THEN
    PERFORM public.release_stock(NEW.id);
  END IF;

  IF NEW.status = 'packaging'::public.order_status AND OLD.status <> 'packaging'::public.order_status THEN
    NEW.packaged_at := COALESCE(NEW.packaged_at, now());
  END IF;
  IF NEW.status = 'shipped'::public.order_status AND OLD.status <> 'shipped'::public.order_status THEN
    NEW.shipped_at := COALESCE(NEW.shipped_at, now());
  END IF;
  IF NEW.status = 'delivered'::public.order_status AND OLD.status <> 'delivered'::public.order_status THEN
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  END IF;
  IF NEW.status = 'paid'::public.order_status AND OLD.status <> 'paid'::public.order_status THEN
    NEW.paid_at := COALESCE(NEW.paid_at, now());
    -- A paid order is implicitly delivered too
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  END IF;

  RETURN NEW;
END;
$function$;