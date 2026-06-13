
CREATE OR REPLACE FUNCTION public.record_courier_expense(_shipment_id uuid, _amount numeric, _account_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _brand uuid;
  _order uuid;
  _provider text;
  _cat_id uuid;
  _txn_id uuid;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role)
          OR public.has_role(_user,'operations'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN NULL; END IF;

  SELECT brand_id, order_id, provider INTO _brand, _order, _provider
  FROM public.courier_shipments WHERE id = _shipment_id;
  IF _brand IS NULL THEN
    SELECT brand_id INTO _brand FROM public.orders WHERE id = _order;
  END IF;
  IF _brand IS NULL THEN RAISE EXCEPTION 'Brand not resolved'; END IF;

  SELECT id INTO _cat_id FROM public.erp_expense_categories
   WHERE brand_id = _brand AND lower(name) = 'courier charges' LIMIT 1;
  IF _cat_id IS NULL THEN
    INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active)
    VALUES (_brand, 'Courier Charges', 'expense', true)
    RETURNING id INTO _cat_id;
  END IF;

  INSERT INTO public.erp_transactions
    (brand_id, txn_type, category_id, amount, account_id, reference_type, reference_id,
     description, created_by, transaction_date)
  VALUES
    (_brand, 'expense', _cat_id, _amount, _account_id, 'courier_shipment', _shipment_id,
     COALESCE(_provider,'Courier') || ' delivery fee', _user, CURRENT_DATE)
  RETURNING id INTO _txn_id;

  RETURN _txn_id;
END;
$$;
