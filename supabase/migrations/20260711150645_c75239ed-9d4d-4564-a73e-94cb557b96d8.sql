CREATE OR REPLACE FUNCTION public.transition_order_status(_order_id uuid, _new_status order_status, _reason text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_status public.order_status;
  _user uuid := auth.uid();
  _is_system boolean := (auth.role() = 'service_role') OR (_user IS NULL);
BEGIN
  IF NOT (
    _is_system
    OR public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'customer_service'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to change order status';
  END IF;

  SELECT status INTO _old_status FROM public.orders WHERE id = _order_id;
  IF _old_status IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', _order_id;
  END IF;

  IF _old_status = _new_status THEN
    RETURN;
  END IF;

  UPDATE public.orders SET status = _new_status, updated_at = now() WHERE id = _order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason, note)
  VALUES (_order_id, _old_status::text, _new_status::text, _user, _reason, _note);
END;
$function$;