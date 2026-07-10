-- 1. Create Capital Injection category for HobbyShop (excluded from P&L)
INSERT INTO public.erp_expense_categories (brand_id, name, kind, excluded_from_pnl, is_active)
VALUES ('1f1f366d-ad85-4513-85ab-2dbb6b23c513', 'Capital Injection', 'income', true, true)
ON CONFLICT DO NOTHING;

-- 2. Assign the 4 uncategorized income transactions
UPDATE public.erp_transactions
SET category_id = (
  SELECT id FROM public.erp_expense_categories
  WHERE brand_id = '1f1f366d-ad85-4513-85ab-2dbb6b23c513'
    AND name = 'Capital Injection' AND kind = 'income'
  LIMIT 1
)
WHERE id IN (
  '2dd00307-13ba-47db-9619-aafead69f592',
  '43cb944d-b92d-4498-95ca-97862226dbc9',
  'c91700ef-bf1c-4204-bb37-b773dcfcb18a',
  '665421bd-d3c9-44a2-8787-339d65595d26'
);

-- 3. Fix erp_profit_loss: filter excluded_from_pnl on income side too
CREATE OR REPLACE FUNCTION public.erp_profit_loss(_brand_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _revenue numeric := 0;
  _delivered_count integer := 0;
  _cogs numeric := 0;
  _items_missing_cost integer := 0;
  _expense numeric := 0;
  _income_other numeric := 0;
  _expense_by jsonb;
  _delivered_statuses order_status[] := ARRAY[
    'delivered','completed','partial_delivered','partial_return','exchange','paid_return'
  ]::order_status[];
BEGIN
  IF NOT (
    public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
    OR public.has_role(_user, 'customer_service'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN return_type = 'full_return' THEN 0
        WHEN return_type IN ('partial_return','exchange') THEN GREATEST(COALESCE(total,0) - COALESCE(partial_amount,0), 0)
        ELSE COALESCE(total,0)
      END
    ), 0),
    COUNT(*)
  INTO _revenue, _delivered_count
  FROM public.orders
  WHERE brand_id = _brand_id
    AND status = ANY(_delivered_statuses)
    AND COALESCE(delivered_at::date, created_at::date) BETWEEN _from AND _to;

  SELECT
    COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0),
    COALESCE(SUM(CASE WHEN p.cost_price IS NULL OR p.cost_price = 0 THEN 1 ELSE 0 END), 0)
  INTO _cogs, _items_missing_cost
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE o.brand_id = _brand_id
    AND o.status = ANY(_delivered_statuses)
    AND COALESCE(o.delivered_at::date, o.created_at::date) BETWEEN _from AND _to;

  SELECT COALESCE(SUM(t.amount), 0) INTO _expense
  FROM public.erp_transactions t
  LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
  WHERE t.brand_id = _brand_id
    AND t.txn_type = 'expense'
    AND t.transaction_date BETWEEN _from AND _to
    AND COALESCE(c.excluded_from_pnl, false) = false;

  SELECT COALESCE(SUM(t.amount), 0) INTO _income_other
  FROM public.erp_transactions t
  LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
  WHERE t.brand_id = _brand_id
    AND t.txn_type = 'income'
    AND t.transaction_date BETWEEN _from AND _to
    AND COALESCE(c.excluded_from_pnl, false) = false;

  SELECT COALESCE(jsonb_object_agg(name, total), '{}'::jsonb) INTO _expense_by
  FROM (
    SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount) AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = _brand_id
      AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
      AND COALESCE(c.excluded_from_pnl, false) = false
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'revenue', _revenue,
    'delivered_orders', _delivered_count,
    'cogs', _cogs,
    'items_missing_cost_data', _items_missing_cost,
    'gross_profit', (_revenue - _cogs),
    'other_income', _income_other,
    'expense_total', _expense,
    'opex_total', _expense,
    'expense_by_category', _expense_by,
    'profit', (_revenue - _cogs + _income_other - _expense),
    'net_profit', (_revenue - _cogs + _income_other - _expense)
  );
END;
$function$;