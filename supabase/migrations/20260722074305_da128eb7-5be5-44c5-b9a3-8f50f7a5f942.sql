
-- 1) Create per-brand COD Receivable accounts
INSERT INTO public.erp_accounts (brand_id, name, account_type, account_subtype, wallet_type, opening_balance, current_balance, is_active, notes)
SELECT b.id, 'COD Receivable', 'other', 'receivable', 'other', 0, 0, true,
       'Cash pending with courier (auto-created). Cleared by reconcile_courier_settlement.'
FROM public.brands b
WHERE NOT EXISTS (
  SELECT 1 FROM public.erp_accounts a
  WHERE a.brand_id = b.id AND a.name = 'COD Receivable'
);

-- 2) Rewrite delivery-posting trigger: post to COD Receivable, not COD Cash
CREATE OR REPLACE FUNCTION public.fn_post_order_delivery_to_finance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_status text := NEW.status::text;
  v_old_status text := COALESCE(OLD.status::text, '');
  v_total numeric;
  v_shipping numeric;
  v_refund numeric;
  v_net numeric;
  v_wallet uuid;
  v_existing uuid;
BEGIN
  IF v_new_status NOT IN ('delivered','partial_delivered') THEN
    IF v_old_status IN ('delivered','partial_delivered') THEN
      DELETE FROM public.erp_transactions
      WHERE reference_type = 'order_delivery' AND reference_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_new_status = 'partial_delivered' THEN
    v_total := COALESCE(NEW.partial_amount, NEW.total, 0);
  ELSE
    v_total := COALESCE(NEW.total, 0);
  END IF;
  v_shipping := COALESCE(NEW.actual_shipping_cost, NEW.shipping_fee, 0);
  v_refund := COALESCE(NEW.refund_amount, 0);
  v_net := v_total - v_shipping - v_refund;

  IF v_net <= 0 THEN
    DELETE FROM public.erp_transactions
    WHERE reference_type = 'order_delivery' AND reference_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Route delivery income to the brand's COD Receivable (AR) account.
  SELECT id INTO v_wallet
    FROM public.erp_accounts
   WHERE brand_id = NEW.brand_id
     AND name = 'COD Receivable'
     AND is_active = true
   LIMIT 1;

  IF v_wallet IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing
    FROM public.erp_transactions
   WHERE reference_type = 'order_delivery' AND reference_id = NEW.id
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.erp_transactions SET
      amount = v_net,
      account_id = v_wallet,
      transaction_date = COALESCE(NEW.delivered_at::date, CURRENT_DATE),
      description = format('COD receivable (net of courier ৳%s)', v_shipping)
    WHERE id = v_existing;
  ELSE
    INSERT INTO public.erp_transactions(
      brand_id, txn_type, account_id, amount, transaction_date,
      description, reference_type, reference_id
    ) VALUES (
      NEW.brand_id, 'income', v_wallet, v_net,
      COALESCE(NEW.delivered_at::date, CURRENT_DATE),
      format('COD receivable (net of courier ৳%s)', v_shipping),
      'order_delivery', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Extend reconcile_courier_settlement to post settlement transactions
-- Only for cleanly matched orders. Idempotent by reference_type='order_settlement'.
CREATE OR REPLACE FUNCTION public.reconcile_courier_settlement(_remittance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_matched int := 0;
  v_needs_review int := 0;
  v_unmatched int := 0;
  v_brand_mismatch int := 0;
  v_total_payout numeric := 0;
  v_total_expected numeric := 0;
  v_total_variance numeric := 0;
  v_auto_completed int := 0;
  v_tolerance numeric := 5;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Step 1: resolve matched_order_id.
  UPDATE erp_courier_settlement_lines l
     SET matched_order_id = o.id
    FROM orders o
   WHERE l.remittance_id = _remittance_id
     AND l.matched_order_id IS NULL
     AND (
       (l.merchant_order_id IS NOT NULL AND o.invoice_no = l.merchant_order_id)
       OR (l.consignment_id IS NOT NULL AND o.tracking_number = l.consignment_id)
     );

  -- Step 2: compute expected + variance
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.collected_amount) AS collected_sum,
           SUM(l.payout) AS payout_sum,
           SUM(l.final_fee) AS fee_sum
      FROM erp_courier_settlement_lines l
     WHERE l.remittance_id = _remittance_id
       AND l.matched_order_id IS NOT NULL
     GROUP BY l.matched_order_id
  ),
  order_expected AS (
    SELECT o.id, o.brand_id, o.status::text AS status,
           GREATEST(
             CASE
               WHEN o.return_type = 'full_return' THEN 0
               WHEN o.return_type = 'partial_return' THEN GREATEST(o.total - COALESCE(o.partial_amount,0), 0)
               ELSE o.total
             END - COALESCE(o.advance_amount, 0), 0
           ) AS expected
      FROM orders o
      JOIN per_order p ON p.oid = o.id
  )
  UPDATE erp_courier_settlement_lines l
     SET expected_amount = oe.expected,
         variance = po.collected_sum - oe.expected,
         match_status = CASE
           WHEN oe.brand_id IS DISTINCT FROM l.brand_id THEN 'brand_mismatch'
           WHEN ABS(po.collected_sum - oe.expected) <= v_tolerance THEN 'matched'
           ELSE 'needs_review'
         END
    FROM per_order po
    JOIN order_expected oe ON oe.id = po.oid
   WHERE l.remittance_id = _remittance_id
     AND l.matched_order_id = po.oid;

  -- Step 3: update order columns + auto-complete
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.payout) AS payout_sum,
           SUM(l.final_fee) AS fee_sum,
           bool_and(l.match_status = 'matched') AS all_matched,
           bool_or(l.match_status = 'needs_review') AS any_review,
           bool_or(l.match_status = 'brand_mismatch') AS any_brand_mismatch
      FROM erp_courier_settlement_lines l
     WHERE l.remittance_id = _remittance_id
       AND l.matched_order_id IS NOT NULL
     GROUP BY l.matched_order_id
  )
  UPDATE orders o
     SET net_collected = po.payout_sum,
         courier_fee = po.fee_sum,
         reconciliation_status = CASE
           WHEN po.any_brand_mismatch THEN 'brand_mismatch'
           WHEN po.any_review THEN 'needs_review'
           WHEN po.all_matched THEN 'reconciled'
           ELSE 'pending'
         END,
         status = CASE
           WHEN po.all_matched
             AND o.status::text NOT IN ('delivered','partial_delivered','paid_return','completed','cancelled','fake','returned','exchanged')
           THEN 'completed'::order_status
           ELSE o.status
         END,
         payment_status = CASE
           WHEN po.all_matched
             AND o.status::text NOT IN ('delivered','partial_delivered','paid_return','completed','cancelled','fake','returned','exchanged')
           THEN 'paid'::payment_status
           ELSE o.payment_status
         END
    FROM per_order po
   WHERE o.id = po.oid;

  GET DIAGNOSTICS v_auto_completed = ROW_COUNT;

  -- Step 4: POST settlement to finance for cleanly matched orders.
  --   Transfer: COD Receivable -> COD Cash (payout amount)
  --   Expense:  Courier fee against COD Receivable (clears remaining AR = shipping fee)
  -- Idempotent via reference_type='order_settlement', reference_id=order_id.
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.payout) AS payout_sum,
           SUM(l.final_fee) AS fee_sum,
           bool_and(l.match_status = 'matched') AS all_matched
      FROM erp_courier_settlement_lines l
     WHERE l.remittance_id = _remittance_id
       AND l.matched_order_id IS NOT NULL
     GROUP BY l.matched_order_id
  ),
  targets AS (
    SELECT o.id AS order_id, o.brand_id,
           COALESCE(o.delivered_at::date, CURRENT_DATE) AS txn_date,
           po.payout_sum, po.fee_sum,
           ar.id AS ar_id, cash.id AS cash_id,
           cat.id AS fee_cat_id
      FROM per_order po
      JOIN orders o ON o.id = po.oid
      LEFT JOIN erp_accounts ar ON ar.brand_id = o.brand_id AND ar.name = 'COD Receivable' AND ar.is_active
      LEFT JOIN erp_accounts cash ON cash.brand_id = o.brand_id AND cash.name = 'COD Cash' AND cash.is_active
      LEFT JOIN LATERAL (
        SELECT id FROM erp_expense_categories
         WHERE brand_id = o.brand_id AND (name ILIKE 'Courier Charge%' OR name ILIKE 'Shipping%')
         ORDER BY (name ILIKE 'Courier Charge%') DESC
         LIMIT 1
      ) cat ON true
     WHERE po.all_matched
       AND ar.id IS NOT NULL
       AND cash.id IS NOT NULL
  )
  -- Delete any prior postings for these orders (in case of re-run with different numbers)
  , cleared AS (
    DELETE FROM erp_transactions t
     USING targets tg
     WHERE t.reference_type = 'order_settlement' AND t.reference_id = tg.order_id
    RETURNING 1
  )
  -- Insert transfer (AR -> Cash)
  , ins_transfer AS (
    INSERT INTO erp_transactions(brand_id, txn_type, account_id, to_account_id, amount, transaction_date,
                                 description, reference_type, reference_id)
    SELECT tg.brand_id, 'transfer', tg.ar_id, tg.cash_id, tg.payout_sum, tg.txn_date,
           'Courier payout received', 'order_settlement', tg.order_id
      FROM targets tg
     WHERE tg.payout_sum > 0
    RETURNING 1
  )
  -- Insert fee (expense from AR)
  INSERT INTO erp_transactions(brand_id, txn_type, account_id, category_id, amount, transaction_date,
                               description, reference_type, reference_id)
  SELECT tg.brand_id, 'expense', tg.ar_id, tg.fee_cat_id, tg.fee_sum, tg.txn_date,
         'Courier fee (settlement)', 'order_settlement', tg.order_id
    FROM targets tg
   WHERE tg.fee_sum > 0;

  -- Rollup
  SELECT
    count(*) FILTER (WHERE match_status='matched'),
    count(*) FILTER (WHERE match_status='needs_review'),
    count(*) FILTER (WHERE match_status='unmatched' OR matched_order_id IS NULL),
    count(*) FILTER (WHERE match_status='brand_mismatch'),
    COALESCE(SUM(payout),0),
    COALESCE(SUM(expected_amount),0),
    COALESCE(SUM(variance),0)
  INTO v_matched, v_needs_review, v_unmatched, v_brand_mismatch,
       v_total_payout, v_total_expected, v_total_variance
    FROM erp_courier_settlement_lines
   WHERE remittance_id = _remittance_id;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'needs_review', v_needs_review,
    'unmatched', v_unmatched,
    'brand_mismatch', v_brand_mismatch,
    'total_payout', v_total_payout,
    'total_expected', v_total_expected,
    'total_variance', v_total_variance,
    'orders_updated', v_auto_completed
  );
