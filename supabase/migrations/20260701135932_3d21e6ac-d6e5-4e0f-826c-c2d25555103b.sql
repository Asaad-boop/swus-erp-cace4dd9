
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_events_brand_created ON public.analytics_events(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_brand_created ON public.page_views(brand_id, created_at DESC);

-- Backfill from orders where order_id present
UPDATE public.analytics_events e SET brand_id = o.brand_id
  FROM public.orders o WHERE e.order_id = o.id AND e.brand_id IS NULL AND o.brand_id IS NOT NULL;

-- Backfill from mkt_tracking_events by session_id
UPDATE public.analytics_events e SET brand_id = m.brand_id
  FROM (SELECT DISTINCT session_id, brand_id FROM public.mkt_tracking_events WHERE brand_id IS NOT NULL) m
  WHERE e.session_id = m.session_id AND e.brand_id IS NULL;

UPDATE public.page_views p SET brand_id = m.brand_id
  FROM (SELECT DISTINCT session_id, brand_id FROM public.mkt_tracking_events WHERE brand_id IS NOT NULL) m
  WHERE p.session_id = m.session_id AND p.brand_id IS NULL;

-- Auto-populate brand_id on insert from mkt_tracking_events session mapping
CREATE OR REPLACE FUNCTION public._analytics_auto_brand() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN
    -- Try order first
    IF (TG_TABLE_NAME = 'analytics_events') AND NEW.order_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.orders WHERE id = NEW.order_id;
    END IF;
    IF NEW.brand_id IS NULL AND NEW.session_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.mkt_tracking_events
        WHERE session_id = NEW.session_id AND brand_id IS NOT NULL LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analytics_events_auto_brand ON public.analytics_events;
CREATE TRIGGER trg_analytics_events_auto_brand BEFORE INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public._analytics_auto_brand();

DROP TRIGGER IF EXISTS trg_page_views_auto_brand ON public.page_views;
CREATE TRIGGER trg_page_views_auto_brand BEFORE INSERT ON public.page_views
  FOR EACH ROW EXECUTE FUNCTION public._analytics_auto_brand();
