
-- Rollback snapshot in comments: prior reconcile_courier_settlement lives in migration 20260710183234.
-- To revert: DROP FUNCTION public.apply_settlement_variance_action(uuid,text);
--           and re-run the prior migration to restore the old reconcile function.

CREATE OR REPLACE FUNCTION public.reconcile_courier_settlement(_remittance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Step 2: compute expected (advance-aware) and match_status.
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
           GREATEST(
             CASE
               WHEN o.return_type = 'full_return' THEN 0
               WHEN o.return_type = 'partial_return' THEN GREATEST(o.total - COALESCE(o.partial_amount,0), 0)
               ELSE o.total
             END - COALESCE(o.advance_amount, 0),
             0
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

  -- Step 3: update order columns (net_collected, courier_fee, reconciliation_status).
  -- Also auto-complete on clean match if status is a shipped-in-flight state.
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
         -- Auto-complete on clean match unless already in a terminal COD state.
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

  -- Rollup.
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
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_courier_settlement(uuid) TO authenticated;

-- Staff-picked reason for a needs_review line → updates order status.
CREATE OR REPLACE FUNCTION public.apply_settlement_variance_action(_line_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid uuid;
  v_new_status order_status;
  v_new_pay payment_status;
  v_note text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT matched_order_id INTO v_oid
    FROM erp_courier_settlement_lines
   WHERE id = _line_id;
  IF v_oid IS NULL THEN RAISE EXCEPTION 'line has no matched order'; END IF;

  CASE _action
    WHEN 'partial_delivery' THEN v_new_status := 'partial_delivered'; v_new_pay := 'partial';
    WHEN 'partial_return'   THEN v_new_status := 'partial_return';   v_new_pay := 'partial';
    WHEN 'exchange'         THEN v_new_status := 'exchange';         v_new_pay := 'partial';
    WHEN 'internal_adjust'  THEN v_new_status := 'completed';        v_new_pay := 'paid';
                                v_note := 'Variance adjusted internally';
    ELSE RAISE EXCEPTION 'unknown action: %', _action;
  END CASE;

  UPDATE orders
     SET status = v_new_status,
         payment_status = v_new_pay,
         reconciliation_status = 'resolved'
   WHERE id = v_oid;

  UPDATE erp_courier_settlement_lines
     SET match_status = 'resolved'
   WHERE id = _line_id;

  RETURN jsonb_build_object('order_id', v_oid, 'status', v_new_status, 'note', v_note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_settlement_variance_action(uuid,text) TO authenticated;
