
-- 1. brands table
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage brands" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.brands (name, slug) VALUES ('Hobby Shop','hobby-shop'), ('Playora','playora');

-- 2. Add brand_id to existing tables (default = Hobby Shop)
DO $$
DECLARE
  hobby_id uuid;
BEGIN
  SELECT id INTO hobby_id FROM public.brands WHERE slug='hobby-shop';

  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
  EXECUTE format('UPDATE public.orders SET brand_id=%L WHERE brand_id IS NULL', hobby_id);
  EXECUTE format('ALTER TABLE public.orders ALTER COLUMN brand_id SET DEFAULT %L::uuid', hobby_id);

  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
  EXECUTE format('UPDATE public.products SET brand_id=%L WHERE brand_id IS NULL', hobby_id);
  EXECUTE format('ALTER TABLE public.products ALTER COLUMN brand_id SET DEFAULT %L::uuid', hobby_id);

  ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
  EXECUTE format('UPDATE public.categories SET brand_id=%L WHERE brand_id IS NULL', hobby_id);
  EXECUTE format('ALTER TABLE public.categories ALTER COLUMN brand_id SET DEFAULT %L::uuid', hobby_id);

  ALTER TABLE public.courier_shipments ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
  EXECUTE format('UPDATE public.courier_shipments SET brand_id=%L WHERE brand_id IS NULL', hobby_id);
  EXECUTE format('ALTER TABLE public.courier_shipments ALTER COLUMN brand_id SET DEFAULT %L::uuid', hobby_id);

  ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
  EXECUTE format('UPDATE public.coupons SET brand_id=%L WHERE brand_id IS NULL', hobby_id);

  ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
  EXECUTE format('UPDATE public.stock_movements SET brand_id=%L WHERE brand_id IS NULL', hobby_id);

  ALTER TABLE public.low_stock_alerts ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
  EXECUTE format('UPDATE public.low_stock_alerts SET brand_id=%L WHERE brand_id IS NULL', hobby_id);
END $$;

CREATE INDEX IF NOT EXISTS orders_brand_id_idx ON public.orders(brand_id);
CREATE INDEX IF NOT EXISTS products_brand_id_idx ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS courier_shipments_brand_id_idx ON public.courier_shipments(brand_id);

-- 3. erp_accounts
CREATE TABLE public.erp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('cash','bank','bkash','nagad','rocket','other')),
  account_number text,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_accounts TO authenticated;
GRANT ALL ON public.erp_accounts TO service_role;
ALTER TABLE public.erp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view accounts" ON public.erp_accounts FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
);
CREATE POLICY "Admin manage accounts" ON public.erp_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER erp_accounts_updated_at BEFORE UPDATE ON public.erp_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. erp_expense_categories
CREATE TABLE public.erp_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_expense_categories TO authenticated;
GRANT ALL ON public.erp_expense_categories TO service_role;
ALTER TABLE public.erp_expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view categories" ON public.erp_expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage categories" ON public.erp_expense_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

INSERT INTO public.erp_expense_categories (name, kind) VALUES
  ('Salary','expense'),('Rent','expense'),('Utility','expense'),
  ('Marketing','expense'),('Meta Ads','expense'),('Courier Charge','expense'),
  ('Packaging','expense'),('Office Supplies','expense'),('Transport','expense'),
  ('Misc Expense','expense'),('Order Revenue','income'),('Other Income','income');

-- 5. erp_suppliers
CREATE TABLE public.erp_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_due numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_suppliers TO authenticated;
GRANT ALL ON public.erp_suppliers TO service_role;
ALTER TABLE public.erp_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view suppliers" ON public.erp_suppliers FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
);
CREATE POLICY "Admin manage suppliers" ON public.erp_suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER erp_suppliers_updated_at BEFORE UPDATE ON public.erp_suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. erp_transactions
CREATE TABLE public.erp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  txn_type text NOT NULL CHECK (txn_type IN ('income','expense','transfer','adjustment')),
  category_id uuid REFERENCES public.erp_expense_categories(id),
  account_id uuid REFERENCES public.erp_accounts(id),
  to_account_id uuid REFERENCES public.erp_accounts(id),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  reference_type text,
  reference_id uuid,
  supplier_id uuid REFERENCES public.erp_suppliers(id),
  description text,
  attachment_url text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_transactions TO authenticated;
GRANT ALL ON public.erp_transactions TO service_role;
ALTER TABLE public.erp_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view transactions" ON public.erp_transactions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
);
CREATE POLICY "Admin manage transactions" ON public.erp_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER erp_transactions_updated_at BEFORE UPDATE ON public.erp_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX erp_transactions_brand_date_idx ON public.erp_transactions(brand_id, transaction_date DESC);
CREATE INDEX erp_transactions_account_idx ON public.erp_transactions(account_id);

-- 7. erp_supplier_payments
CREATE TABLE public.erp_supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.erp_suppliers(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.erp_accounts(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference_no text,
  notes text,
  transaction_id uuid REFERENCES public.erp_transactions(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_supplier_payments TO authenticated;
GRANT ALL ON public.erp_supplier_payments TO service_role;
ALTER TABLE public.erp_supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view supplier payments" ON public.erp_supplier_payments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin'::public.app_role)
  OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  OR public.has_role(auth.uid(),'operations'::public.app_role)
);
CREATE POLICY "Admin manage supplier payments" ON public.erp_supplier_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

-- 8. erp_settings
CREATE TABLE public.erp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  default_courier text,
  invoice_prefix text DEFAULT 'INV',
  invoice_footer text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_settings TO authenticated;
GRANT ALL ON public.erp_settings TO service_role;
ALTER TABLE public.erp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view erp settings" ON public.erp_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage erp settings" ON public.erp_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER erp_settings_updated_at BEFORE UPDATE ON public.erp_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Auto-update account balance on transactions
CREATE OR REPLACE FUNCTION public.update_account_balance_on_txn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.txn_type = 'income' AND NEW.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
    ELSIF NEW.txn_type = 'expense' AND NEW.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
    ELSIF NEW.txn_type = 'transfer' AND NEW.account_id IS NOT NULL AND NEW.to_account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
      UPDATE public.erp_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_account_id;
    ELSIF NEW.txn_type = 'adjustment' AND NEW.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.txn_type = 'income' AND OLD.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.txn_type = 'expense' AND OLD.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
    ELSIF OLD.txn_type = 'transfer' AND OLD.account_id IS NOT NULL AND OLD.to_account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
      UPDATE public.erp_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_account_id;
    ELSIF OLD.txn_type = 'adjustment' AND OLD.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER erp_transactions_balance_trg
AFTER INSERT OR DELETE ON public.erp_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_account_balance_on_txn();
