CREATE TABLE IF NOT EXISTS public.mkt_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  session_id text,
  visitor_id text,
  event_type text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  phone text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  referrer text,
  url text,
  user_agent text,
  ip_hash text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_tracking_events TO authenticated;
GRANT INSERT ON public.mkt_tracking_events TO anon;
GRANT ALL ON public.mkt_tracking_events TO service_role;
ALTER TABLE public.mkt_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mkt_track_brand_created ON public.mkt_tracking_events(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_track_phone ON public.mkt_tracking_events(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_track_session ON public.mkt_tracking_events(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_track_order ON public.mkt_tracking_events(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_track_fbclid ON public.mkt_tracking_events(fbclid) WHERE fbclid IS NOT NULL;

DROP POLICY IF EXISTS "mkt_track_select" ON public.mkt_tracking_events;
DROP POLICY IF EXISTS "mkt_track_insert_anon" ON public.mkt_tracking_events;
DROP POLICY IF EXISTS "mkt_track_insert_auth" ON public.mkt_tracking_events;
DROP POLICY IF EXISTS "mkt_track_mod" ON public.mkt_tracking_events;
DROP POLICY IF EXISTS mkt_track_select ON public.mkt_tracking_events;
DROP POLICY IF EXISTS mkt_track_insert_anon ON public.mkt_tracking_events;
DROP POLICY IF EXISTS mkt_track_insert_auth ON public.mkt_tracking_events;
DROP POLICY IF EXISTS mkt_track_mod ON public.mkt_tracking_events;

CREATE POLICY "mkt_track_select" ON public.mkt_tracking_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
  );

CREATE POLICY "mkt_track_insert_anon" ON public.mkt_tracking_events
  FOR INSERT TO anon
  WITH CHECK (brand_id IS NOT NULL);

CREATE POLICY "mkt_track_insert_auth" ON public.mkt_tracking_events
  FOR INSERT TO authenticated
  WITH CHECK (brand_id IS NOT NULL);

CREATE POLICY "mkt_track_mod" ON public.mkt_tracking_events
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
  );