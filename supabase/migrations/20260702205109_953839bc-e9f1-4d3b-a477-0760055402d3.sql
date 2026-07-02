-- Junction table for many-to-many ad account <-> brand
CREATE TABLE public.mkt_ad_account_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id UUID NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, brand_id)
);

CREATE INDEX idx_mkt_aab_ad_account ON public.mkt_ad_account_brands(ad_account_id);
CREATE INDEX idx_mkt_aab_brand ON public.mkt_ad_account_brands(brand_id);
-- One primary brand per ad account
CREATE UNIQUE INDEX uniq_mkt_aab_primary
  ON public.mkt_ad_account_brands(ad_account_id)
  WHERE is_primary;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_ad_account_brands TO authenticated;
GRANT ALL ON public.mkt_ad_account_brands TO service_role;

ALTER TABLE public.mkt_ad_account_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read ad account brand links"
  ON public.mkt_ad_account_brands FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin/ops manage ad account brand links"
  ON public.mkt_ad_account_brands FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operations'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operations'::app_role)
  );

-- Backfill from existing mkt_ad_accounts.brand_id
INSERT INTO public.mkt_ad_account_brands (ad_account_id, brand_id, is_primary)
SELECT id, brand_id, true
FROM public.mkt_ad_accounts
WHERE brand_id IS NOT NULL
ON CONFLICT (ad_account_id, brand_id) DO NOTHING;
