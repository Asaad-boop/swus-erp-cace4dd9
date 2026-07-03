CREATE OR REPLACE FUNCTION public.log_web_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.web_status IS DISTINCT FROM OLD.web_status THEN
    INSERT INTO public.activity_log (entity_type, entity_id, action, details, performed_by, performed_at)
    VALUES (
      'order',
      NEW.id,
      'WEB_STATUS_CHANGED',
      jsonb_build_object(
        'from', OLD.web_status,
        'to', NEW.web_status,
        'status', NEW.status,
        'source', NEW.source
      ),
      auth.uid(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_web_status_change ON public.orders;
CREATE TRIGGER trg_log_web_status_change
AFTER UPDATE OF web_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_web_status_change();