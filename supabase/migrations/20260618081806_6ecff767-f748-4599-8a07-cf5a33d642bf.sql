
-- =====================================================================
-- INVENTORY UPGRADE — PHASE 0 (additive only)
-- =====================================================================

-- 1. EXTEND products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reserved_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_point integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weighted_avg_cost numeric NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='available_stock') THEN
    ALTER TABLE public.products ADD COLUMN available_stock integer GENERATED ALWAYS AS (stock - reserved_stock) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='total_cost_value') THEN
    ALTER TABLE public.products ADD COLUMN total_cost_value numeric GENERATED ALWAYS AS (stock * weighted_avg_cost) STORED;
  END IF;
END $$;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_reserved_stock_nonneg;
ALTER TABLE public.products ADD CONSTRAINT products_reserved_stock_nonneg CHECK (reserved_stock >= 0);

-- 2. EXTEND product_variants
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS reserved_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_point integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weighted_avg_cost numeric NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_variants' AND column_name='available_stock') THEN
    ALTER TABLE public.product_variants ADD COLUMN available_stock integer GENERATED ALWAYS AS (stock - reserved_stock) STORED;
  END IF;
END $$;

ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS variants_reserved_stock_nonneg;
ALTER TABLE public.product_variants ADD CONSTRAINT variants_reserved_stock_nonneg CHECK (reserved_stock >= 0);

