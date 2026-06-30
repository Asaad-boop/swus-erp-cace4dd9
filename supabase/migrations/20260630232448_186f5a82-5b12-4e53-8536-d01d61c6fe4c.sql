CREATE OR REPLACE FUNCTION public._imp_refresh_po_totals(_po uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prod numeric(18,4) := 0;
  v_ship numeric(18,4) := 0;
  v_loc numeric(18,4) := 0;
  v_paid numeric(18,4) := 0;
  v_extras numeric(18,4) := 0;
  v_grand numeric(18,4) := 0;
BEGIN
  SELECT COALESCE(SUM(subtotal_bdt),0) INTO v_prod
  FROM public.imp_po_items
  WHERE po_id = _po;

  SELECT COALESCE(SUM(shipping_charge_bdt),0), COALESCE(SUM(local_courier_bdt),0)
    INTO v_ship, v_loc
  FROM public.imp_cartons
  WHERE po_id = _po AND status <> 'cancelled';

  SELECT COALESCE(SUM(amount_bdt),0) INTO v_paid
  FROM public.imp_payments
  WHERE po_id = _po AND COALESCE(is_reversed, false) = false;

  SELECT
    COALESCE(freight_cost_bdt,0)
    + COALESCE(customs_duty_bdt,0)
    + COALESCE(other_charges_bdt,0)
    + COALESCE(agent_commission_total_bdt,0)
  INTO v_extras
  FROM public.imp_purchase_orders
  WHERE id = _po;

  v_grand := round(v_prod + v_ship + v_loc + COALESCE(v_extras,0), 4);

  UPDATE public.imp_purchase_orders SET
    product_subtotal_bdt = round(v_prod,4),
    shipping_total_bdt   = round(v_ship,4),
    local_courier_total_bdt = round(v_loc,4),
    grand_total_bdt = v_grand,
    paid_bdt = round(v_paid,4),
    due_bdt = GREATEST(round(v_grand - v_paid, 4), 0)
  WHERE id = _po;
END
$function$;

SELECT public._imp_refresh_po_totals(id)
FROM public.imp_purchase_orders;

CREATE OR REPLACE FUNCTION public.update_account_balance_on_txn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
BEGIN
  -- Reverse the old row first for DELETE/UPDATE.
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    r := OLD;
    IF r.txn_type = 'income' AND r.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - r.amount WHERE id = r.account_id;
    ELSIF r.txn_type = 'expense' AND r.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + r.amount WHERE id = r.account_id;
    ELSIF r.txn_type = 'transfer' AND r.account_id IS NOT NULL AND r.to_account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + r.amount WHERE id = r.account_id;
      UPDATE public.erp_accounts SET current_balance = current_balance - r.amount WHERE id = r.to_account_id;
    ELSIF r.txn_type = 'adjustment' AND r.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - r.amount WHERE id = r.account_id;
    END IF;
  END IF;

  -- Apply the new row for INSERT/UPDATE.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    r := NEW;
    IF r.txn_type = 'income' AND r.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + r.amount WHERE id = r.account_id;
    ELSIF r.txn_type = 'expense' AND r.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - r.amount WHERE id = r.account_id;
    ELSIF r.txn_type = 'transfer' AND r.account_id IS NOT NULL AND r.to_account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance - r.amount WHERE id = r.account_id;
      UPDATE public.erp_accounts SET current_balance = current_balance + r.amount WHERE id = r.to_account_id;
    ELSIF r.txn_type = 'adjustment' AND r.account_id IS NOT NULL THEN
      UPDATE public.erp_accounts SET current_balance = current_balance + r.amount WHERE id = r.account_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS erp_transactions_balance_trg ON public.erp_transactions;
CREATE TRIGGER erp_transactions_balance_trg
AFTER INSERT OR UPDATE OR DELETE ON public.erp_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_account_balance_on_txn();