-- 1) Remove the manual wallet update from _imp_record_payment;
--    erp_transactions trigger already adjusts balance on insert.
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

  -- Insert into erp_transactions; trigger auto-updates wallet balance.
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

-- 2) Refund the double-deduction created by the previous backfill.
--    Previous flow: function did manual -amount, THEN backfill inserted a
--    transaction which triggered another -amount. Add the amount back once
--    per backfilled imp_payment.
WITH refund AS (
  SELECT p.wallet_id, SUM(p.amount_bdt) AS amt
  FROM imp_payments p
  WHERE COALESCE(p.is_reversed, false) = false
  GROUP BY p.wallet_id
)
UPDATE erp_accounts a
SET current_balance = current_balance + r.amt,
    updated_at = now()
FROM refund r
WHERE a.id = r.wallet_id;