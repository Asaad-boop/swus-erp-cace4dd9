
-- Phase 5: Finance dashboard RPC
CREATE OR REPLACE FUNCTION public.get_finance_dashboard(_brand_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user uuid := auth.uid();
  _today date := CURRENT_DATE;
  _today_sales numeric := 0;
  _today_orders int := 0;
  _range_sales numeric := 0;
  _range_orders int := 0;
  _cash numeric := 0;
  _bank numeric := 0;
  _mfs numeric := 0;
  _courier_cod numeric := 0;
  _ap_due numeric := 0;
  _ar_due numeric := 0;
  _expense numeric := 0;
  _other_income numeric := 0;
  _cogs numeric := 0;
  _refund_loss numeric := 0;
  _monthly jsonb;
  _expense_by jsonb;
  _accounts jsonb;
  _recent jsonb;
BEGIN
  IF NOT (
    public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
    OR public.has_role(_user, 'customer_service'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Today sales (delivered + confirmed)
  SELECT COALESCE(SUM(total),0), COUNT(*) INTO _today_sales, _today_orders
  FROM public.orders
  WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    AND status IN ('delivered'::order_status, 'partial_delivered'::order_status, 'confirmed'::order_status, 'paid'::order_status)
    AND created_at::date = _today;

  -- Range sales
  SELECT COALESCE(SUM(total),0), COUNT(*) INTO _range_sales, _range_orders
  FROM public.orders
  WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    AND status IN ('delivered'::order_status, 'partial_delivered'::order_status, 'paid'::order_status)
    AND created_at::date BETWEEN _from AND _to;

  -- Account balances grouped by type
  SELECT
    COALESCE(SUM(CASE WHEN account_type = 'cash' THEN current_balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN account_type = 'bank' THEN current_balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN account_type = 'mfs' THEN current_balance ELSE 0 END), 0)
  INTO _cash, _bank, _mfs
  FROM public.erp_accounts
  WHERE (_brand_id IS NULL OR brand_id = _brand_id) AND is_active = true;

  -- Courier COD receivable (shipped but not delivered to bank)
  SELECT COALESCE(SUM(o.total), 0) INTO _courier_cod
  FROM public.orders o
  JOIN public.courier_shipments cs ON cs.order_id = o.id
  WHERE (_brand_id IS NULL OR o.brand_id = _brand_id)
    AND o.status IN ('shipped'::order_status, 'delivered'::order_status, 'partial_delivered'::order_status)
    AND COALESCE(o.payment_method, 'cod') ILIKE '%cod%';

  -- AP outstanding
  SELECT COALESCE(SUM(amount - COALESCE(paid_amount,0)), 0) INTO _ap_due
  FROM public.erp_bills
  WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    AND status IN ('open','partial','overdue');

  -- AR outstanding (open invoices via journal AR account) - simple: sum of unpaid orders confirmed but not paid/delivered to cash
  _ar_due := _courier_cod;

  -- Expense / other income
  SELECT
    COALESCE(SUM(CASE WHEN txn_type = 'expense' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN txn_type = 'income' THEN amount ELSE 0 END), 0)
  INTO _expense, _other_income
  FROM public.erp_transactions
  WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    AND transaction_date BETWEEN _from AND _to;

  -- Refund / damage loss (orders refunded/returned in range)
  SELECT COALESCE(SUM(total), 0) INTO _refund_loss
  FROM public.orders
  WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    AND status IN ('returned'::order_status, 'refunded'::order_status)
    AND created_at::date BETWEEN _from AND _to;

  -- Expense by category
  SELECT COALESCE(jsonb_object_agg(name, total), '{}'::jsonb) INTO _expense_by
  FROM (
    SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount) AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE (_brand_id IS NULL OR t.brand_id = _brand_id)
      AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
    GROUP BY 1
    ORDER BY 2 DESC NULLS LAST
    LIMIT 10
  ) s;

  -- 12-month rolling series
  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'revenue', rev, 'expense', exp) ORDER BY m), '[]'::jsonb) INTO _monthly
  FROM (
    SELECT
      to_char(d, 'YYYY-MM') AS m,
      COALESCE((
        SELECT SUM(total) FROM public.orders o
        WHERE (_brand_id IS NULL OR o.brand_id = _brand_id)
          AND o.status IN ('delivered'::order_status, 'partial_delivered'::order_status, 'paid'::order_status)
          AND date_trunc('month', o.created_at) = date_trunc('month', d)
      ), 0) AS rev,
      COALESCE((
        SELECT SUM(amount) FROM public.erp_transactions t
        WHERE (_brand_id IS NULL OR t.brand_id = _brand_id)
          AND t.txn_type = 'expense'
          AND date_trunc('month', t.transaction_date) = date_trunc('month', d)
      ), 0) AS exp
    FROM generate_series(date_trunc('month', _today) - interval '11 months', date_trunc('month', _today), interval '1 month') d
  ) s;

  -- Accounts list
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'type', account_type, 'balance', current_balance) ORDER BY current_balance DESC), '[]'::jsonb) INTO _accounts
  FROM public.erp_accounts
  WHERE (_brand_id IS NULL OR brand_id = _brand_id) AND is_active = true;

  -- Recent 10 transactions
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'date', t.transaction_date, 'type', t.txn_type, 'amount', t.amount,
    'description', t.description, 'account', a.name, 'category', c.name
  ) ORDER BY t.transaction_date DESC, t.created_at DESC), '[]'::jsonb) INTO _recent
  FROM (
    SELECT * FROM public.erp_transactions
    WHERE (_brand_id IS NULL OR brand_id = _brand_id)
    ORDER BY transaction_date DESC, created_at DESC LIMIT 10
  ) t
  LEFT JOIN public.erp_accounts a ON a.id = t.account_id
  LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id;

  RETURN jsonb_build_object(
    'today_sales', _today_sales,
    'today_orders', _today_orders,
    'range_sales', _range_sales,
    'range_orders', _range_orders,
    'cash', _cash,
    'bank', _bank,
    'mfs', _mfs,
    'courier_cod_receivable', _courier_cod,
    'ar_due', _ar_due,
    'supplier_payable', _ap_due,
    'expense_total', _expense,
    'other_income', _other_income,
    'net_profit', (_range_sales + _other_income - _expense),
    'refund_loss', _refund_loss,
    'expense_by_category', _expense_by,
    'monthly_series', _monthly,
    'accounts', _accounts,
    'recent_transactions', _recent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_dashboard(uuid, date, date) TO authenticated;
