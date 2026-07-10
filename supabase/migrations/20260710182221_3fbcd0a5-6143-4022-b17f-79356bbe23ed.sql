
-- Courier settlement lines: raw CSV import + reconciliation vs orders
CREATE TABLE IF NOT EXISTS public.erp_courier_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id uuid NOT NULL REFERENCES public.erp_cod_remittances(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  courier text NOT NULL,
  consignment_id text,
  merchant_order_id text,
  invoice_type text,
  created_date date,
  recipient_name text,
  recipient_phone text,
  store_name text,
  collected_amount numeric NOT NULL DEFAULT 0,
  collectable_amount numeric NOT NULL DEFAULT 0,
  cod_fee numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  final_fee numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  additional_charge numeric NOT NULL DEFAULT 0,
  compensation_cost numeric NOT NULL DEFAULT 0,
  promo_discount numeric NOT NULL DEFAULT 0,
  payout numeric NOT NULL DEFAULT 0,
  matched_order_id uuid,
  match_status text NOT NULL DEFAULT 'unmatched',
    -- 'matched' | 'shortfall' | 'overage' | 'unmatched' | 'brand_mismatch' | 'status_inconsistent'
  expected_amount numeric,
  variance numeric,
  notes text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csl_remittance ON public.erp_courier_settlement_lines(remittance_id);
CREATE INDEX IF NOT EXISTS idx_csl_brand ON public.erp_courier_settlement_lines(brand_id);
CREATE INDEX IF NOT EXISTS idx_csl_consignment ON public.erp_courier_settlement_lines(consignment_id);
CREATE INDEX IF NOT EXISTS idx_csl_merchant ON public.erp_courier_settlement_lines(merchant_order_id);
CREATE INDEX IF NOT EXISTS idx_csl_matched_order ON public.erp_courier_settlement_lines(matched_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_courier_settlement_lines TO authenticated;
GRANT ALL ON public.erp_courier_settlement_lines TO service_role;

ALTER TABLE public.erp_courier_settlement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read settlement lines" ON public.erp_courier_settlement_lines
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'customer_service') OR has_role(auth.uid(),'operations'));

CREATE POLICY "staff write settlement lines" ON public.erp_courier_settlement_lines
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service'));

-- Reconciliation RPC: matches each line, groups by order, compares expected vs actual,
-- writes ONLY 3 whitelisted columns on orders (net_collected, courier_fee, reconciliation_status).
CREATE OR REPLACE FUNCTION public.reconcile_courier_settlement(_remittance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_matched int := 0;
  v_shortfall int := 0;
  v_overage int := 0;
  v_unmatched int := 0;
  v_brand_mismatch int := 0;
  v_status_bad int := 0;
  v_total_payout numeric := 0;
  v_total_expected numeric := 0;
  v_total_shortfall numeric := 0;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operations') OR has_role(auth.uid(),'customer_service')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Step 1: resolve matched_order_id for lines that don't have it yet.
  UPDATE erp_courier_settlement_lines l
     SET matched_order_id = o.id
    FROM orders o
   WHERE l.remittance_id = _remittance_id
     AND l.matched_order_id IS NULL
     AND (
       (l.merchant_order_id IS NOT NULL AND o.invoice_no = l.merchant_order_id)
       OR (l.consignment_id IS NOT NULL AND o.tracking_number = l.consignment_id)
     );

  -- Step 2: per-order aggregate → set line-level expected/variance/status.
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.payout) AS payout_sum,
           SUM(l.cod_fee + l.delivery_fee + l.final_fee + l.additional_charge - l.discount - l.promo_discount) AS fee_sum
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
         variance = po.payout_sum - oe.expected,
         match_status = CASE
           WHEN oe.brand_id IS DISTINCT FROM l.brand_id THEN 'brand_mismatch'
           WHEN oe.status NOT IN ('delivered','paid_return','pending_return') THEN 'status_inconsistent'
           WHEN ABS(po.payout_sum - oe.expected) < 1 THEN 'matched'
           WHEN po.payout_sum < oe.expected THEN 'shortfall'
           ELSE 'overage'
         END
    FROM per_order po
    JOIN order_expected oe ON oe.id = po.oid
   WHERE l.remittance_id = _remittance_id
     AND l.matched_order_id = po.oid;

  -- Step 3: update ONLY the 3 whitelisted order columns for matched orders.
  WITH per_order AS (
    SELECT l.matched_order_id AS oid,
           SUM(l.payout) AS payout_sum,
           SUM(l.cod_fee + l.delivery_fee + l.final_fee + l.additional_charge - l.discount - l.promo_discount) AS fee_sum,
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
           WHEN po.any_matched AND NOT po.any_short AND NOT po.any_over THEN 'reconciled'
           WHEN po.any_short THEN 'shortfall'
           WHEN po.any_over THEN 'overage'
           ELSE 'pending'
         END
    FROM per_order po
   WHERE o.id = po.oid;

  -- Rollup counters
  SELECT
    count(*) FILTER (WHERE match_status='matched'),
    count(*) FILTER (WHERE match_status='shortfall'),
    count(*) FILTER (WHERE match_status='overage'),
    count(*) FILTER (WHERE match_status='unmatched' OR matched_order_id IS NULL),
    count(*) FILTER (WHERE match_status='brand_mismatch'),
    count(*) FILTER (WHERE match_status='status_inconsistent'),
    COALESCE(SUM(payout),0),
    COALESCE(SUM(expected_amount),0),
    COALESCE(SUM(CASE WHEN match_status='shortfall' THEN expected_amount - payout ELSE 0 END),0)
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

-- Rollback:
-- DROP FUNCTION IF EXISTS public.reconcile_courier_settlement(uuid);
-- DROP TABLE IF EXISTS public.erp_courier_settlement_lines;
