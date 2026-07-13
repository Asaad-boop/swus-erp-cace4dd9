CREATE OR REPLACE FUNCTION public.sync_order_status_from_courier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  mapped public.order_status;
  cur public.order_status;
BEGIN
  IF NEW.status IS NULL THEN RETURN NEW; END IF;
  mapped := public.map_courier_status_to_order(NEW.status);
  IF mapped IS NULL THEN RETURN NEW; END IF;

  SELECT status INTO cur FROM public.orders WHERE id = NEW.order_id;
  IF cur IS NULL THEN RETURN NEW; END IF;

  IF cur IN ('paid','completed','paid_return','unpaid_return') THEN RETURN NEW; END IF;
  IF cur = mapped THEN RETURN NEW; END IF;

  UPDATE public.orders
    SET status = mapped, updated_at = now()
    WHERE id = NEW.order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason, note)
  VALUES (
    NEW.order_id,
    cur::text,
    mapped::text,
    NULL,
    'courier_sync',
    format('%s: %s', COALESCE(NEW.provider, 'courier'), NEW.status)
  );

  RETURN NEW;
END;
$function$;