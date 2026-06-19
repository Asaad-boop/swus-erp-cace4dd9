ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS agent_commission_cny numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agent_commission_per_unit_bdt numeric,
  ADD COLUMN IF NOT EXISTS agent_commission_total_bdt numeric;