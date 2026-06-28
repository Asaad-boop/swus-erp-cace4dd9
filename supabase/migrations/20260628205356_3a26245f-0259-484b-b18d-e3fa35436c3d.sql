
CREATE OR REPLACE FUNCTION public._imp_record_payment(
  _brand uuid, _po uuid, _carton uuid, _ptype public.imp_payment_type,
  _amount numeric, _wallet uuid, _date date, _ref text, _notes text,
  _idem text, _user uuid,
  _dr_account uuid, _cr_account uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing uuid; v_balance numeric; v_journal uuid; v_payment uuid;
  v_wallet_id uuid; v_wallet_brand uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _idem IS NULL OR length(_idem) < 8 THEN RAISE EXCEPTION 'idempotency key required'; END IF;

  SELECT id INTO v_existing FROM imp_payments WHERE idempotency_key = _idem;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT id, brand_id, current_balance INTO v_wallet_id, v_wallet_brand, v_balance
    FROM erp_accounts WHERE id = _wallet FOR UPDATE;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  -- Allow shared wallets (brand_id IS NULL) for any brand
  IF v_wallet_brand IS NOT NULL AND v_wallet_brand <> _brand THEN
    RAISE EXCEPTION 'wallet brand mismatch';
  END IF;
  IF v_balance < _amount THEN RAISE EXCEPTION 'insufficient wallet balance (have %, need %)', v_balance, _amount; END IF;

  v_journal := public._imp_post_journal(
    _brand, _date,
    format('Import %s payment (PO %s)', _ptype, COALESCE((SELECT po_number FROM imp_purchase_orders WHERE id = _po), '')),
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

  RETURN v_payment;
END $$;
REVOKE EXECUTE ON FUNCTION public._imp_record_payment(uuid,uuid,uuid,public.imp_payment_type,numeric,uuid,date,text,text,text,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
