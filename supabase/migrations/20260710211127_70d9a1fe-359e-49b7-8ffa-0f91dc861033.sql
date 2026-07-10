
-- ============================================================
-- REVERT: recreate 8 wrongly-dropped tables (structure only, no data)
-- Also recreate their dependent RPCs used by the app.
-- ============================================================

-- ============ Bills ============
CREATE TABLE IF NOT EXISTS public.erp_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.erp_suppliers(id) ON DELETE RESTRICT,
  bill_no text NOT NULL,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_amount numeric NOT NULL DEFAULT 0,
  expense_account_id uuid REFERENCES public.erp_chart_accounts(id),
  ap_account_id uuid REFERENCES public.erp_chart_accounts(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','void')),
  description text,
  source_type text,
  source_id uuid,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_bills_brand_supplier ON public.erp_bills(brand_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_erp_bills_status ON public.erp_bills(brand_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_bills TO authenticated;
GRANT ALL ON public.erp_bills TO service_role;
ALTER TABLE public.erp_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance staff manage bills" ON public.erp_bills;
CREATE POLICY "Finance staff manage bills" ON public.erp_bills
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
DROP TRIGGER IF EXISTS trg_erp_bills_updated ON public.erp_bills;
CREATE TRIGGER trg_erp_bills_updated BEFORE UPDATE ON public.erp_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AR Payments ============
CREATE TABLE IF NOT EXISTS public.erp_ar_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  cash_account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id),
  ar_account_id uuid REFERENCES public.erp_chart_accounts(id),
  reference_no text,
  notes text,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_payments_order ON public.erp_ar_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_ar_payments_brand_date ON public.erp_ar_payments(brand_id, payment_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_ar_payments TO authenticated;
GRANT ALL ON public.erp_ar_payments TO service_role;
ALTER TABLE public.erp_ar_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance staff manage ar payments" ON public.erp_ar_payments;
CREATE POLICY "Finance staff manage ar payments" ON public.erp_ar_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

-- ============ Recurring rules + runs ============
CREATE TABLE IF NOT EXISTS public.erp_recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
  interval_n int NOT NULL DEFAULT 1 CHECK (interval_n > 0),
  start_date date NOT NULL,
  next_run_date date NOT NULL,
  end_date date,
  amount numeric NOT NULL CHECK (amount > 0),
  lines jsonb NOT NULL,
  auto_post boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_brand_next ON public.erp_recurring_rules(brand_id, next_run_date) WHERE is_active = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_recurring_rules TO authenticated;
GRANT ALL ON public.erp_recurring_rules TO service_role;
ALTER TABLE public.erp_recurring_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance staff manage recurring rules" ON public.erp_recurring_rules;
CREATE POLICY "Finance staff manage recurring rules" ON public.erp_recurring_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
DROP TRIGGER IF EXISTS trg_recurring_rules_updated ON public.erp_recurring_rules;
CREATE TRIGGER trg_recurring_rules_updated BEFORE UPDATE ON public.erp_recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.erp_recurring_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.erp_recurring_rules(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  run_date date NOT NULL,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','failed','skipped')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recurring_runs_rule ON public.erp_recurring_runs(rule_id, run_date);
GRANT SELECT, INSERT ON public.erp_recurring_runs TO authenticated;
GRANT ALL ON public.erp_recurring_runs TO service_role;
ALTER TABLE public.erp_recurring_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance staff view recurring runs" ON public.erp_recurring_runs;
CREATE POLICY "Finance staff view recurring runs" ON public.erp_recurring_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

-- ============ Budgets ============
CREATE TABLE IF NOT EXISTS public.erp_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, account_id, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_brand_month ON public.erp_budgets(brand_id, month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_budgets TO authenticated;
GRANT ALL ON public.erp_budgets TO service_role;
ALTER TABLE public.erp_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Finance staff manage budgets" ON public.erp_budgets;
CREATE POLICY "Finance staff manage budgets" ON public.erp_budgets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
DROP TRIGGER IF EXISTS trg_budgets_updated ON public.erp_budgets;
CREATE TRIGGER trg_budgets_updated BEFORE UPDATE ON public.erp_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Tax entries ============
CREATE TABLE IF NOT EXISTS public.erp_tax_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id) ON DELETE CASCADE,
  tax_rate_id uuid NOT NULL REFERENCES public.erp_tax_rates(id),
  direction text NOT NULL CHECK (direction IN ('output','input')),
  taxable_amount numeric(18,2) NOT NULL,
  tax_amount numeric(18,2) NOT NULL,
  entry_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_entries_brand_date ON public.erp_tax_entries(brand_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_tax_entries TO authenticated;
GRANT ALL ON public.erp_tax_entries TO service_role;
ALTER TABLE public.erp_tax_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tax_entries_all" ON public.erp_tax_entries;
CREATE POLICY "tax_entries_all" ON public.erp_tax_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'));

-- ============ Return cases ============
CREATE TABLE IF NOT EXISTS public.erp_return_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sku text,
  return_type text NOT NULL CHECK (return_type IN ('normal_return','paid_return','damage_return','refund')),
  item_condition text NOT NULL CHECK (item_condition IN ('sellable','damaged','missing','disposed')),
  qty numeric NOT NULL DEFAULT 1,
  refund_amount numeric NOT NULL DEFAULT 0,
  customer_paid_delivery numeric NOT NULL DEFAULT 0,
  outbound_delivery_cost numeric NOT NULL DEFAULT 0,
  return_delivery_cost numeric NOT NULL DEFAULT 0,
  product_cost_loss numeric NOT NULL DEFAULT 0,
  packaging_loss numeric NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_return_cases TO authenticated;
GRANT ALL ON public.erp_return_cases TO service_role;
ALTER TABLE public.erp_return_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "return_cases_staff_all" ON public.erp_return_cases;
CREATE POLICY "return_cases_staff_all" ON public.erp_return_cases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_return_cases_brand_product ON public.erp_return_cases(brand_id, product_id);
CREATE INDEX IF NOT EXISTS idx_return_cases_order ON public.erp_return_cases(order_id);
DROP TRIGGER IF EXISTS erp_return_cases_updated_at ON public.erp_return_cases;
CREATE TRIGGER erp_return_cases_updated_at BEFORE UPDATE ON public.erp_return_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Exchange cases ============
CREATE TABLE IF NOT EXISTS public.erp_exchange_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  original_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  original_order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  original_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  original_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  original_sku text,
  exchange_type text NOT NULL CHECK (exchange_type IN ('normal','damage','different_product','refund_only')),
  old_item_condition text NOT NULL CHECK (old_item_condition IN ('sellable','damaged','missing','disposed')),
  replacement_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  replacement_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  replacement_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  replacement_sku text,
  replacement_qty numeric NOT NULL DEFAULT 1,
  exchange_charge_collected numeric NOT NULL DEFAULT 0,
  replacement_delivery_cost numeric NOT NULL DEFAULT 0,
  return_delivery_cost numeric NOT NULL DEFAULT 0,
  product_cost_loss numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_exchange_cases TO authenticated;
GRANT ALL ON public.erp_exchange_cases TO service_role;
ALTER TABLE public.erp_exchange_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exchange_cases_staff_all" ON public.erp_exchange_cases;
CREATE POLICY "exchange_cases_staff_all" ON public.erp_exchange_cases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_exchange_cases_brand_product ON public.erp_exchange_cases(brand_id, original_product_id);
CREATE INDEX IF NOT EXISTS idx_exchange_cases_order ON public.erp_exchange_cases(original_order_id);
DROP TRIGGER IF EXISTS erp_exchange_cases_updated_at ON public.erp_exchange_cases;
CREATE TRIGGER erp_exchange_cases_updated_at BEFORE UPDATE ON public.erp_exchange_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Invoice Reconciliation (runs + rows) ============
CREATE TABLE IF NOT EXISTS public.erp_reconciliation_runs (
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
DROP POLICY IF EXISTS "Authenticated can manage reconciliation runs" ON public.erp_reconciliation_runs;
CREATE POLICY "Authenticated can manage reconciliation runs"
  ON public.erp_reconciliation_runs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_reco_runs_brand ON public.erp_reconciliation_runs(brand_id);
CREATE INDEX IF NOT EXISTS idx_reco_runs_status ON public.erp_reconciliation_runs(status);
CREATE INDEX IF NOT EXISTS idx_reco_runs_created ON public.erp_reconciliation_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.erp_reconciliation_rows (
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
DROP POLICY IF EXISTS "Authenticated can manage reconciliation rows" ON public.erp_reconciliation_rows;
CREATE POLICY "Authenticated can manage reconciliation rows"
  ON public.erp_reconciliation_rows FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_reco_rows_run ON public.erp_reconciliation_rows(run_id);
CREATE INDEX IF NOT EXISTS idx_reco_rows_order ON public.erp_reconciliation_rows(matched_order_id);
CREATE INDEX IF NOT EXISTS idx_reco_rows_consignment ON public.erp_reconciliation_rows(consignment_id);
CREATE INDEX IF NOT EXISTS idx_reco_rows_status ON public.erp_reconciliation_rows(match_status);
