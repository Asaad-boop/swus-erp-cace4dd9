
CREATE TABLE public.erp_reconciliation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  courier text NOT NULL DEFAULT 'pathao',
  source_filename text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_rows int NOT NULL DEFAULT 0,
  matched_count int NOT NULL DEFAULT 0,
  mismatched_count int NOT NULL DEFAULT 0,
  unmatched_count int NOT NULL DEFAULT 0,
  total_collected numeric(14,2) NOT NULL DEFAULT 0,
  total_fee numeric(14,2) NOT NULL DEFAULT 0,
  total_payout numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  applied_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_reconciliation_runs TO authenticated;
GRANT ALL ON public.erp_reconciliation_runs TO service_role;

ALTER TABLE public.erp_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage reconciliation runs"
ON public.erp_reconciliation_runs FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX idx_reco_runs_brand ON public.erp_reconciliation_runs(brand_id);
CREATE INDEX idx_reco_runs_status ON public.erp_reconciliation_runs(status);
CREATE INDEX idx_reco_runs_created ON public.erp_reconciliation_runs(created_at DESC);

CREATE TABLE public.erp_reconciliation_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.erp_reconciliation_runs(id) ON DELETE CASCADE,
  consignment_id text,
  merchant_order_id text,
  recipient_name text,
  recipient_phone text,
  invoice_date date,
  collected numeric(14,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(14,2) NOT NULL DEFAULT 0,
  cod_fee numeric(14,2) NOT NULL DEFAULT 0,
  other_fee numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total_fee numeric(14,2) NOT NULL DEFAULT 0,
  payout numeric(14,2) NOT NULL DEFAULT 0,
  store_name text,
  raw jsonb,
  match_status text NOT NULL DEFAULT 'unmatched',
  matched_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  matched_via text,
  amount_diff numeric(14,2),
  applied_income_txn_id uuid REFERENCES public.erp_transactions(id) ON DELETE SET NULL,
  applied_expense_txn_id uuid REFERENCES public.erp_transactions(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_reconciliation_rows TO authenticated;
GRANT ALL ON public.erp_reconciliation_rows TO service_role;

ALTER TABLE public.erp_reconciliation_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage reconciliation rows"
ON public.erp_reconciliation_rows FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX idx_reco_rows_run ON public.erp_reconciliation_rows(run_id);
CREATE INDEX idx_reco_rows_order ON public.erp_reconciliation_rows(matched_order_id);
CREATE INDEX idx_reco_rows_consignment ON public.erp_reconciliation_rows(consignment_id);
CREATE INDEX idx_reco_rows_status ON public.erp_reconciliation_rows(match_status);

CREATE TRIGGER update_reco_runs_updated_at
BEFORE UPDATE ON public.erp_reconciliation_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reco_rows_updated_at
BEFORE UPDATE ON public.erp_reconciliation_rows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
