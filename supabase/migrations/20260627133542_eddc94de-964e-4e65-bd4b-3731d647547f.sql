
CREATE TABLE public.imp_cargo_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  cargo_agent_id uuid NOT NULL REFERENCES public.imp_cargo_agents(id) ON DELETE RESTRICT,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL CHECK (entry_type IN ('opening','advance_deposit','bill_deduction','po_payment','refund','adjustment')),
  debit_bdt numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit_bdt >= 0),
  credit_bdt numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit_bdt >= 0),
  ref_type text CHECK (ref_type IN ('finance_txn','cargo_bill','imp_po','manual')),
  ref_id uuid,
  ref_label text,
  payment_account_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  note text,
  attachment_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT imp_cargo_ledger_one_side CHECK (
    (debit_bdt > 0 AND credit_bdt = 0) OR (credit_bdt > 0 AND debit_bdt = 0)
  )
);
CREATE INDEX idx_imp_cargo_ledger_agent ON public.imp_cargo_ledger(cargo_agent_id, entry_date, created_at);
CREATE INDEX idx_imp_cargo_ledger_brand ON public.imp_cargo_ledger(brand_id);
CREATE INDEX idx_imp_cargo_ledger_ref ON public.imp_cargo_ledger(ref_type, ref_id);

GRANT SELECT ON public.imp_cargo_ledger TO authenticated;
GRANT ALL ON public.imp_cargo_ledger TO service_role;
ALTER TABLE public.imp_cargo_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read cargo ledger for accessible brands"
  ON public.imp_cargo_ledger FOR SELECT TO authenticated
  USING (public.has_brand_access(brand_id, auth.uid()));

CREATE TABLE public.imp_cargo_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  cargo_agent_id uuid NOT NULL REFERENCES public.imp_cargo_agents(id) ON DELETE RESTRICT,
  bill_number text,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  shipment_ref text,
  po_id uuid REFERENCES public.imp_purchase_orders(id) ON DELETE SET NULL,
  weight_kg numeric(10,2) DEFAULT 0,
  shipping_charge numeric(14,2) NOT NULL DEFAULT 0,
  customs_charge numeric(14,2) NOT NULL DEFAULT 0,
  service_charge numeric(14,2) NOT NULL DEFAULT 0,
  local_delivery_charge numeric(14,2) NOT NULL DEFAULT 0,
  other_charge numeric(14,2) NOT NULL DEFAULT 0,
  total_bdt numeric(14,2) NOT NULL DEFAULT 0,
  payment_source text NOT NULL DEFAULT 'cargo_balance' CHECK (payment_source IN ('cargo_balance','account','partial','unpaid')),
  paid_from_balance_bdt numeric(14,2) NOT NULL DEFAULT 0,
  paid_from_account_bdt numeric(14,2) NOT NULL DEFAULT 0,
  payable_bdt numeric(14,2) NOT NULL DEFAULT 0,
  payment_account_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  note text,
  attachment_url text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_imp_cargo_bills_agent ON public.imp_cargo_bills(cargo_agent_id, bill_date);
CREATE INDEX idx_imp_cargo_bills_brand ON public.imp_cargo_bills(brand_id);
CREATE INDEX idx_imp_cargo_bills_po ON public.imp_cargo_bills(po_id);

GRANT SELECT, UPDATE ON public.imp_cargo_bills TO authenticated;
GRANT ALL ON public.imp_cargo_bills TO service_role;
ALTER TABLE public.imp_cargo_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read cargo bills for accessible brands"
  ON public.imp_cargo_bills FOR SELECT TO authenticated
  USING (public.has_brand_access(brand_id, auth.uid()));
CREATE POLICY "Update cargo bills for accessible brands"
  ON public.imp_cargo_bills FOR UPDATE TO authenticated
  USING (public.has_brand_access(brand_id, auth.uid()))
  WITH CHECK (public.has_brand_access(brand_id, auth.uid()));

CREATE TRIGGER trg_imp_cargo_bills_updated
  BEFORE UPDATE ON public.imp_cargo_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.imp_cargo_balances AS
