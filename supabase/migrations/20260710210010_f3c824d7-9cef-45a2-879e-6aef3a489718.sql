
-- =============================================================
-- Finance Rebuild — Phase 1 : Step A + B + settlement RPC fix
-- =============================================================
-- Reversible reference: original CREATE TABLE defs are in
-- earlier migration files; all tables below are empty (0 rows).

-- ---------- Step A : drop dead tables ----------
DROP TABLE IF EXISTS public.erp_bill_payments        CASCADE;
DROP TABLE IF EXISTS public.erp_ar_payments          CASCADE;
DROP TABLE IF EXISTS public.erp_supplier_payments    CASCADE;
DROP TABLE IF EXISTS public.erp_recurring_runs       CASCADE;
DROP TABLE IF EXISTS public.erp_bills                CASCADE;
DROP TABLE IF EXISTS public.erp_budgets              CASCADE;
DROP TABLE IF EXISTS public.erp_tax_entries          CASCADE;
DROP TABLE IF EXISTS public.erp_recurring_rules      CASCADE;
DROP TABLE IF EXISTS public.erp_reconciliation_runs  CASCADE;
DROP TABLE IF EXISTS public.erp_reconciliation_rows  CASCADE;
DROP TABLE IF EXISTS public.erp_statement_imports    CASCADE;
DROP TABLE IF EXISTS public.erp_statement_lines      CASCADE;
DROP TABLE IF EXISTS public.erp_period_locks         CASCADE;
DROP TABLE IF EXISTS public.erp_return_cases         CASCADE;
DROP TABLE IF EXISTS public.erp_exchange_cases       CASCADE;
DROP TABLE IF EXISTS public.erp_product_expense_allocations CASCADE;

-- ---------- Fix apply_settlement_variance_action ----------
-- Also set return_type / partial_amount so P&L revenue CASE can trigger.
CREATE OR REPLACE FUNCTION public.apply_settlement_variance_action(_line_id uuid, _action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oid uuid;
  v_new_status order_status;
  v_new_pay payment_status;
  v_return_type text;
  v_partial numeric := NULL;
  v_total numeric;
  v_collected numeric;
  v_note text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT matched_order_id, COALESCE(collected_amount, payout, 0)
    INTO v_oid, v_collected
    FROM erp_courier_settlement_lines
   WHERE id = _line_id;
  IF v_oid IS NULL THEN RAISE EXCEPTION 'line has no matched order'; END IF;

  SELECT total INTO v_total FROM orders WHERE id = v_oid;

  CASE _action
    WHEN 'partial_delivery' THEN
      v_new_status := 'partial_delivered'; v_new_pay := 'partial';
      v_return_type := 'partial_return';
      v_partial := GREATEST(COALESCE(v_total,0) - COALESCE(v_collected,0), 0);
    WHEN 'partial_return' THEN
      v_new_status := 'partial_return'; v_new_pay := 'partial';
      v_return_type := 'partial_return';
      v_partial := GREATEST(COALESCE(v_total,0) - COALESCE(v_collected,0), 0);
    WHEN 'exchange' THEN
      v_new_status := 'exchange'; v_new_pay := 'partial';
      v_return_type := 'exchange';
      v_partial := GREATEST(COALESCE(v_total,0) - COALESCE(v_collected,0), 0);
    WHEN 'internal_adjust' THEN
      v_new_status := 'completed'; v_new_pay := 'paid';
      v_note := 'Variance adjusted internally';
    ELSE RAISE EXCEPTION 'unknown action: %', _action;
  END CASE;

  UPDATE orders
     SET status = v_new_status,
         payment_status = v_new_pay,
         reconciliation_status = 'resolved',
         return_type = COALESCE(v_return_type, return_type),
         partial_amount = COALESCE(v_partial, partial_amount)
   WHERE id = v_oid;

  UPDATE erp_courier_settlement_lines
     SET match_status = 'resolved'
   WHERE id = _line_id;

  RETURN jsonb_build_object('order_id', v_oid, 'status', v_new_status, 'note', v_note);
END;
$function$;

-- ---------- Step B : canonical P&L RPC ----------
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

  -- Revenue: return-type adjusted
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

  -- COGS: order_items.quantity * products.cost_price
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

  -- OpEx (excluded_from_pnl skipped)
  SELECT COALESCE(SUM(t.amount), 0) INTO _expense
  FROM public.erp_transactions t
  LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
  WHERE t.brand_id = _brand_id
    AND t.txn_type = 'expense'
    AND t.transaction_date BETWEEN _from AND _to
    AND COALESCE(c.excluded_from_pnl, false) = false;

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

-- Drop deprecated P&L RPC (callers migrated in same push)
DROP FUNCTION IF EXISTS public.get_pl_v2(uuid, date, date);
