-- Fix double-deduction: erp_transactions trigger already updates erp_accounts balance.
-- Remove manual UPDATE in cargo RPCs.

CREATE OR REPLACE FUNCTION public.cargo_advance_deposit(
  p_brand_id uuid, p_cargo_agent_id uuid, p_payment_account_id uuid, p_amount numeric,
  p_payment_date date, p_reference text, p_note text, p_attachment_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_txn_id uuid; v_ledger_id uuid; v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF NOT public.has_brand_access(p_brand_id, v_uid) THEN RAISE EXCEPTION 'Brand access denied'; END IF;

  INSERT INTO public.erp_transactions(brand_id, txn_type, account_id, amount, reference_type, reference_id, description, transaction_date, created_by)
  VALUES (p_brand_id, 'expense', p_payment_account_id, p_amount, 'cargo_advance', p_cargo_agent_id,
          COALESCE('Cargo advance: ' || p_reference, 'Cargo advance deposit'), COALESCE(p_payment_date, CURRENT_DATE), v_uid)
  RETURNING id INTO v_txn_id;
  -- NOTE: account balance is updated by erp_transactions_balance_trg trigger; do NOT update here.

  INSERT INTO public.imp_cargo_ledger(brand_id, cargo_agent_id, entry_date, entry_type, credit_bdt, ref_type, ref_id, ref_label, payment_account_id, note, attachment_url, created_by)
  VALUES (p_brand_id, p_cargo_agent_id, COALESCE(p_payment_date, CURRENT_DATE), 'advance_deposit', p_amount, 'finance_txn', v_txn_id, p_reference, p_payment_account_id, p_note, p_attachment_url, v_uid)
  RETURNING id INTO v_ledger_id;

  SELECT current_balance INTO v_new_balance FROM public.imp_cargo_balances WHERE cargo_agent_id = p_cargo_agent_id;
  RETURN jsonb_build_object('ledger_id', v_ledger_id, 'transaction_id', v_txn_id, 'new_balance', v_new_balance);
END $function$;


CREATE OR REPLACE FUNCTION public.cargo_bill_create(
  p_brand_id uuid, p_cargo_agent_id uuid, p_bill_number text, p_bill_date date, p_shipment_ref text, p_po_id uuid,
  p_weight_kg numeric, p_shipping_charge numeric, p_customs_charge numeric, p_service_charge numeric,
  p_local_delivery_charge numeric, p_other_charge numeric, p_payment_source text,
  p_amount_from_balance numeric, p_amount_from_account numeric, p_payment_account_id uuid,
  p_note text, p_attachment_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_total numeric;
  v_from_bal numeric := COALESCE(p_amount_from_balance, 0);
  v_from_acc numeric := COALESCE(p_amount_from_account, 0);
  v_payable numeric; v_bill_id uuid; v_txn_id uuid; v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT public.has_brand_access(p_brand_id, v_uid) THEN RAISE EXCEPTION 'Brand access denied'; END IF;

  v_total := COALESCE(p_shipping_charge,0)+COALESCE(p_customs_charge,0)+COALESCE(p_service_charge,0)+COALESCE(p_local_delivery_charge,0)+COALESCE(p_other_charge,0);
  IF v_from_bal + v_from_acc > v_total THEN RAISE EXCEPTION 'Payment exceeds total bill'; END IF;
  v_payable := v_total - v_from_bal - v_from_acc;

  INSERT INTO public.imp_cargo_bills(
    brand_id, cargo_agent_id, bill_number, bill_date, shipment_ref, po_id,
    weight_kg, shipping_charge, customs_charge, service_charge, local_delivery_charge, other_charge,
    total_bdt, payment_source, paid_from_balance_bdt, paid_from_account_bdt, payable_bdt,
    payment_account_id, note, attachment_url, created_by
  ) VALUES (
    p_brand_id, p_cargo_agent_id, p_bill_number, COALESCE(p_bill_date, CURRENT_DATE), p_shipment_ref, p_po_id,
    COALESCE(p_weight_kg,0), COALESCE(p_shipping_charge,0), COALESCE(p_customs_charge,0), COALESCE(p_service_charge,0),
    COALESCE(p_local_delivery_charge,0), COALESCE(p_other_charge,0),
    v_total, p_payment_source, v_from_bal, v_from_acc, v_payable,
    p_payment_account_id, p_note, p_attachment_url, v_uid
  ) RETURNING id INTO v_bill_id;

  IF v_from_bal > 0 THEN
    INSERT INTO public.imp_cargo_ledger(brand_id, cargo_agent_id, entry_date, entry_type, debit_bdt, ref_type, ref_id, ref_label, note, created_by)
    VALUES (p_brand_id, p_cargo_agent_id, COALESCE(p_bill_date, CURRENT_DATE), 'bill_deduction', v_from_bal, 'cargo_bill', v_bill_id, COALESCE(p_bill_number, p_shipment_ref), p_note, v_uid);
  END IF;

  IF v_from_acc > 0 AND p_payment_account_id IS NOT NULL THEN
    INSERT INTO public.erp_transactions(brand_id, txn_type, account_id, amount, reference_type, reference_id, description, transaction_date, created_by)
    VALUES (p_brand_id, 'expense', p_payment_account_id, v_from_acc, 'cargo_bill', v_bill_id,
            COALESCE('Cargo bill: ' || p_bill_number, 'Cargo bill payment'), COALESCE(p_bill_date, CURRENT_DATE), v_uid)
    RETURNING id INTO v_txn_id;
    -- NOTE: account balance updated by trigger; no manual UPDATE.
  END IF;

  SELECT current_balance INTO v_new_balance FROM public.imp_cargo_balances WHERE cargo_agent_id = p_cargo_agent_id;
  RETURN jsonb_build_object('bill_id', v_bill_id, 'total', v_total, 'deducted_from_balance', v_from_bal, 'paid_from_account', v_from_acc, 'payable', v_payable, 'new_balance', v_new_balance);
END $function$;


-- cargo_po_payment: same fix
CREATE OR REPLACE FUNCTION public.cargo_po_payment(
  p_brand_id uuid, p_po_id uuid, p_cargo_agent_id uuid,
  p_amount_from_balance numeric, p_amount_from_account numeric, p_payment_account_id uuid,
  p_payment_date date, p_reference text, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_from_bal numeric := COALESCE(p_amount_from_balance, 0);
  v_from_acc numeric := COALESCE(p_amount_from_account, 0);
  v_total numeric := v_from_bal + v_from_acc;
  v_txn_id uuid; v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT public.has_brand_access(p_brand_id, v_uid) THEN RAISE EXCEPTION 'Brand access denied'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  IF v_from_bal > 0 THEN
    INSERT INTO public.imp_cargo_ledger(brand_id, cargo_agent_id, entry_date, entry_type, debit_bdt, ref_type, ref_id, ref_label, note, created_by)
    VALUES (p_brand_id, p_cargo_agent_id, COALESCE(p_payment_date, CURRENT_DATE), 'po_payment', v_from_bal, 'imp_po', p_po_id, p_reference, p_note, v_uid);
  END IF;

  IF v_from_acc > 0 AND p_payment_account_id IS NOT NULL THEN
    INSERT INTO public.erp_transactions(brand_id, txn_type, account_id, amount, reference_type, reference_id, description, transaction_date, created_by)
    VALUES (p_brand_id, 'expense', p_payment_account_id, v_from_acc, 'imp_po', p_po_id,
            COALESCE('PO payment: ' || p_reference, 'PO payment'), COALESCE(p_payment_date, CURRENT_DATE), v_uid)
    RETURNING id INTO v_txn_id;
    -- NOTE: balance updated by trigger; no manual UPDATE here.
  END IF;

  INSERT INTO public.imp_payments(brand_id, po_id, amount_bdt, payment_type, payment_date, reference, account_id, notes, created_by)
  VALUES (p_brand_id, p_po_id, v_total, 'shipping', COALESCE(p_payment_date, CURRENT_DATE), p_reference,
          CASE WHEN v_from_acc > 0 THEN p_payment_account_id ELSE NULL END, p_note, v_uid);

  SELECT current_balance INTO v_new_balance FROM public.imp_cargo_balances WHERE cargo_agent_id = p_cargo_agent_id;
  RETURN jsonb_build_object('ok', true, 'paid_total', v_total, 'paid_from_balance', v_from_bal, 'paid_from_account', v_from_acc, 'new_balance', v_new_balance);
END $function$;