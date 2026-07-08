
-- P1: Per-carton payment tracking + pay-carton-due RPC

ALTER TABLE public.imp_cartons
  ADD COLUMN IF NOT EXISTS paid_bdt numeric NOT NULL DEFAULT 0;

-- Recompute paid_bdt for a carton from non-reversed payments
CREATE OR REPLACE FUNCTION public._imp_recompute_carton_paid(_carton uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _carton IS NULL THEN RETURN; END IF;
  UPDATE public.imp_cartons c
  SET paid_bdt = COALESCE((
    SELECT SUM(p.amount_bdt)
    FROM public.imp_payments p
    WHERE p.carton_id = _carton
      AND COALESCE(p.is_reversed, false) = false
      AND p.payment_type IN ('carton_release','supplier_balance','local_courier')
  ), 0)
  WHERE c.id = _carton;
END $$;

CREATE OR REPLACE FUNCTION public._imp_carton_paid_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public._imp_recompute_carton_paid(OLD.carton_id);
    RETURN OLD;
  END IF;
  PERFORM public._imp_recompute_carton_paid(NEW.carton_id);
  IF TG_OP = 'UPDATE' AND NEW.carton_id IS DISTINCT FROM OLD.carton_id THEN
    PERFORM public._imp_recompute_carton_paid(OLD.carton_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_imp_carton_paid ON public.imp_payments;
CREATE TRIGGER trg_imp_carton_paid
AFTER INSERT OR UPDATE OR DELETE ON public.imp_payments
FOR EACH ROW EXECUTE FUNCTION public._imp_carton_paid_trg();

-- Backfill
UPDATE public.imp_cartons c
SET paid_bdt = COALESCE(s.total, 0)
FROM (
  SELECT carton_id, SUM(amount_bdt) AS total
  FROM public.imp_payments
  WHERE carton_id IS NOT NULL
    AND COALESCE(is_reversed,false) = false
    AND payment_type IN ('carton_release','supplier_balance','local_courier')
  GROUP BY carton_id
) s
WHERE s.carton_id = c.id;

-- Pay-carton-due RPC (records supplier_balance payment scoped to the carton)
CREATE OR REPLACE FUNCTION public.imp_pay_carton_due(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_carton uuid := (_payload->>'carton_id')::uuid;
  v_amount numeric := (_payload->>'amount')::numeric;
  v_wallet uuid := (_payload->>'wallet_id')::uuid;
  v_date date := COALESCE((_payload->>'payment_date')::date, CURRENT_DATE);
  v_ref text := _payload->>'reference';
  v_notes text := _payload->>'notes';
  v_idem text := _payload->>'idempotency_key';
  v_po uuid; v_brand uuid; v_status public.imp_carton_status;
  v_dr uuid; v_cr uuid; v_pay uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','accountant','operations') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'amount required'; END IF;
  IF v_wallet IS NULL THEN RAISE EXCEPTION 'wallet required'; END IF;

  SELECT c.po_id, p.brand_id, c.status INTO v_po, v_brand, v_status
  FROM public.imp_cartons c JOIN public.imp_purchase_orders p ON p.id = c.po_id
  WHERE c.id = v_carton FOR UPDATE;
  IF v_po IS NULL THEN RAISE EXCEPTION 'carton not found'; END IF;

  v_dr := public.imp_get_or_create_account(v_brand, '2100-SUP-AP', 'Supplier Payable', 'liability', 'credit');
  v_cr := COALESCE(
    (SELECT id FROM public.erp_chart_accounts WHERE brand_id = v_brand
       AND code = (SELECT account_number FROM public.erp_accounts WHERE id = v_wallet) LIMIT 1),
    public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
  );

  v_pay := public._imp_record_payment(
    v_brand, v_po, v_carton, 'supplier_balance',
    v_amount, v_wallet, v_date, v_ref, v_notes, v_idem,
    v_user, v_dr, v_cr
  );

  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_log(v_brand, 'carton', v_carton, v_status::text, v_status::text,
    'carton_due_payment', 'idem:' || v_idem, v_user, NULL,
    jsonb_build_object('amount', v_amount, 'payment_id', v_pay));

  RETURN jsonb_build_object('payment_id', v_pay);
END $$;

GRANT EXECUTE ON FUNCTION public.imp_pay_carton_due(jsonb) TO authenticated;
