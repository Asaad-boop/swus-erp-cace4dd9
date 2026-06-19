
ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS fx_rate_cny_bdt numeric,
  ADD COLUMN IF NOT EXISTS freight_cost_bdt numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customs_duty_bdt numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges_bdt numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_units integer,
  ADD COLUMN IF NOT EXISTS landed_cost_per_unit_bdt numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS fx_rate_source text;

ALTER TABLE public.imp_po_items
  ADD COLUMN IF NOT EXISTS unit_cost_cny numeric,
  ADD COLUMN IF NOT EXISTS landed_cost_bdt numeric;