SELECT
  a.id AS cargo_agent_id,
  a.brand_id,
  COALESCE(SUM(l.credit_bdt), 0) - COALESCE(SUM(l.debit_bdt), 0) AS current_balance,
  COALESCE(SUM(l.credit_bdt) FILTER (WHERE l.entry_type IN ('opening','advance_deposit','refund')), 0) AS total_advance,
  COALESCE(SUM(l.debit_bdt) FILTER (WHERE l.entry_type IN ('bill_deduction','po_payment')), 0) AS total_deducted,
  COALESCE(SUM(l.credit_bdt) FILTER (WHERE l.entry_type = 'adjustment'), 0)
    - COALESCE(SUM(l.debit_bdt) FILTER (WHERE l.entry_type = 'adjustment'), 0) AS adjustment_net,
  COUNT(l.id) AS entry_count,
  MAX(l.created_at) AS last_entry_at
FROM public.imp_cargo_agents a
LEFT JOIN public.imp_cargo_ledger l ON l.cargo_agent_id = a.id
GROUP BY a.id, a.brand_id;

GRANT SELECT ON public.imp_cargo_balances TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cargo_advance_deposit(
  p_brand_id uuid, p_cargo_agent_id uuid, p_payment_account_id uuid,
  p_amount numeric, p_payment_date date, p_reference text, p_note text, p_attachment_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_txn_id uuid; v_ledger_id uuid; v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF NOT public.has_brand_access(p_brand_id, v_uid) THEN RAISE EXCEPTION 'Brand access denied'; END IF;

  INSERT INTO public.erp_transactions(brand_id, txn_type, account_id, amount, reference_type, reference_id, description, transaction_date, created_by)
  VALUES (p_brand_id, 'expense', p_payment_account_id, p_amount, 'cargo_advance', p_cargo_agent_id,
          COALESCE('Cargo advance: ' || p_reference, 'Cargo advance deposit'), COALESCE(p_payment_date, CURRENT_DATE), v_uid)
  RETURNING id INTO v_txn_id;

  UPDATE public.erp_accounts SET current_balance = current_balance - p_amount, updated_at = now()
  WHERE id = p_payment_account_id;

  INSERT INTO public.imp_cargo_ledger(brand_id, cargo_agent_id, entry_date, entry_type, credit_bdt, ref_type, ref_id, ref_label, payment_account_id, note, attachment_url, created_by)
  VALUES (p_brand_id, p_cargo_agent_id, COALESCE(p_payment_date, CURRENT_DATE), 'advance_deposit', p_amount, 'finance_txn', v_txn_id, p_reference, p_payment_account_id, p_note, p_attachment_url, v_uid)
  RETURNING id INTO v_ledger_id;

  SELECT current_balance INTO v_new_balance FROM public.imp_cargo_balances WHERE cargo_agent_id = p_cargo_agent_id;
  RETURN jsonb_build_object('ledger_id', v_ledger_id, 'transaction_id', v_txn_id, 'new_balance', v_new_balance);
END $$;

CREATE OR REPLACE FUNCTION public.cargo_bill_create(
  p_brand_id uuid, p_cargo_agent_id uuid, p_bill_number text, p_bill_date date, p_shipment_ref text, p_po_id uuid,
  p_weight_kg numeric, p_shipping_charge numeric, p_customs_charge numeric, p_service_charge numeric,
  p_local_delivery_charge numeric, p_other_charge numeric,
  p_payment_source text, p_amount_from_balance numeric, p_amount_from_account numeric,
  p_payment_account_id uuid, p_note text, p_attachment_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    UPDATE public.erp_accounts SET current_balance = current_balance - v_from_acc, updated_at = now() WHERE id = p_payment_account_id;
  END IF;

  SELECT current_balance INTO v_new_balance FROM public.imp_cargo_balances WHERE cargo_agent_id = p_cargo_agent_id;
  RETURN jsonb_build_object('bill_id', v_bill_id, 'total', v_total, 'deducted_from_balance', v_from_bal, 'paid_from_account', v_from_acc, 'payable', v_payable, 'new_balance', v_new_balance);
END $$;

CREATE OR REPLACE FUNCTION public.cargo_po_payment(
  p_brand_id uuid, p_po_id uuid, p_cargo_agent_id uuid,
  p_amount_from_balance numeric, p_amount_from_account numeric,
  p_payment_account_id uuid, p_payment_date date, p_reference text, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_from_bal numeric := COALESCE(p_amount_from_balance, 0);
  v_from_acc numeric := COALESCE(p_amount_from_account, 0);
  v_payment_id uuid; v_txn_id uuid; v_new_balance numeric; v_idem text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT public.has_brand_access(p_brand_id, v_uid) THEN RAISE EXCEPTION 'Brand access denied'; END IF;
  IF v_from_bal <= 0 AND v_from_acc <= 0 THEN RAISE EXCEPTION 'No amount provided'; END IF;

  IF v_from_bal > 0 THEN
    INSERT INTO public.imp_cargo_ledger(brand_id, cargo_agent_id, entry_date, entry_type, debit_bdt, ref_type, ref_id, ref_label, note, created_by)
    VALUES (p_brand_id, p_cargo_agent_id, COALESCE(p_payment_date, CURRENT_DATE), 'po_payment', v_from_bal, 'imp_po', p_po_id, p_reference, p_note, v_uid);
  END IF;

  IF v_from_acc > 0 AND p_payment_account_id IS NOT NULL THEN
    INSERT INTO public.erp_transactions(brand_id, txn_type, account_id, amount, reference_type, reference_id, description, transaction_date, created_by)
    VALUES (p_brand_id, 'expense', p_payment_account_id, v_from_acc, 'imp_po', p_po_id,
            COALESCE('PO payment: ' || p_reference, 'Import PO payment'), COALESCE(p_payment_date, CURRENT_DATE), v_uid)
    RETURNING id INTO v_txn_id;
    UPDATE public.erp_accounts SET current_balance = current_balance - v_from_acc, updated_at = now() WHERE id = p_payment_account_id;
  END IF;

  SELECT current_balance INTO v_new_balance FROM public.imp_cargo_balances WHERE cargo_agent_id = p_cargo_agent_id;
  RETURN jsonb_build_object('new_balance', v_new_balance, 'payment_id', v_payment_id, 'transaction_id', v_txn_id);
END $$;

CREATE OR REPLACE FUNCTION public.cargo_manual_adjustment(
  p_brand_id uuid, p_cargo_agent_id uuid, p_signed_amount numeric, p_note text, p_attachment_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ledger_id uuid; v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN RAISE EXCEPTION 'Admin role required'; END IF;
  IF p_signed_amount = 0 OR p_signed_amount IS NULL THEN RAISE EXCEPTION 'Amount required'; END IF;

  INSERT INTO public.imp_cargo_ledger(brand_id, cargo_agent_id, entry_date, entry_type, debit_bdt, credit_bdt, ref_type, ref_label, note, attachment_url, created_by)
  VALUES (p_brand_id, p_cargo_agent_id, CURRENT_DATE, 'adjustment',
          CASE WHEN p_signed_amount < 0 THEN abs(p_signed_amount) ELSE 0 END,
          CASE WHEN p_signed_amount > 0 THEN p_signed_amount ELSE 0 END,
          'manual', p_note, p_note, p_attachment_url, v_uid)
  RETURNING id INTO v_ledger_id;

  SELECT current_balance INTO v_new_balance FROM public.imp_cargo_balances WHERE cargo_agent_id = p_cargo_agent_id;
  RETURN jsonb_build_object('ledger_id', v_ledger_id, 'new_balance', v_new_balance);
END $$;

GRANT EXECUTE ON FUNCTION public.cargo_advance_deposit(uuid,uuid,uuid,numeric,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cargo_bill_create(uuid,uuid,text,date,text,uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cargo_po_payment(uuid,uuid,uuid,numeric,numeric,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cargo_manual_adjustment(uuid,uuid,numeric,text,text) TO authenticated;