END;
$function$;

-- 4) BACKFILL: move existing order_delivery income from COD Cash -> COD Receivable
WITH ar_map AS (
  SELECT brand_id, id AS ar_id FROM erp_accounts WHERE name = 'COD Receivable'
)
UPDATE erp_transactions t
   SET account_id = ar_map.ar_id,
       description = 'COD receivable (backfill from COD Cash)'
  FROM ar_map
  JOIN erp_accounts cash ON cash.brand_id = ar_map.brand_id AND cash.name = 'COD Cash'
 WHERE t.reference_type = 'order_delivery'
   AND t.account_id = cash.id
   AND t.brand_id = ar_map.brand_id;

-- 5) BACKFILL: for already-reconciled orders, post settlement transfer + fee
--    (so AR clears and Cash reflects historic payouts)
WITH targets AS (
  SELECT o.id AS order_id, o.brand_id,
         COALESCE(o.delivered_at::date, CURRENT_DATE) AS txn_date,
         COALESCE(o.net_collected, 0) AS payout_sum,
         COALESCE(o.courier_fee, 0) AS fee_sum,
         ar.id AS ar_id, cash.id AS cash_id,
         (SELECT id FROM erp_expense_categories
           WHERE brand_id = o.brand_id AND (name ILIKE 'Courier Charge%' OR name ILIKE 'Shipping%')
           ORDER BY (name ILIKE 'Courier Charge%') DESC LIMIT 1) AS fee_cat_id
    FROM orders o
    JOIN erp_accounts ar ON ar.brand_id = o.brand_id AND ar.name = 'COD Receivable'
    JOIN erp_accounts cash ON cash.brand_id = o.brand_id AND cash.name = 'COD Cash'
   WHERE o.reconciliation_status = 'reconciled'
     AND COALESCE(o.net_collected, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM erp_transactions x
        WHERE x.reference_type = 'order_settlement' AND x.reference_id = o.id
     )
)
INSERT INTO erp_transactions(brand_id, txn_type, account_id, to_account_id, category_id, amount, transaction_date,
                             description, reference_type, reference_id)
SELECT brand_id, 'transfer', ar_id, cash_id, NULL, payout_sum, txn_date,
       'Courier payout received (backfill)', 'order_settlement', order_id
  FROM targets WHERE payout_sum > 0
UNION ALL
SELECT brand_id, 'expense', ar_id, NULL, fee_cat_id, fee_sum, txn_date,
       'Courier fee (settlement, backfill)', 'order_settlement', order_id
  FROM targets WHERE fee_sum > 0;
