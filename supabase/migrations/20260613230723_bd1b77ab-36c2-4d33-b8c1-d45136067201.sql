CREATE OR REPLACE FUNCTION public.assign_order_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_no IS NULL
     AND NEW.brand_id IS NOT NULL
     AND NEW.status = 'confirmed'::public.order_status THEN
    NEW.invoice_no := public.next_invoice_no(NEW.brand_id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_assign_invoice_no ON public.orders;
CREATE TRIGGER trg_orders_assign_invoice_no
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_invoice_no();