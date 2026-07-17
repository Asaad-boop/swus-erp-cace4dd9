
CREATE TABLE IF NOT EXISTS public.erp_product_expense_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL,
  product_id UUID NOT NULL,
  campaign_id UUID NULL,
  mkt_ad_account_id UUID NULL,
  allocation_date DATE NOT NULL,
  expense_transaction_id UUID NULL,
  expense_type TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  allocation_method TEXT NOT NULL DEFAULT 'campaign_weight',
  source TEXT NOT NULL DEFAULT 'meta_auto',
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epea_campaign_date
  ON public.erp_product_expense_allocations (campaign_id, allocation_date);
CREATE INDEX IF NOT EXISTS idx_epea_brand_date
  ON public.erp_product_expense_allocations (brand_id, allocation_date);
CREATE INDEX IF NOT EXISTS idx_epea_product_date
  ON public.erp_product_expense_allocations (product_id, allocation_date);
CREATE INDEX IF NOT EXISTS idx_epea_source_type
  ON public.erp_product_expense_allocations (source, expense_type);

GRANT SELECT ON public.erp_product_expense_allocations TO authenticated;
GRANT ALL ON public.erp_product_expense_allocations TO service_role;

ALTER TABLE public.erp_product_expense_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read expense allocations" ON public.erp_product_expense_allocations;
CREATE POLICY "Staff can read expense allocations"
ON public.erp_product_expense_allocations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'operations')
  OR public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'marketing_manager')
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_epea_updated_at ON public.erp_product_expense_allocations;
CREATE TRIGGER trg_epea_updated_at
BEFORE UPDATE ON public.erp_product_expense_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.mkt_campaigns ALTER COLUMN brand_id DROP NOT NULL;
