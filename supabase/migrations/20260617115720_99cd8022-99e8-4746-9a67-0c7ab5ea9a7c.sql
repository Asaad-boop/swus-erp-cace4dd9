ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS shipped_at date,
  ADD COLUMN IF NOT EXISTS total_weight_kg numeric(10,3);

COMMENT ON COLUMN public.imp_purchase_orders.shipped_at IS 'Date goods shipped from China / arrived in BD (set by cargo agent)';
COMMENT ON COLUMN public.imp_purchase_orders.total_weight_kg IS 'Total weight in KG reported by cargo agent on arrival';