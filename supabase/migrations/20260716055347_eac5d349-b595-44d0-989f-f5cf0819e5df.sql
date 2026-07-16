CREATE OR REPLACE FUNCTION public.handle_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Stock reservation/release is handled by tg_orders_stock_reservation
  -- (calls 2-arg reserve_stock / release_stock_reservation). This trigger
  -- only maintains status timestamp columns.

  IF (OLD.status = 'new'::public.order_status
      AND NEW.status = 'confirmed'::public.order_status) THEN
    PERFORM public.finalize_order_on_confirm(NEW.id);
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
    NEW.verified_at := COALESCE(NEW.verified_at, now());
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
    NEW.delivered_at := COALESCE(NEW.delivered_at, now());
  END IF;

  RETURN NEW;
END;
$function$;