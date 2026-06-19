-- Phase 0: Import Landed Cost Simplified — additive only

ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS shipping_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS shipping_rate_per_kg numeric,
  ADD COLUMN IF NOT EXISTS shipping_cost_bdt numeric;

ALTER TABLE public.imp_cartons
  ADD COLUMN IF NOT EXISTS cost_share_bdt numeric;

ALTER TABLE public.imp_carton_items
  ADD COLUMN IF NOT EXISTS received_qty integer,
  ADD COLUMN IF NOT EXISTS damaged_qty integer NOT NULL DEFAULT 0;

-- usable_qty generated col (only add if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='imp_carton_items' AND column_name='usable_qty'
  ) THEN
    EXECUTE 'ALTER TABLE public.imp_carton_items
      ADD COLUMN usable_qty integer GENERATED ALWAYS AS (COALESCE(received_qty,0) - COALESCE(damaged_qty,0)) STORED';
  END IF;
END $$;