
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
  v_insta_pool numeric := 0;
  v_delivery_base numeric := 0;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Step 1: resolve matched_order_id (all rows, including insta rows carrying a consignment).
  UPDATE erp_courier_settlement_lines l
     SET matched_order_id = o.id
    FROM orders o
   WHERE l.remittance_id = _remittance_id
     AND l.matched_order_id IS NULL
     AND (
       (l.merchant_order_id IS NOT NULL AND o.invoice_no = l.merchant_order_id)
       OR (l.consignment_id IS NOT NULL AND o.tracking_number = l.consignment_id)
     );

  -- Insta fee pool for this remittance (invoice-level charge Pathao attaches to a random consignment).
  -- payout on insta rows is negative → -payout = positive fee amount.
  SELECT COALESCE(SUM(-payout), 0) INTO v_insta_pool
    FROM erp_courier_settlement_lines
   WHERE remittance_id = _remittance_id
     AND invoice_type ILIKE '%insta%';

  -- Base for pro-rata = collected_amount across matched delivery rows only.
  SELECT COALESCE(SUM(collected_amount), 0) INTO v_delivery_base
    FROM erp_courier_settlement_lines
   WHERE remittance_id = _remittance_id
     AND matched_order_id IS NOT NULL
     AND (invoice_type IS NULL OR invoice_type NOT ILIKE '%insta%');

  -- Step 2: compute expected + variance for DELIVERY rows only. Distribute insta pool pro-rata.
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.collected_amount) AS collected_sum,
           SUM(l.payout) AS payout_raw,
           SUM(l.final_fee) AS fee_raw,
           CASE WHEN v_delivery_base > 0
                THEN v_insta_pool * SUM(l.collected_amount) / v_delivery_base
                ELSE 0
           END AS insta_share
      FROM erp_courier_settlement_lines l
     WHERE l.remittance_id = _remittance_id
       AND l.matched_order_id IS NOT NULL
       AND (l.invoice_type IS NULL OR l.invoice_type NOT ILIKE '%insta%')
     GROUP BY l.matched_order_id
  ),
  per_order_adj AS (
    SELECT oid, collected_sum,
           payout_raw - insta_share AS payout_sum,
           fee_raw + insta_share AS fee_sum
      FROM per_order
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
      JOIN per_order_adj p ON p.oid = o.id
  )
  UPDATE erp_courier_settlement_lines l
     SET expected_amount = oe.expected,
         variance = po.collected_sum - oe.expected,
         match_status = CASE
           WHEN oe.brand_id IS DISTINCT FROM l.brand_id THEN 'brand_mismatch'
           WHEN ABS(po.collected_sum - oe.expected) <= v_tolerance THEN 'matched'
           ELSE 'needs_review'
         END
    FROM per_order_adj po
    JOIN order_expected oe ON oe.id = po.oid
   WHERE l.remittance_id = _remittance_id
     AND l.matched_order_id = po.oid
     AND (l.invoice_type IS NULL OR l.invoice_type NOT ILIKE '%insta%');

  -- Mark insta_fee rows as matched (they've been pooled + redistributed) so they don't count as unmatched.
  UPDATE erp_courier_settlement_lines
     SET match_status = 'matched',
         expected_amount = 0,
         variance = 0
   WHERE remittance_id = _remittance_id
     AND invoice_type ILIKE '%insta%';

  -- Step 3: update order columns + auto-complete (uses adjusted payout/fee).
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.payout) AS payout_raw,
           SUM(l.final_fee) AS fee_raw,
           SUM(l.collected_amount) AS collected_sum,
           bool_and(l.match_status = 'matched') AS all_matched,
           bool_or(l.match_status = 'needs_review') AS any_review,
           bool_or(l.match_status = 'brand_mismatch') AS any_brand_mismatch
      FROM erp_courier_settlement_lines l
     WHERE l.remittance_id = _remittance_id
       AND l.matched_order_id IS NOT NULL
       AND (l.invoice_type IS NULL OR l.invoice_type NOT ILIKE '%insta%')
     GROUP BY l.matched_order_id
  ),
  per_order_adj AS (
    SELECT oid, all_matched, any_review, any_brand_mismatch,
           payout_raw - (CASE WHEN v_delivery_base > 0
                              THEN v_insta_pool * collected_sum / v_delivery_base
                              ELSE 0 END) AS payout_sum,
           fee_raw + (CASE WHEN v_delivery_base > 0
                           THEN v_insta_pool * collected_sum / v_delivery_base
                           ELSE 0 END) AS fee_sum
      FROM per_order
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
    FROM per_order_adj po
   WHERE o.id = po.oid;

  GET DIAGNOSTICS v_auto_completed = ROW_COUNT;

  -- Step 4: POST to finance using adjusted numbers.
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.payout) AS payout_raw,
           SUM(l.final_fee) AS fee_raw,
           SUM(l.collected_amount) AS collected_sum,
           bool_and(l.match_status = 'matched') AS all_matched
      FROM erp_courier_settlement_lines l
     WHERE l.remittance_id = _remittance_id
       AND l.matched_order_id IS NOT NULL
       AND (l.invoice_type IS NULL OR l.invoice_type NOT ILIKE '%insta%')
     GROUP BY l.matched_order_id
  ),
  per_order_adj AS (
    SELECT oid, all_matched,
           payout_raw - (CASE WHEN v_delivery_base > 0
                              THEN v_insta_pool * collected_sum / v_delivery_base
                              ELSE 0 END) AS payout_sum,
           fee_raw + (CASE WHEN v_delivery_base > 0
                           THEN v_insta_pool * collected_sum / v_delivery_base
                           ELSE 0 END) AS fee_sum
      FROM per_order
  ),
  targets AS (
    SELECT o.id AS order_id, o.brand_id,
           COALESCE(o.delivered_at::date, CURRENT_DATE) AS txn_date,
           po.payout_sum, po.fee_sum,
           ar.id AS ar_id, cash.id AS cash_id,
           cat.id AS fee_cat_id
      FROM per_order_adj po
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
  , cleared AS (
    DELETE FROM erp_transactions t
     USING targets tg
     WHERE t.reference_type = 'order_settlement' AND t.reference_id = tg.order_id
    RETURNING 1
  )
  , ins_transfer AS (
    INSERT INTO erp_transactions(brand_id, txn_type, account_id, to_account_id, amount, transaction_date,
                                 description, reference_type, reference_id)
    SELECT tg.brand_id, 'transfer', tg.ar_id, tg.cash_id, tg.payout_sum, tg.txn_date,
           'Courier payout received', 'order_settlement', tg.order_id
      FROM targets tg
     WHERE tg.payout_sum > 0
    RETURNING 1
  )
  INSERT INTO erp_transactions(brand_id, txn_type, account_id, category_id, amount, transaction_date,
                               description, reference_type, reference_id)
  SELECT tg.brand_id, 'expense', tg.ar_id, tg.fee_cat_id, tg.fee_sum, tg.txn_date,
         'Courier fee (settlement, incl insta share)', 'order_settlement', tg.order_id
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
    'orders_updated', v_auto_completed,
    'insta_pool', v_insta_pool,
    'insta_base', v_delivery_base
  );
END;
$function$;
