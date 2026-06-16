-- =========================================================================
-- IMPORTS & PROCUREMENT MODULE — Phase 1: Schema foundation
-- =========================================================================

-- 1. WAREHOUSES (brand-scoped, default per brand)
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  address text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
CREATE UNIQUE INDEX warehouses_one_default_per_brand
  ON public.warehouses (brand_id) WHERE is_default = true;
CREATE INDEX warehouses_brand_idx ON public.warehouses(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view warehouses" ON public.warehouses FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
  OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'customer_service'::public.app_role)
);
CREATE POLICY "Admin manage warehouses" ON public.warehouses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a default warehouse for every existing brand
INSERT INTO public.warehouses (brand_id, name, code, is_default)
SELECT id, 'Main Warehouse', 'MAIN', true FROM public.brands
ON CONFLICT (brand_id, name) DO NOTHING;

-- Auto-create default warehouse for any new brand
CREATE OR REPLACE FUNCTION public.brand_create_default_warehouse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.warehouses (brand_id, name, code, is_default)
  VALUES (NEW.id, 'Main Warehouse', 'MAIN', true)
  ON CONFLICT (brand_id, name) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS brand_default_warehouse_trg ON public.brands;
CREATE TRIGGER brand_default_warehouse_trg AFTER INSERT ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.brand_create_default_warehouse();

-- 2. EXTEND erp_suppliers
ALTER TABLE public.erp_suppliers
  ADD COLUMN IF NOT EXISTS source_link text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'BD',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BDT',
  ADD COLUMN IF NOT EXISTS payment_terms_days int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit_bdt numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_type text NOT NULL DEFAULT 'both'
    CHECK (supplier_type IN ('local','import','both'));

-- 3. EXTEND stock_movements (backward-compatible nullable cols + unique idempotency)
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id),
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS unit_cost_bdt numeric(18,4),
  ADD COLUMN IF NOT EXISTS total_cost_bdt numeric(18,4),
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idem_uq
  ON public.stock_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_ref_idx
  ON public.stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS stock_movements_variant_idx
  ON public.stock_movements(variant_id);

-- 4. ENUMS for imports
CREATE TYPE public.imp_po_status AS ENUM
  ('ordered','at_china_warehouse','in_transit','arrived_bd',
   'partially_received','completed','cancelled');
CREATE TYPE public.imp_carton_status AS ENUM
  ('ordered','at_china_warehouse','in_transit','arrived_bd',
   'released','in_stock','cancelled');
CREATE TYPE public.imp_payment_type AS ENUM
  ('supplier_advance','supplier_payment','shipping','carton_release',
   'supplier_balance','local_courier','adjustment');

-- 5. CARGO AGENTS
CREATE TABLE public.imp_cargo_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  default_shipping_rate_per_kg_bdt numeric(18,4) NOT NULL DEFAULT 0,
  default_currency text NOT NULL DEFAULT 'CNY',
  default_fx_rate numeric(18,6) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
