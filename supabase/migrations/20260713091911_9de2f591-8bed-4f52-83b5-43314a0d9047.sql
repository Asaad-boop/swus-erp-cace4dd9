-- Fix: imp_payments should also create erp_transactions rows so payments
-- appear in the accounts/transaction ledger (not just journal entries).

CREATE OR REPLACE FUNCTION public._imp_record_payment(
  _brand uuid, _po uuid, _carton uuid, _ptype imp_payment_type,
  _amount numeric, _wallet uuid, _date date,
  _ref text, _notes text, _idem text,
  _user uuid, _dr_account uuid, _cr_account uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid; v_balance numeric; v_journal uuid; v_payment uuid;
  v_wallet_id uuid; v_wallet_brand uuid;
  v_po_number text;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _idem IS NULL OR length(_idem) < 8 THEN RAISE EXCEPTION 'idempotency key required'; END IF;

  SELECT id INTO v_existing FROM imp_payments WHERE idempotency_key = _idem;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT id, brand_id, current_balance INTO v_wallet_id, v_wallet_brand, v_balance
    FROM erp_accounts WHERE id = _wallet FOR UPDATE;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF v_wallet_brand IS NOT NULL AND v_wallet_brand <> _brand THEN
    RAISE EXCEPTION 'wallet brand mismatch';
  END IF;
  IF v_balance < _amount THEN RAISE EXCEPTION 'insufficient wallet balance (have %, need %)', v_balance, _amount; END IF;

  SELECT po_number INTO v_po_number FROM imp_purchase_orders WHERE id = _po;

  v_journal := public._imp_post_journal(
    _brand, _date,
    format('Import %s payment (PO %s)', _ptype, COALESCE(v_po_number, '')),
    'imp_payment', NULL,
    jsonb_build_array(
      jsonb_build_object('account_id', _dr_account, 'debit', _amount, 'credit', 0, 'description', _ptype::text),
      jsonb_build_object('account_id', _cr_account, 'debit', 0, 'credit', _amount, 'description', 'Wallet outflow')
    ),
    _user
  );

  INSERT INTO imp_payments (brand_id, po_id, carton_id, payment_type, amount_bdt, wallet_id,
                            payment_date, reference, notes, journal_entry_id, idempotency_key, created_by)
  VALUES (_brand, _po, _carton, _ptype, round(_amount,4), _wallet, _date, _ref, _notes, v_journal, _idem, _user)
  RETURNING id INTO v_payment;

  UPDATE erp_journal_entries SET source_type='imp_payment', source_id=v_payment WHERE id = v_journal;
  UPDATE erp_accounts SET current_balance = current_balance - _amount, updated_at = now() WHERE id = _wallet;

  -- Mirror into erp_transactions so it appears in the wallet/account
  -- transaction ledger alongside every other expense.
  INSERT INTO erp_transactions (
    brand_id, txn_type, account_id, amount, reference_type, reference_id,
    description, transaction_date, created_by
  ) VALUES (
    _brand, 'expense', _wallet, round(_amount, 4), 'imp_payment', v_payment,
    format('Import %s (PO %s)%s',
      replace(_ptype::text, '_', ' '),
      COALESCE(v_po_number, ''),
      CASE WHEN _ref IS NOT NULL AND length(_ref) > 0 THEN ' — ' || _ref ELSE '' END),
    _date, _user
  );

  RETURN v_payment;
END $function$;

-- Backfill: create erp_transactions for every existing imp_payment that
-- doesn't have one yet (so the accounts ledger becomes correct now).
INSERT INTO erp_transactions (
  brand_id, txn_type, account_id, amount, reference_type, reference_id,
  description, transaction_date, created_by, created_at
)
SELECT
  p.brand_id, 'expense', p.wallet_id, round(p.amount_bdt, 4),
  'imp_payment', p.id,
  format('Import %s (PO %s)%s',
    replace(p.payment_type::text, '_', ' '),
    COALESCE(po.po_number, ''),
    CASE WHEN p.reference IS NOT NULL AND length(p.reference) > 0
         THEN ' — ' || p.reference ELSE '' END),
  p.payment_date, p.created_by, p.created_at
FROM imp_payments p
LEFT JOIN imp_purchase_orders po ON po.id = p.po_id
WHERE COALESCE(p.is_reversed, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM erp_transactions t
    WHERE t.reference_type = 'imp_payment' AND t.reference_id = p.id
  );