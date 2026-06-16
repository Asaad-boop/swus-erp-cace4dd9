
-- Phase 4: Website tracker sites + public ingest RPC

CREATE TABLE IF NOT EXISTS public.marketing_tracker_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  site_key text NOT NULL UNIQUE,
  name text NOT NULL,
  allowed_origins text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_tracker_sites TO authenticated;
GRANT ALL ON public.marketing_tracker_sites TO service_role;

ALTER TABLE public.marketing_tracker_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_tracker_sites" ON public.marketing_tracker_sites
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operations'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "admin_manage_tracker_sites" ON public.marketing_tracker_sites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_tracker_sites_brand ON public.marketing_tracker_sites(brand_id);
CREATE INDEX IF NOT EXISTS idx_tracker_sites_key ON public.marketing_tracker_sites(site_key) WHERE is_active = true;

CREATE TRIGGER trg_tracker_sites_updated
  BEFORE UPDATE ON public.marketing_tracker_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes on sessions/events for fast upsert + lookup
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_sessions_brand_session
  ON public.marketing_sessions(brand_id, session_id);
CREATE INDEX IF NOT EXISTS idx_marketing_sessions_mobile
  ON public.marketing_sessions(brand_id, mobile_normalized)
  WHERE mobile_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_sessions_fbp
  ON public.marketing_sessions(brand_id, fbp) WHERE fbp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_events_session
  ON public.marketing_events(brand_id, session_id, event_time DESC);

-- Public ingest function: validates site_key, normalises mobile, upserts session, inserts event
CREATE OR REPLACE FUNCTION public.mkt_ingest_track(
  p_site_key text,
  p_origin text,
  p_session_id text,
  p_event_name text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site public.marketing_tracker_sites%ROWTYPE;
  v_brand_id uuid;
  v_mobile text;
  v_fbc text;
  v_now timestamptz := now();
BEGIN
  IF p_site_key IS NULL OR p_session_id IS NULL OR p_event_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_fields');
  END IF;

  SELECT * INTO v_site FROM public.marketing_tracker_sites
   WHERE site_key = p_site_key AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_site_key');
  END IF;

  -- Origin check (skip if no origins configured = allow all)
  IF array_length(v_site.allowed_origins, 1) IS NOT NULL
     AND p_origin IS NOT NULL
     AND NOT (p_origin = ANY (v_site.allowed_origins)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'origin_not_allowed');
  END IF;

  v_brand_id := v_site.brand_id;
  v_mobile := public.normalize_mobile_bd(p_payload->>'mobile');

  -- Build fbc from fbclid if not provided
  v_fbc := p_payload->>'fbc';
  IF v_fbc IS NULL AND (p_payload->>'fbclid') IS NOT NULL THEN
    v_fbc := 'fb.1.' || (extract(epoch from v_now)::bigint)::text || '.' || (p_payload->>'fbclid');
  END IF;

  -- Upsert session
  INSERT INTO public.marketing_sessions (
    brand_id, session_id, first_seen_at, last_seen_at,
    landing_page, referrer, device_type, user_agent_hash, ip_hash,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id,
    fbclid, fbc, fbp,
    meta_campaign_id, meta_campaign_name, meta_adset_id, meta_adset_name,
    meta_ad_id, meta_ad_name, meta_placement,
    mobile_normalized
  ) VALUES (
    v_brand_id, p_session_id, v_now, v_now,
    p_payload->>'landing_page', p_payload->>'referrer', p_payload->>'device_type',
    p_payload->>'ua_hash', p_payload->>'ip_hash',
    p_payload->>'utm_source', p_payload->>'utm_medium', p_payload->>'utm_campaign',
    p_payload->>'utm_content', p_payload->>'utm_term', p_payload->>'utm_id',
    p_payload->>'fbclid', v_fbc, p_payload->>'fbp',
    p_payload->>'meta_campaign_id', p_payload->>'meta_campaign_name',
    p_payload->>'meta_adset_id', p_payload->>'meta_adset_name',
    p_payload->>'meta_ad_id', p_payload->>'meta_ad_name', p_payload->>'meta_placement',
    v_mobile
  )
  ON CONFLICT (brand_id, session_id) DO UPDATE SET
    last_seen_at = v_now,
    fbp = COALESCE(EXCLUDED.fbp, public.marketing_sessions.fbp),
    fbc = COALESCE(EXCLUDED.fbc, public.marketing_sessions.fbc),
    fbclid = COALESCE(EXCLUDED.fbclid, public.marketing_sessions.fbclid),
    utm_source = COALESCE(public.marketing_sessions.utm_source, EXCLUDED.utm_source),
    utm_medium = COALESCE(public.marketing_sessions.utm_medium, EXCLUDED.utm_medium),
    utm_campaign = COALESCE(public.marketing_sessions.utm_campaign, EXCLUDED.utm_campaign),
    utm_content = COALESCE(public.marketing_sessions.utm_content, EXCLUDED.utm_content),
    utm_term = COALESCE(public.marketing_sessions.utm_term, EXCLUDED.utm_term),
    meta_campaign_id = COALESCE(public.marketing_sessions.meta_campaign_id, EXCLUDED.meta_campaign_id),
    meta_adset_id = COALESCE(public.marketing_sessions.meta_adset_id, EXCLUDED.meta_adset_id),
    meta_ad_id = COALESCE(public.marketing_sessions.meta_ad_id, EXCLUDED.meta_ad_id),
    mobile_normalized = COALESCE(public.marketing_sessions.mobile_normalized, EXCLUDED.mobile_normalized),
    updated_at = v_now;

  -- Insert event
  INSERT INTO public.marketing_events (
    brand_id, session_id, event_name, event_time, source,
    mobile_normalized, value, currency, event_id, raw_json
  ) VALUES (
    v_brand_id, p_session_id, p_event_name, v_now, 'web',
    v_mobile,
    COALESCE((p_payload->>'value')::numeric, 0),
    COALESCE(p_payload->>'currency', 'BDT'),
    p_payload->>'event_id',
    p_payload
  );

  UPDATE public.marketing_tracker_sites
     SET last_event_at = v_now WHERE id = v_site.id;

  RETURN jsonb_build_object('ok', true, 'brand_id', v_brand_id, 'session_id', p_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mkt_ingest_track(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_ingest_track(text, text, text, text, jsonb) TO service_role;