CREATE INDEX imp_cargo_agents_brand_idx ON public.imp_cargo_agents(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_cargo_agents TO authenticated;
GRANT ALL ON public.imp_cargo_agents TO service_role;
ALTER TABLE public.imp_cargo_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view cargo agents" ON public.imp_cargo_agents FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
  OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
  OR public.has_role(auth.uid(),'customer_service'::public.app_role)
);
CREATE POLICY "Admin/ops manage cargo agents" ON public.imp_cargo_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role));
CREATE TRIGGER imp_cargo_agents_updated_at BEFORE UPDATE ON public.imp_cargo_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. PO NUMBER SEQUENCE (per brand)
CREATE TABLE public.imp_po_sequences (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  last_number int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.imp_po_sequences TO authenticated;
GRANT ALL ON public.imp_po_sequences TO service_role;
ALTER TABLE public.imp_po_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read po seq" ON public.imp_po_sequences FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.imp_next_po_number(_brand uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next int;
  v_code text;
BEGIN
  INSERT INTO public.imp_po_sequences (brand_id, last_number)
  VALUES (_brand, 1)
  ON CONFLICT (brand_id) DO UPDATE
    SET last_number = imp_po_sequences.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_next;

  SELECT 'PO-' || COALESCE(NULLIF(UPPER(SUBSTRING(b.slug FROM 1 FOR 4)), ''), 'BRND')
         || '-' || to_char(now(), 'YYMM')
         || '-' || lpad(v_next::text, 5, '0')
  INTO v_code
  FROM public.brands b WHERE b.id = _brand;

  RETURN COALESCE(v_code, 'PO-' || lpad(v_next::text, 6, '0'));
END $$;

-- 7. PURCHASE ORDERS
CREATE TABLE public.imp_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  cargo_agent_id uuid REFERENCES public.imp_cargo_agents(id),
  supplier_id uuid NOT NULL REFERENCES public.erp_suppliers(id) ON DELETE RESTRICT,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL DEFAULT 'CNY',
  fx_rate numeric(18,6) NOT NULL DEFAULT 0,
  product_subtotal_bdt numeric(18,4) NOT NULL DEFAULT 0,
  shipping_total_bdt numeric(18,4) NOT NULL DEFAULT 0,
  local_courier_total_bdt numeric(18,4) NOT NULL DEFAULT 0,
  grand_total_bdt numeric(18,4) NOT NULL DEFAULT 0,
  paid_bdt numeric(18,4) NOT NULL DEFAULT 0,
  due_bdt numeric(18,4) NOT NULL DEFAULT 0,
  status public.imp_po_status NOT NULL DEFAULT 'ordered',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imp_po_brand_idx ON public.imp_purchase_orders(brand_id);
CREATE INDEX imp_po_supplier_idx ON public.imp_purchase_orders(supplier_id);
CREATE INDEX imp_po_agent_idx ON public.imp_purchase_orders(cargo_agent_id);
CREATE INDEX imp_po_status_idx ON public.imp_purchase_orders(status);
CREATE INDEX imp_po_order_date_idx ON public.imp_purchase_orders(order_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_purchase_orders TO authenticated;
GRANT ALL ON public.imp_purchase_orders TO service_role;
ALTER TABLE public.imp_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view POs" ON public.imp_purchase_orders FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
  OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
  OR public.has_role(auth.uid(),'customer_service'::public.app_role)
);
CREATE POLICY "Admin/ops manage POs" ON public.imp_purchase_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role)
      OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role)
      OR public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE TRIGGER imp_po_updated_at BEFORE UPDATE ON public.imp_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. PO ITEMS
CREATE TABLE public.imp_po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.imp_purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  sku_snapshot text,
  name_snapshot text NOT NULL,
  image_snapshot text,
  quantity int NOT NULL CHECK (quantity > 0),
  unit_cost_foreign numeric(18,4) NOT NULL DEFAULT 0,
  unit_cost_bdt numeric(18,4) NOT NULL DEFAULT 0,
  subtotal_bdt numeric(18,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imp_po_items_po_idx ON public.imp_po_items(po_id);
CREATE INDEX imp_po_items_variant_idx ON public.imp_po_items(variant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_po_items TO authenticated;
GRANT ALL ON public.imp_po_items TO service_role;
ALTER TABLE public.imp_po_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view PO items" ON public.imp_po_items FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
  OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
);
CREATE POLICY "Admin/ops manage PO items" ON public.imp_po_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role));

-- 9. CARTONS
CREATE TABLE public.imp_cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.imp_purchase_orders(id) ON DELETE CASCADE,
  carton_number int NOT NULL,
  barcode text NOT NULL UNIQUE,
  expected_quantity int NOT NULL DEFAULT 0 CHECK (expected_quantity >= 0),
  supplier_cost_bdt numeric(18,4) NOT NULL DEFAULT 0,
  shipping_charge_bdt numeric(18,4) NOT NULL DEFAULT 0,
  local_courier_bdt numeric(18,4) NOT NULL DEFAULT 0,
  total_landed_bdt numeric(18,4) NOT NULL DEFAULT 0,
  weight_kg numeric(12,4),
  status public.imp_carton_status NOT NULL DEFAULT 'ordered',
  warehouse_id uuid REFERENCES public.warehouses(id),
  received_at timestamptz,
  released_at timestamptz,
  qc_at timestamptz,
  posted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (po_id, carton_number)
);
CREATE INDEX imp_cartons_po_idx ON public.imp_cartons(po_id);
CREATE INDEX imp_cartons_status_idx ON public.imp_cartons(status);
CREATE INDEX imp_cartons_warehouse_idx ON public.imp_cartons(warehouse_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_cartons TO authenticated;
GRANT ALL ON public.imp_cartons TO service_role;
ALTER TABLE public.imp_cartons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view cartons" ON public.imp_cartons FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
  OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
);
CREATE POLICY "Ops manage cartons" ON public.imp_cartons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role)
      OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role)
      OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role));
