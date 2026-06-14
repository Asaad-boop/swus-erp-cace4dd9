
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS actual_shipping_cost numeric,
  ADD COLUMN IF NOT EXISTS actual_shipping_source text,
  ADD COLUMN IF NOT EXISTS actual_shipping_recorded_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_order_courier_expense(
  _order_id uuid,
  _amount numeric,
  _account_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _brand uuid;
  _cat_id uuid;
  _txn_id uuid;
BEGIN
  IF _user IS NOT NULL AND NOT (
    public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN NULL; END IF;

  SELECT brand_id INTO _brand FROM public.orders WHERE id = _order_id;
  IF _brand IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  SELECT id INTO _cat_id FROM public.erp_expense_categories
   WHERE brand_id = _brand AND lower(name) = 'courier charges' LIMIT 1;
  IF _cat_id IS NULL THEN
    INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active)
    VALUES (_brand, 'Courier Charges', 'expense', true)
    RETURNING id INTO _cat_id;
  END IF;

  -- Idempotent: one expense entry per order for courier charge
  SELECT id INTO _txn_id FROM public.erp_transactions
   WHERE reference_type = 'order_courier' AND reference_id = _order_id
   LIMIT 1;

  IF _txn_id IS NULL THEN
    INSERT INTO public.erp_transactions
      (brand_id, txn_type, category_id, amount, account_id, reference_type, reference_id,
       description, created_by, transaction_date)
    VALUES
      (_brand, 'expense', _cat_id, _amount, _account_id, 'order_courier', _order_id,
       'Courier delivery fee', _user, CURRENT_DATE)
    RETURNING id INTO _txn_id;
  ELSE
    UPDATE public.erp_transactions
       SET amount = _amount,
           account_id = COALESCE(_account_id, account_id),
           updated_at = now()
     WHERE id = _txn_id;
  END IF;

  RETURN _txn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_order_courier_expense(uuid, numeric, uuid) TO authenticated, service_role;
