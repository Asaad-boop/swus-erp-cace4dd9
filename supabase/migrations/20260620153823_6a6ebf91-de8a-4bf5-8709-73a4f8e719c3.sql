-- 1. Add reconciliation_status column to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS reconciliation_status text DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_recon_status 
ON public.orders(reconciliation_status, delivered_at);

-- Backfill: already-delivered + paid orders -> reconciled
UPDATE public.orders
SET reconciliation_status = 'reconciled'
WHERE status IN ('delivered','partial_delivered','completed','paid')
  AND payment_status = 'paid'
  AND (reconciliation_status IS NULL OR reconciliation_status = 'pending');

-- Backfill: returned orders -> reconciled (no COD to collect)
UPDATE public.orders
SET reconciliation_status = 'reconciled'
WHERE status IN ('returned','paid_return','unpaid_return','cancelled','fake')
  AND (reconciliation_status IS NULL OR reconciliation_status = 'pending');

-- 2. Trigger: auto-set pending when order becomes delivered
CREATE OR REPLACE FUNCTION public.set_reconciliation_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('delivered','partial_delivered')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('delivered','partial_delivered'))
     AND (NEW.reconciliation_status IS NULL OR NEW.reconciliation_status = 'pending') THEN
    NEW.reconciliation_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconciliation_pending ON public.orders;
CREATE TRIGGER trg_reconciliation_pending
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_reconciliation_pending();

-- 3. erp_reconciliation_rows: add type/return_fee/partial_amount
ALTER TABLE public.erp_reconciliation_rows
  ADD COLUMN IF NOT EXISTS match_type text DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS return_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_amount numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_recon_rows_match_type 
ON public.erp_reconciliation_rows(match_type);