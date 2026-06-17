
-- Auto-log activity on order insert / status change (fail-soft)
CREATE OR REPLACE FUNCTION public.crm_log_order_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_key text;
  v_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  v_phone := COALESCE(NEW.shipping_phone, NEW.guest_phone);
  IF v_phone IS NULL THEN RETURN NEW; END IF;
  v_key := right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 11);
  IF length(v_key) < 11 THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_title := 'Order placed → ' || COALESCE(NEW.status::text, 'pending');
  ELSE
    v_title := 'Order status: ' || COALESCE(OLD.status::text,'?') || ' → ' || COALESCE(NEW.status::text,'?');
  END IF;

  BEGIN
    INSERT INTO public.crm_activities (customer_key, brand_id, type, title, body, metadata)
    VALUES (
      v_key,
      NEW.brand_id,
      'order',
      v_title,
      'Order #' || NEW.id::text || COALESCE(' • ৳' || NEW.total::text, ''),
      jsonb_build_object('order_id', NEW.id, 'status', NEW.status, 'total', NEW.total)
    );
  EXCEPTION WHEN OTHERS THEN
    -- fail-soft: never break order writes
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_log_order_activity ON public.orders;
CREATE TRIGGER trg_crm_log_order_activity
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.crm_log_order_activity();

-- Unique name per (brand,user) for saved filters
CREATE UNIQUE INDEX IF NOT EXISTS crm_saved_filters_unique
  ON public.crm_saved_filters (brand_id, created_by, name);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer_created
  ON public.crm_activities (customer_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_brand_created
  ON public.crm_activities (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_brand_status_due
  ON public.crm_tasks (brand_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer
  ON public.crm_tasks (customer_key, status);

-- pg_trgm index for fuzzy customer name match (used by findDuplicates)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
