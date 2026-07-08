
-- Cross-brand COD invoice reconciliation support
ALTER TABLE public.erp_reconciliation_rows
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_reconciliation_rows_brand ON public.erp_reconciliation_rows(brand_id);

-- Per-brand default wallet for COD payouts (used when applying cross-brand invoice)
ALTER TABLE public.erp_settings
  ADD COLUMN IF NOT EXISTS default_cod_wallet_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_cod_fee_category_id uuid REFERENCES public.erp_expense_categories(id) ON DELETE SET NULL;