CREATE TRIGGER imp_cartons_updated_at BEFORE UPDATE ON public.imp_cartons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. CARTON ITEMS
CREATE TABLE public.imp_carton_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id uuid NOT NULL REFERENCES public.imp_cartons(id) ON DELETE CASCADE,
  po_item_id uuid NOT NULL REFERENCES public.imp_po_items(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  variant_id uuid REFERENCES public.product_variants(id),
  sku_snapshot text,
  quantity_expected int NOT NULL CHECK (quantity_expected >= 0),
  quantity_ok int NOT NULL DEFAULT 0 CHECK (quantity_ok >= 0),
  quantity_damaged int NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
  quantity_missing int NOT NULL DEFAULT 0 CHECK (quantity_missing >= 0),
  supplier_cost_portion_bdt numeric(18,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imp_carton_items_carton_idx ON public.imp_carton_items(carton_id);
CREATE INDEX imp_carton_items_po_item_idx ON public.imp_carton_items(po_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_carton_items TO authenticated;
GRANT ALL ON public.imp_carton_items TO service_role;
ALTER TABLE public.imp_carton_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view carton items" ON public.imp_carton_items FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
  OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
);
CREATE POLICY "Ops manage carton items" ON public.imp_carton_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role)
      OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role)
      OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role));

-- 11. PAYMENTS
CREATE TABLE public.imp_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES public.imp_purchase_orders(id) ON DELETE RESTRICT,
  carton_id uuid REFERENCES public.imp_cartons(id),
  payment_type public.imp_payment_type NOT NULL,
  amount_bdt numeric(18,4) NOT NULL CHECK (amount_bdt > 0),
  wallet_id uuid NOT NULL REFERENCES public.erp_accounts(id),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  idempotency_key text NOT NULL UNIQUE,
  is_reversed boolean NOT NULL DEFAULT false,
  reversed_at timestamptz,
  reverses_id uuid REFERENCES public.imp_payments(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imp_payments_po_idx ON public.imp_payments(po_id);
CREATE INDEX imp_payments_brand_idx ON public.imp_payments(brand_id);
CREATE INDEX imp_payments_wallet_idx ON public.imp_payments(wallet_id);
CREATE INDEX imp_payments_carton_idx ON public.imp_payments(carton_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_payments TO authenticated;
GRANT ALL ON public.imp_payments TO service_role;
ALTER TABLE public.imp_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view payments" ON public.imp_payments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
);
CREATE POLICY "Admin/accountant manage payments" ON public.imp_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'accountant'::public.app_role));

-- 12. STATUS HISTORY
CREATE TABLE public.imp_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  previous_status text,
  new_status text,
  action text,
  before_data jsonb,
  after_data jsonb,
  notes text,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX imp_status_history_entity_idx ON public.imp_status_history(entity_type, entity_id);
CREATE INDEX imp_status_history_brand_idx ON public.imp_status_history(brand_id);

GRANT SELECT, INSERT ON public.imp_status_history TO authenticated;
GRANT ALL ON public.imp_status_history TO service_role;
ALTER TABLE public.imp_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view history" ON public.imp_status_history FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'accountant'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
  OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
);

-- 13. CHART OF ACCOUNTS RESOLVER (idempotent get-or-create per brand)
CREATE OR REPLACE FUNCTION public.imp_get_or_create_account(
  _brand uuid,
  _code text,
  _name text,
  _type text,
  _normal text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.erp_chart_accounts
    WHERE brand_id = _brand AND code = _code LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.erp_chart_accounts (brand_id, code, name, account_type, normal_balance, currency, is_active)
  VALUES (_brand, _code, _name, _type, _normal, 'BDT', true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Seed the import CoA codes for every existing brand
DO $seed$
DECLARE b RECORD;
BEGIN
  FOR b IN SELECT id FROM public.brands LOOP
    PERFORM public.imp_get_or_create_account(b.id, '1200-INV',     'Inventory Asset',          'asset',     'debit');
    PERFORM public.imp_get_or_create_account(b.id, '1310-IMP-CLR', 'Import Clearing',          'asset',     'debit');
    PERFORM public.imp_get_or_create_account(b.id, '1320-SUP-ADV', 'Supplier Advance',         'asset',     'debit');
    PERFORM public.imp_get_or_create_account(b.id, '2100-SUP-AP',  'Supplier Payable',         'liability', 'credit');
    PERFORM public.imp_get_or_create_account(b.id, '5200-IMP-FRT', 'Import Freight (CN→BD)',   'expense',   'debit');
    PERFORM public.imp_get_or_create_account(b.id, '5210-IMP-LOC', 'Local Courier (Imports)',  'expense',   'debit');
    PERFORM public.imp_get_or_create_account(b.id, '5900-IMP-LOSS','Import Loss (QC)',         'expense',   'debit');
  END LOOP;
END $seed$;