-- 3. EXTEND stock_movements (unit_cost_bdt/total_cost_bdt already exist; add new fields)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS running_stock integer,
  ADD COLUMN IF NOT EXISTS movement_source text;

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON public.stock_movements(variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_source ON public.stock_movements(movement_source);
CREATE INDEX IF NOT EXISTS idx_stock_movements_brand_created ON public.stock_movements(brand_id, created_at DESC);

-- =====================================================================
-- 4. NEW TABLE: local_purchase_orders
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.local_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.erp_suppliers(id),
  po_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  received_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  shipping_cost numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance_due numeric GENERATED ALWAYS AS (total - amount_paid) STORED,
  bill_id uuid REFERENCES public.erp_bills(id),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_purchase_orders TO authenticated;
GRANT ALL ON public.local_purchase_orders TO service_role;
ALTER TABLE public.local_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_local_po" ON public.local_purchase_orders FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_local_po_brand_status ON public.local_purchase_orders(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_local_po_supplier ON public.local_purchase_orders(supplier_id);

-- 5. local_po_items
CREATE TABLE IF NOT EXISTS public.local_po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.local_purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  description text,
  ordered_qty integer NOT NULL,
  received_qty integer NOT NULL DEFAULT 0,
  pending_qty integer GENERATED ALWAYS AS (ordered_qty - received_qty) STORED,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric GENERATED ALWAYS AS (ordered_qty * unit_cost) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_po_items TO authenticated;
GRANT ALL ON public.local_po_items TO service_role;
ALTER TABLE public.local_po_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_local_po_items" ON public.local_po_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_local_po_items_po ON public.local_po_items(po_id);

-- 6. local_po_receipts
CREATE TABLE IF NOT EXISTS public.local_po_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.local_purchase_orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_po_receipts TO authenticated;
GRANT ALL ON public.local_po_receipts TO service_role;
ALTER TABLE public.local_po_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_local_po_receipts" ON public.local_po_receipts FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 7. local_po_receipt_items
CREATE TABLE IF NOT EXISTS public.local_po_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.local_po_receipts(id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES public.local_po_items(id),
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  received_qty integer NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_po_receipt_items TO authenticated;
GRANT ALL ON public.local_po_receipt_items TO service_role;
ALTER TABLE public.local_po_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_local_po_receipt_items" ON public.local_po_receipt_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 8. stocktake_sessions
CREATE TABLE IF NOT EXISTS public.stocktake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  warehouse_id uuid REFERENCES public.warehouses(id),
  started_by uuid,
  completed_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_products integer DEFAULT 0,
  total_variance_value numeric DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stocktake_sessions TO authenticated;
GRANT ALL ON public.stocktake_sessions TO service_role;
ALTER TABLE public.stocktake_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_stocktake_sessions" ON public.stocktake_sessions FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stocktake_brand_status ON public.stocktake_sessions(brand_id, status);

-- 9. stocktake_items
CREATE TABLE IF NOT EXISTS public.stocktake_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.stocktake_sessions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  system_qty integer NOT NULL DEFAULT 0,
  counted_qty integer,
  variance integer GENERATED ALWAYS AS (COALESCE(counted_qty,0) - system_qty) STORED,
  unit_cost numeric NOT NULL DEFAULT 0,
  variance_value numeric GENERATED ALWAYS AS ((COALESCE(counted_qty,0) - system_qty) * unit_cost) STORED,
  notes text,
  counted_by uuid,
  counted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stocktake_items TO authenticated;
GRANT ALL ON public.stocktake_items TO service_role;
ALTER TABLE public.stocktake_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_stocktake_items" ON public.stocktake_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_session ON public.stocktake_items(session_id);

-- 10. reorder_suggestions
CREATE TABLE IF NOT EXISTS public.reorder_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  current_stock integer NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  suggested_qty integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  actioned_at timestamptz,
  actioned_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reorder_suggestions TO authenticated;
GRANT ALL ON public.reorder_suggestions TO service_role;
ALTER TABLE public.reorder_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_reorder_suggestions" ON public.reorder_suggestions FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_reorder_brand_status ON public.reorder_suggestions(brand_id, status);

-- =====================================================================
-- 11. Updated_at trigger function (reuse or create)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_local_po_updated_at ON public.local_purchase_orders;
CREATE TRIGGER trg_local_po_updated_at BEFORE UPDATE ON public.local_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 12. update_weighted_avg_cost(product_id, variant_id, new_qty, new_unit_cost)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_weighted_avg_cost(
  _product_id uuid,
  _variant_id uuid,
  _new_qty integer,
  _new_unit_cost numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_stock integer := 0;
  cur_wac numeric := 0;
  new_wac numeric := 0;
BEGIN
  IF _new_qty IS NULL OR _new_qty <= 0 THEN RETURN; END IF;

  IF _variant_id IS NOT NULL THEN
    SELECT stock, weighted_avg_cost INTO cur_stock, cur_wac
    FROM public.product_variants WHERE id = _variant_id;
    IF (COALESCE(cur_stock,0) + _new_qty) = 0 THEN
      new_wac := _new_unit_cost;
    ELSE
      new_wac := ((COALESCE(cur_stock,0) * COALESCE(cur_wac,0)) + (_new_qty * COALESCE(_new_unit_cost,0)))
                 / (COALESCE(cur_stock,0) + _new_qty);
    END IF;
    UPDATE public.product_variants SET weighted_avg_cost = new_wac, updated_at = now()
    WHERE id = _variant_id;
  ELSIF _product_id IS NOT NULL THEN
    SELECT stock, weighted_avg_cost INTO cur_stock, cur_wac
    FROM public.products WHERE id = _product_id;
    IF (COALESCE(cur_stock,0) + _new_qty) = 0 THEN
      new_wac := _new_unit_cost;
    ELSE
      new_wac := ((COALESCE(cur_stock,0) * COALESCE(cur_wac,0)) + (_new_qty * COALESCE(_new_unit_cost,0)))
                 / (COALESCE(cur_stock,0) + _new_qty);
    END IF;
    UPDATE public.products SET weighted_avg_cost = new_wac, updated_at = now()
    WHERE id = _product_id;
  END IF;
END $$;

-- =====================================================================
-- 13. reserve_stock(order_id, items jsonb)
-- items: [{product_id, variant_id, qty}, ...]
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reserve_stock(_order_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec jsonb; pid uuid; vid uuid; q integer;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;
  FOR rec IN SELECT * FROM jsonb_array_elements(_items) LOOP
    pid := NULLIF(rec->>'product_id','')::uuid;
    vid := NULLIF(rec->>'variant_id','')::uuid;
    q := COALESCE((rec->>'qty')::integer, 0);
    IF q <= 0 THEN CONTINUE; END IF;
    IF vid IS NOT NULL THEN
      UPDATE public.product_variants SET reserved_stock = reserved_stock + q, updated_at = now() WHERE id = vid;
    ELSIF pid IS NOT NULL THEN
      UPDATE public.products SET reserved_stock = reserved_stock + q, updated_at = now() WHERE id = pid;
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- 14. release_stock_reservation(order_id)
-- Looks up order_items by order_id and decrements reserved_stock (clamped at 0)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.release_stock_reservation(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT product_id, variant_id, COALESCE(quantity,0) AS qty
    FROM public.order_items WHERE order_id = _order_id
  LOOP
    IF r.qty <= 0 THEN CONTINUE; END IF;
    IF r.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET reserved_stock = GREATEST(reserved_stock - r.qty, 0), updated_at = now()
      WHERE id = r.variant_id;
    ELSIF r.product_id IS NOT NULL THEN
      UPDATE public.products SET reserved_stock = GREATEST(reserved_stock - r.qty, 0), updated_at = now()
      WHERE id = r.product_id;
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- 15. check_reorder_triggers(brand_id) and _all_brands variant for cron
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_reorder_triggers(_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted integer := 0;
BEGIN
  -- Products without variants
  WITH ins AS (
    INSERT INTO public.reorder_suggestions (brand_id, product_id, variant_id, current_stock, reorder_point, suggested_qty, status, source)
    SELECT p.brand_id, p.id, NULL, p.available_stock, p.reorder_point,
           GREATEST(p.reorder_qty, p.reorder_point - p.available_stock), 'pending', 'auto'
    FROM public.products p
    WHERE p.brand_id = _brand_id
      AND p.reorder_point > 0
      AND p.available_stock <= p.reorder_point
      AND NOT EXISTS (
        SELECT 1 FROM public.reorder_suggestions s
        WHERE s.product_id = p.id AND s.variant_id IS NULL AND s.status = 'pending'
      )
    RETURNING 1
  ) SELECT COUNT(*) INTO inserted FROM ins;

  -- Variants
  WITH ins2 AS (
    INSERT INTO public.reorder_suggestions (brand_id, product_id, variant_id, current_stock, reorder_point, suggested_qty, status, source)
    SELECT p.brand_id, p.id, v.id, v.available_stock, v.reorder_point,
           GREATEST(p.reorder_qty, v.reorder_point - v.available_stock), 'pending', 'auto'
    FROM public.product_variants v
    JOIN public.products p ON p.id = v.product_id
    WHERE p.brand_id = _brand_id
      AND v.reorder_point > 0
      AND v.available_stock <= v.reorder_point
      AND NOT EXISTS (
        SELECT 1 FROM public.reorder_suggestions s
        WHERE s.variant_id = v.id AND s.status = 'pending'
      )
    RETURNING 1
  ) SELECT inserted + COUNT(*) INTO inserted FROM ins2;

  RETURN inserted;
END $$;

CREATE OR REPLACE FUNCTION public.check_reorder_triggers_all_brands()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b record; total integer := 0;
BEGIN
  FOR b IN SELECT id FROM public.brands WHERE is_active = true LOOP
    total := total + COALESCE(public.check_reorder_triggers(b.id), 0);
  END LOOP;
  RETURN total;
END $$;

-- =====================================================================
-- 16. Schedule reorder check nightly (06:00 UTC)
-- =====================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('reorder-check') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reorder-check');
    PERFORM cron.schedule('reorder-check', '0 6 * * *', $cron$SELECT public.check_reorder_triggers_all_brands();$cron$);
  END IF;
END $$;
