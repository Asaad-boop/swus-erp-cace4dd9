
-- Allow staff to view stock movements
DROP POLICY IF EXISTS "Staff view stock movements" ON public.stock_movements;
CREATE POLICY "Staff view stock movements" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
    OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  );

-- Allow operations staff to also insert stock movements
DROP POLICY IF EXISTS "Staff insert stock movements" ON public.stock_movements;
CREATE POLICY "Staff insert stock movements" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'operations'::public.app_role)
    )
  );

-- Atomic stock adjustment helper
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  _product_id uuid,
  _delta integer,
  _reason text,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _before integer;
  _after integer;
  _brand uuid;
BEGIN
  IF NOT (
    public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to adjust stock';
  END IF;

  IF _delta = 0 THEN
    RAISE EXCEPTION 'Delta cannot be zero';
  END IF;

  SELECT stock, brand_id INTO _before, _brand
  FROM public.products
  WHERE id = _product_id
  FOR UPDATE;

  IF _before IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  _after := GREATEST(_before + _delta, 0);

  UPDATE public.products
  SET stock = _after, updated_at = now()
  WHERE id = _product_id;

  INSERT INTO public.stock_movements
    (product_id, user_id, delta, stock_before, stock_after, reason, note, brand_id)
  VALUES
    (_product_id, _user, _delta, _before, _after, _reason, _note, _brand);

  RETURN jsonb_build_object(
    'product_id', _product_id,
    'stock_before', _before,
    'stock_after', _after,
    'delta', _delta
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer, text, text) TO authenticated;

-- Record supplier payment + ledger entry
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  _supplier_id uuid,
  _amount numeric,
  _account_id uuid,
  _payment_date date,
  _reference_no text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _brand uuid;
  _txn_id uuid;
  _payment_id uuid;
BEGIN
  IF NOT public.has_role(_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT brand_id INTO _brand FROM public.erp_suppliers WHERE id = _supplier_id;
  IF _brand IS NULL THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;

  INSERT INTO public.erp_transactions
    (brand_id, txn_type, category, amount, account_id, reference_type, reference_id, description, created_by, transaction_date)
  VALUES
    (_brand, 'expense', 'supplier_payment', _amount, _account_id, 'supplier', _supplier_id,
     COALESCE(_notes, 'Supplier payment'), _user, _payment_date)
  RETURNING id INTO _txn_id;

  INSERT INTO public.erp_supplier_payments
    (brand_id, supplier_id, account_id, amount, payment_date, reference_no, notes, transaction_id, created_by)
  VALUES
    (_brand, _supplier_id, _account_id, _amount, _payment_date, _reference_no, _notes, _txn_id, _user)
  RETURNING id INTO _payment_id;

  UPDATE public.erp_suppliers
  SET current_due = GREATEST(current_due - _amount, 0), updated_at = now()
  WHERE id = _supplier_id;

  RETURN _payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, uuid, date, text, text) TO authenticated;
