CREATE OR REPLACE FUNCTION public.reconcile_courier_settlement(_remittance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched int := 0;
  v_shortfall int := 0;
  v_overage int := 0;
  v_unmatched int := 0;
  v_brand_mismatch int := 0;
  v_status_bad int := 0;
  v_total_payout numeric := 0;
  v_total_expected numeric := 0;
  v_total_shortfall numeric := 0;
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

  -- Step 2: per-order aggregate → line-level expected/variance/status.
  -- variance is now (collected_sum - expected) so real customer-shortfall is captured;
  -- courier fee deductions (payout < collected) are NOT flagged as shortfall.
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
    SELECT o.id,
           o.brand_id,
           o.status::text AS status,
           COALESCE(
             CASE
               WHEN o.return_type = 'full_return' THEN 0
               WHEN o.return_type = 'partial_return' THEN GREATEST(o.total - COALESCE(o.partial_amount,0), 0)
               ELSE o.total
             END, 0) AS expected
      FROM orders o
      JOIN per_order p ON p.oid = o.id
  )
  UPDATE erp_courier_settlement_lines l
     SET expected_amount = oe.expected,
         variance = po.collected_sum - oe.expected,
         match_status = CASE
           WHEN oe.brand_id IS DISTINCT FROM l.brand_id THEN 'brand_mismatch'
           WHEN oe.status NOT IN ('delivered','paid_return','pending_return') THEN 'status_inconsistent'
           WHEN ABS(po.collected_sum - oe.expected) <= v_tolerance THEN 'matched'
           WHEN po.collected_sum < oe.expected - v_tolerance THEN 'shortfall'
           ELSE 'overage'
         END
    FROM per_order po
    JOIN order_expected oe ON oe.id = po.oid
   WHERE l.remittance_id = _remittance_id
     AND l.matched_order_id = po.oid;

  -- Step 3: update ONLY 3 whitelisted order columns.
  -- net_collected = payout (bank credit), courier_fee = final_fee sum.
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.payout) AS payout_sum,
           SUM(l.final_fee) AS fee_sum,
           bool_or(l.match_status = 'matched') AS any_matched,
           bool_or(l.match_status = 'shortfall') AS any_short,
           bool_or(l.match_status = 'overage') AS any_over
      FROM erp_courier_settlement_lines l
     WHERE l.remittance_id = _remittance_id
       AND l.matched_order_id IS NOT NULL
     GROUP BY l.matched_order_id
  )
  UPDATE orders o
     SET net_collected = po.payout_sum,
         courier_fee = po.fee_sum,
         reconciliation_status = CASE
           WHEN po.any_short THEN 'shortfall'
           WHEN po.any_over THEN 'overage'
           WHEN po.any_matched THEN 'reconciled'
           ELSE 'pending'
         END
    FROM per_order po
   WHERE o.id = po.oid;

  -- Rollup.
  SELECT
    count(*) FILTER (WHERE match_status='matched'),
    count(*) FILTER (WHERE match_status='shortfall'),
    count(*) FILTER (WHERE match_status='overage'),
    count(*) FILTER (WHERE match_status='unmatched' OR matched_order_id IS NULL),
    count(*) FILTER (WHERE match_status='brand_mismatch'),
    count(*) FILTER (WHERE match_status='status_inconsistent'),
    COALESCE(SUM(payout),0),
    COALESCE(SUM(expected_amount),0),
    COALESCE(SUM(CASE WHEN match_status='shortfall' THEN expected_amount - collected_amount ELSE 0 END),0)
  INTO v_matched, v_shortfall, v_overage, v_unmatched, v_brand_mismatch, v_status_bad,
       v_total_payout, v_total_expected, v_total_shortfall
    FROM erp_courier_settlement_lines
   WHERE remittance_id = _remittance_id;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'shortfall', v_shortfall,
    'overage', v_overage,
    'unmatched', v_unmatched,
    'brand_mismatch', v_brand_mismatch,
    'status_inconsistent', v_status_bad,
    'total_payout', v_total_payout,
    'total_expected', v_total_expected,
    'total_shortfall', v_total_shortfall
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_courier_settlement(uuid) TO authenticated;
