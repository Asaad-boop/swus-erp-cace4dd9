-- Fix 1 (retry with clearer guard)
BEGIN;

CREATE OR REPLACE FUNCTION public.record_courier_expense(_shipment_id uuid, _amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deprecated 2026-07-24: superseded by record_order_courier_expense.
  RETURN;
END;
$$;

DO $$
DECLARE
  v_ids uuid[];
  v_count int;
  v_sum numeric;
BEGIN
  SELECT array_agg(t.id), COUNT(*), COALESCE(SUM(t.amount),0)
    INTO v_ids, v_count, v_sum
  FROM public.erp_transactions t
  JOIN public.courier_shipments cs ON cs.id = t.reference_id
  WHERE t.reference_type = 'courier_shipment'
    AND EXISTS (
      SELECT 1 FROM public.erp_transactions t2
      WHERE t2.reference_type = 'order_courier' AND t2.reference_id = cs.order_id
    );

  RAISE NOTICE 'Duplicate candidates: count=%, sum=%', v_count, v_sum;

  IF v_count <> 548 THEN
    RAISE EXCEPTION 'Guard failed: expected 548 duplicates, found %', v_count;
  END IF;

  DELETE FROM public.erp_transactions WHERE id = ANY(v_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 548 THEN
    RAISE EXCEPTION 'Delete guard failed: expected 548, deleted %', v_count;
  END IF;

  RAISE NOTICE 'Deleted % duplicate courier_shipment expense rows (sum=%)', v_count, v_sum;
END $$;

COMMIT;