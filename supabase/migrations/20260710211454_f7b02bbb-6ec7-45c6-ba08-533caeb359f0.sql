
-- Re-apply column additions from 20260620123816 onward that were lost with the drop

ALTER TABLE public.erp_return_cases
  ADD COLUMN IF NOT EXISTS return_status text NOT NULL DEFAULT 'initiated',
  ADD COLUMN IF NOT EXISTS courier_tracking_id text,
  ADD COLUMN IF NOT EXISTS courier_name text,
  ADD COLUMN IF NOT EXISTS qc_condition text,
  ADD COLUMN IF NOT EXISTS qc_notes text,
  ADD COLUMN IF NOT EXISTS qc_done_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS qc_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_updated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS case_number text,
  ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ;

ALTER TABLE public.erp_exchange_cases
  ADD COLUMN IF NOT EXISTS exchange_status text NOT NULL DEFAULT 'initiated',
  ADD COLUMN IF NOT EXISTS new_order_id uuid REFERENCES public.orders(id),
  ADD COLUMN IF NOT EXISTS courier_tracking_id text,
  ADD COLUMN IF NOT EXISTS exchange_type_detail text,
  ADD COLUMN IF NOT EXISTS case_number text,
  ADD COLUMN IF NOT EXISTS replacement_tracking_id text,
  ADD COLUMN IF NOT EXISTS replacement_courier text,
  ADD COLUMN IF NOT EXISTS original_item_restocked boolean NOT NULL DEFAULT false;

ALTER TABLE public.erp_exchange_cases DROP CONSTRAINT IF EXISTS erp_exchange_cases_exchange_type_check;
ALTER TABLE public.erp_exchange_cases ADD CONSTRAINT erp_exchange_cases_exchange_type_check
  CHECK (exchange_type IN ('normal','damage','different_product','refund_only','same_variant','different_variant'));

CREATE UNIQUE INDEX IF NOT EXISTS erp_return_cases_case_number_uidx
  ON public.erp_return_cases(case_number) WHERE case_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS erp_exchange_cases_case_number_uidx
  ON public.erp_exchange_cases(case_number) WHERE case_number IS NOT NULL;

ALTER TABLE public.erp_reconciliation_rows
  ADD COLUMN IF NOT EXISTS match_type text DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS return_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_reconciliation_rows_brand ON public.erp_reconciliation_rows(brand_id);

-- Re-create triggers for case number + timeline (functions already exist from earlier migration)
DROP TRIGGER IF EXISTS trg_return_case_number ON public.erp_return_cases;
CREATE TRIGGER trg_return_case_number
  BEFORE INSERT ON public.erp_return_cases
  FOR EACH ROW EXECUTE FUNCTION public.assign_return_case_number();

DROP TRIGGER IF EXISTS trg_exchange_case_number ON public.erp_exchange_cases;
CREATE TRIGGER trg_exchange_case_number
  BEFORE INSERT ON public.erp_exchange_cases
  FOR EACH ROW EXECUTE FUNCTION public.assign_exchange_case_number();

DROP TRIGGER IF EXISTS trg_log_return_timeline ON public.erp_return_cases;
CREATE TRIGGER trg_log_return_timeline
  AFTER INSERT OR UPDATE ON public.erp_return_cases
  FOR EACH ROW EXECUTE FUNCTION public.log_return_timeline();

DROP TRIGGER IF EXISTS trg_log_exchange_timeline ON public.erp_exchange_cases;
CREATE TRIGGER trg_log_exchange_timeline
  AFTER INSERT OR UPDATE ON public.erp_exchange_cases
  FOR EACH ROW EXECUTE FUNCTION public.log_exchange_timeline();
