
-- 1) Per-brand Meta tracking config
CREATE TABLE public.meta_tracking_config (
  brand_id UUID PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  pixel_id TEXT,
  capi_enabled BOOLEAN NOT NULL DEFAULT false,
  test_event_code TEXT,
  enabled_events JSONB NOT NULL DEFAULT '{"PageView":true,"ViewContent":true,"AddToCart":true,"InitiateCheckout":true,"Purchase":true}'::jsonb,
  token_secret_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_tracking_config TO authenticated;
GRANT ALL ON public.meta_tracking_config TO service_role;

ALTER TABLE public.meta_tracking_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read meta_tracking_config" ON public.meta_tracking_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write meta_tracking_config" ON public.meta_tracking_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) CAPI send log
CREATE TABLE public.meta_capi_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL,            -- 'ok' | 'error'
  events_received INT,
  fbtrace_id TEXT,
  response JSONB,
  error TEXT,
  source TEXT,                     -- 'test' | 'purchase' | 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meta_capi_log_brand_created_idx ON public.meta_capi_log (brand_id, created_at DESC);
CREATE INDEX meta_capi_log_status_created_idx ON public.meta_capi_log (status, created_at DESC);

GRANT SELECT ON public.meta_capi_log TO authenticated;
GRANT ALL ON public.meta_capi_log TO service_role;

ALTER TABLE public.meta_capi_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read meta_capi_log" ON public.meta_capi_log
  FOR SELECT TO authenticated USING (true);

-- update trigger
CREATE OR REPLACE FUNCTION public.tg_meta_tracking_config_updated()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER meta_tracking_config_updated
BEFORE UPDATE ON public.meta_tracking_config
FOR EACH ROW EXECUTE FUNCTION public.tg_meta_tracking_config_updated();
