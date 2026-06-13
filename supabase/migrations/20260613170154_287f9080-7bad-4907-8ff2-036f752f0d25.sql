
-- Fix: erp_transactions has category_id (uuid), not category (text)
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
  _cat_id uuid;
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

  -- Find or create a "Supplier Payment" expense category for this brand
  SELECT id INTO _cat_id
  FROM public.erp_expense_categories
  WHERE brand_id = _brand AND lower(name) = 'supplier payment'
  LIMIT 1;
  IF _cat_id IS NULL THEN
    INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active)
    VALUES (_brand, 'Supplier Payment', 'expense', true)
    RETURNING id INTO _cat_id;
  END IF;

  INSERT INTO public.erp_transactions
    (brand_id, txn_type, category_id, amount, account_id, reference_type, reference_id, supplier_id, description, created_by, transaction_date)
  VALUES
    (_brand, 'expense', _cat_id, _amount, _account_id, 'supplier', _supplier_id, _supplier_id,
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

-- Manual account balance adjustment (records an audit transaction)
CREATE OR REPLACE FUNCTION public.adjust_account_balance(
  _account_id uuid,
  _delta numeric,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _brand uuid;
  _txn_id uuid;
BEGIN
  IF NOT public.has_role(_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _delta = 0 THEN
    RAISE EXCEPTION 'Delta cannot be zero';
  END IF;

  SELECT brand_id INTO _brand FROM public.erp_accounts WHERE id = _account_id;
  IF _brand IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  INSERT INTO public.erp_transactions
    (brand_id, txn_type, amount, account_id, description, created_by, transaction_date)
  VALUES
    (_brand, 'adjustment', _delta, _account_id, _reason, _user, CURRENT_DATE)
  RETURNING id INTO _txn_id;

  RETURN _txn_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric, text) TO authenticated;

-- Profit & Loss snapshot for a brand within a date range
CREATE OR REPLACE FUNCTION public.erp_profit_loss(
  _brand_id uuid,
  _from date,
  _to date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _revenue numeric := 0;
  _delivered_count integer := 0;
  _expense numeric := 0;
  _income_other numeric := 0;
  _expense_by jsonb;
BEGIN
  IF NOT (
    public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
    OR public.has_role(_user, 'customer_service'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(SUM(total), 0), COUNT(*) INTO _revenue, _delivered_count
  FROM public.orders
  WHERE brand_id = _brand_id
    AND status IN ('delivered'::public.order_status, 'partial_delivered'::public.order_status)
    AND created_at::date BETWEEN _from AND _to;

  SELECT COALESCE(SUM(amount), 0) INTO _expense
  FROM public.erp_transactions
  WHERE brand_id = _brand_id
    AND txn_type = 'expense'
    AND transaction_date BETWEEN _from AND _to;

  SELECT COALESCE(SUM(amount), 0) INTO _income_other
  FROM public.erp_transactions
  WHERE brand_id = _brand_id
    AND txn_type = 'income'
    AND transaction_date BETWEEN _from AND _to;

  SELECT COALESCE(jsonb_object_agg(name, total), '{}'::jsonb) INTO _expense_by
  FROM (
    SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount) AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = _brand_id
      AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'revenue', _revenue,
    'delivered_orders', _delivered_count,
    'other_income', _income_other,
    'expense_total', _expense,
    'expense_by_category', _expense_by,
    'profit', (_revenue + _income_other - _expense)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.erp_profit_loss(uuid, date, date) TO authenticated;
