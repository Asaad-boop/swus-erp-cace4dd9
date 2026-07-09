-- 1. Add site_key column
ALTER TABLE public.meta_tracking_config
  ADD COLUMN IF NOT EXISTS site_key text;

CREATE UNIQUE INDEX IF NOT EXISTS meta_tracking_config_site_key_uidx
  ON public.meta_tracking_config (site_key)
  WHERE site_key IS NOT NULL;

-- 2. Backfill site keys for existing brands
UPDATE public.meta_tracking_config
  SET site_key = 'hobbyshop'
  WHERE brand_id = '1f1f366d-ad85-4513-85ab-2dbb6b23c513' AND site_key IS NULL;

UPDATE public.meta_tracking_config
  SET site_key = 'toyora'
  WHERE brand_id = '40abf6fa-404e-4c3f-b0df-f35c1535e95d' AND site_key IS NULL;

-- 3. Rewrite mkt_ingest_track to write into mkt_tracking_events
CREATE OR REPLACE FUNCTION public.mkt_ingest_track(
  p_site_key   text,
  p_origin     text,
  p_session_id text,
  p_event_name text,
  p_payload    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_event_id uuid;
BEGIN
  IF p_site_key IS NULL OR length(p_site_key) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_site_key');
  END IF;

  SELECT brand_id INTO v_brand_id
    FROM public.meta_tracking_config
   WHERE site_key = p_site_key
   LIMIT 1;

  IF v_brand_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_site_key');
  END IF;

  INSERT INTO public.mkt_tracking_events (
    brand_id, session_id, event_type,
    phone, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, referrer, url, user_agent, ip_hash, raw
  )
  VALUES (
    v_brand_id,
    p_session_id,
    COALESCE(NULLIF(p_event_name, ''), 'page_view'),
    NULLIF(p_payload->>'mobile', ''),
    NULLIF(p_payload->>'utm_source', ''),
    NULLIF(p_payload->>'utm_medium', ''),
    NULLIF(p_payload->>'utm_campaign', ''),
    NULLIF(p_payload->>'utm_content', ''),
    NULLIF(p_payload->>'utm_term', ''),
    NULLIF(p_payload->>'fbclid', ''),
    NULLIF(p_payload->>'referrer', ''),
    NULLIF(p_payload->>'landing_page', ''),
    NULLIF(p_payload->>'ua_hash', ''),
    NULLIF(p_payload->>'ip_hash', ''),
    p_payload
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('ok', true, 'brand_id', v_brand_id, 'event_id', v_event_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_ingest_track(text, text, text, text, jsonb) TO anon, authenticated, service_role;