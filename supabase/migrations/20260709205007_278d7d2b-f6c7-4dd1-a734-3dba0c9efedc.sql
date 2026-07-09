-- Phase 3: attribution candidates table for low-confidence auto-resolves
CREATE TABLE public.mkt_attribution_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  brand_id uuid NOT NULL,
  suggested_campaign_id uuid NULL,
  source text NOT NULL,
  confidence numeric(4,3) NOT NULL,
  matched_signal jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending|accepted|dismissed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_attr_candidates_brand ON public.mkt_attribution_candidates(brand_id, status, created_at DESC);
CREATE INDEX idx_mkt_attr_candidates_campaign ON public.mkt_attribution_candidates(suggested_campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_attribution_candidates TO authenticated;
GRANT ALL ON public.mkt_attribution_candidates TO service_role;

ALTER TABLE public.mkt_attribution_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/ops manage attribution candidates"
  ON public.mkt_attribution_candidates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

CREATE POLICY "Admin/ops read attribution candidates"
  ON public.mkt_attribution_candidates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

CREATE TRIGGER trg_mkt_attr_candidates_updated
  BEFORE UPDATE ON public.mkt_attribution_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
