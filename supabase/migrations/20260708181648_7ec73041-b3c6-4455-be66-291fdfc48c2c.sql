
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_collected numeric;

COMMENT ON COLUMN public.orders.courier_fee IS 'Total courier charges (delivery + return fee) actually deducted by courier, populated on reconciliation apply.';
COMMENT ON COLUMN public.orders.net_collected IS 'Net cash received from courier after fees = collected - courier_fee. NULL until reconciled.';
