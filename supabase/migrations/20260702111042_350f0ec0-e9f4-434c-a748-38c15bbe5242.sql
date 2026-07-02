
-- Add brand_id to active_sessions for per-brand live visitors
ALTER TABLE public.active_sessions ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_brand_seen ON public.active_sessions(brand_id, last_seen_at DESC);

-- Enhanced auto-brand resolver: also resolves from product_id, path /product/{slug},
-- prior session records in analytics_events / page_views / active_sessions, and referrer host.
CREATE OR REPLACE FUNCTION public._analytics_auto_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
BEGIN
  IF NEW.brand_id IS NULL THEN
    -- 1) direct order link (analytics_events only)
    IF TG_TABLE_NAME = 'analytics_events' AND NEW.order_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.orders WHERE id = NEW.order_id;
    END IF;

    -- 2) via product_id on the event
    IF NEW.brand_id IS NULL AND (to_jsonb(NEW) ? 'product_id') AND (to_jsonb(NEW)->>'product_id') IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id
      FROM public.products
      WHERE id = (to_jsonb(NEW)->>'product_id')::uuid;
    END IF;

    -- 3) via /product/{slug} path
    IF NEW.brand_id IS NULL AND (to_jsonb(NEW) ? 'path') AND (to_jsonb(NEW)->>'path') LIKE '/product/%' THEN
      v_slug := split_part(substring((to_jsonb(NEW)->>'path') FROM 10), '?', 1);
      v_slug := split_part(v_slug, '/', 1);
      IF v_slug <> '' THEN
        SELECT brand_id INTO NEW.brand_id FROM public.products WHERE slug = v_slug LIMIT 1;
      END IF;
    END IF;

    -- 4) recent brand from same session in any tracking table
    IF NEW.brand_id IS NULL AND NEW.session_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.analytics_events
        WHERE session_id = NEW.session_id AND brand_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF NEW.brand_id IS NULL AND NEW.session_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.page_views
        WHERE session_id = NEW.session_id AND brand_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF NEW.brand_id IS NULL AND NEW.session_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.active_sessions
        WHERE session_id = NEW.session_id AND brand_id IS NOT NULL LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Same resolver for active_sessions inserts/updates
CREATE OR REPLACE FUNCTION public._active_sessions_auto_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
BEGIN
  IF NEW.brand_id IS NULL THEN
    -- via /product/{slug} path
    IF NEW.path LIKE '/product/%' THEN
      v_slug := split_part(substring(NEW.path FROM 10), '?', 1);
      v_slug := split_part(v_slug, '/', 1);
      IF v_slug <> '' THEN
        SELECT brand_id INTO NEW.brand_id FROM public.products WHERE slug = v_slug LIMIT 1;
      END IF;
    END IF;

    -- via other tracking tables for this session
    IF NEW.brand_id IS NULL AND NEW.session_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.analytics_events
        WHERE session_id = NEW.session_id AND brand_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF NEW.brand_id IS NULL AND NEW.session_id IS NOT NULL THEN
      SELECT brand_id INTO NEW.brand_id FROM public.page_views
        WHERE session_id = NEW.session_id AND brand_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    -- via referrer host as final fallback
    IF NEW.brand_id IS NULL AND NEW.referrer IS NOT NULL THEN
      IF NEW.referrer ILIKE '%toyora%' THEN
        SELECT id INTO NEW.brand_id FROM public.brands WHERE slug = 'toyora' LIMIT 1;
      ELSIF NEW.referrer ILIKE '%hobby%' THEN
        SELECT id INTO NEW.brand_id FROM public.brands WHERE slug = 'hobby-shop' LIMIT 1;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_active_sessions_auto_brand ON public.active_sessions;
CREATE TRIGGER trg_active_sessions_auto_brand
  BEFORE INSERT OR UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public._active_sessions_auto_brand();

-- Backfill existing rows
UPDATE public.active_sessions s
   SET brand_id = p.brand_id
  FROM public.products p
 WHERE s.brand_id IS NULL
   AND s.path LIKE '/product/%'
   AND p.slug = split_part(split_part(substring(s.path FROM 10), '?', 1), '/', 1);

UPDATE public.active_sessions s
   SET brand_id = e.brand_id
  FROM public.analytics_events e
 WHERE s.brand_id IS NULL
   AND s.session_id = e.session_id
   AND e.brand_id IS NOT NULL;

UPDATE public.analytics_events e
   SET brand_id = p.brand_id
  FROM public.products p
 WHERE e.brand_id IS NULL
   AND e.path LIKE '/product/%'
   AND p.slug = split_part(split_part(substring(e.path FROM 10), '?', 1), '/', 1);

UPDATE public.analytics_events e
   SET brand_id = p.brand_id
  FROM public.products p
 WHERE e.brand_id IS NULL
   AND e.product_id = p.id;

UPDATE public.page_views v
   SET brand_id = p.brand_id
  FROM public.products p
 WHERE v.brand_id IS NULL
   AND v.path LIKE '/product/%'
   AND p.slug = split_part(split_part(substring(v.path FROM 10), '?', 1), '/', 1);
