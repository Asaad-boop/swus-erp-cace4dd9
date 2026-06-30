CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_transactions_meta_dollar_purchase
  ON public.erp_transactions (reference_id)
  WHERE reference_type = 'meta_dollar_purchase';

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_fifo_lots_purchase_id
  ON public.meta_fifo_lots (purchase_id)
  WHERE purchase_id IS NOT NULL;

-- Backfill any confirmed Meta dollar purchase that is missing its finance transaction.
INSERT INTO public.erp_transactions (
  brand_id,
  txn_type,
  account_id,
  amount,
  reference_type,
  reference_id,
  description,
  transaction_date,
  created_by,
  attachment_url
)
SELECT
  COALESCE(p.brand_id, acc.brand_id, ad.brand_id, (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1)),
  'expense',
  p.paid_from_account_id,
  p.total_bdt,
  'meta_dollar_purchase',
  p.id,
  'Meta USD funding $' || p.usd_amount || ' @ ' || p.usd_rate,
  p.purchase_date,
  p.confirmed_by,
  p.attachment_url
FROM public.meta_dollar_purchases p
JOIN public.erp_accounts acc ON acc.id = p.paid_from_account_id
LEFT JOIN public.mkt_ad_accounts ad ON ad.id = p.ad_account_id
WHERE p.status = 'confirmed'
  AND NOT EXISTS (
    SELECT 1
    FROM public.erp_transactions t
    WHERE t.reference_type = 'meta_dollar_purchase'
      AND t.reference_id = p.id
  );

-- The old confirm function directly deducted wallet balance AND inserted a transaction
-- whose trigger deducted again. Add back the old direct deduction once for each
-- already-confirmed purchase, leaving the transaction trigger as the single source.
UPDATE public.erp_accounts acc
SET current_balance = acc.current_balance + fixed.total_bdt,
    updated_at = now()
FROM (
  SELECT paid_from_account_id, COALESCE(SUM(total_bdt), 0) AS total_bdt
  FROM public.meta_dollar_purchases
  WHERE status = 'confirmed'
  GROUP BY paid_from_account_id
) fixed
WHERE acc.id = fixed.paid_from_account_id;

CREATE OR REPLACE FUNCTION public.confirm_meta_dollar_purchase(_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.meta_dollar_purchases;
  acc public.erp_accounts;
  ad_brand uuid;
  resolved_brand uuid;
  allow_negative boolean := false;
  new_balance numeric;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR public.has_role(v_user, 'accountant'::public.app_role)
    OR public.has_role(v_user, 'operations'::public.app_role)
    OR public.has_role(v_user, 'marketing_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Purchase already %', p.status; END IF;

  SELECT * INTO acc FROM public.erp_accounts WHERE id = p.paid_from_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paid-from account not found'; END IF;

  SELECT brand_id INTO ad_brand FROM public.mkt_ad_accounts WHERE id = p.ad_account_id;
  resolved_brand := COALESCE(p.brand_id, acc.brand_id, ad_brand,
                             (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1));
  IF resolved_brand IS NULL THEN
    RAISE EXCEPTION 'Brand not found for this purchase';
  END IF;

  SELECT COALESCE((config->>'allow_negative_account')::boolean, false) INTO allow_negative
    FROM public.erp_settings WHERE brand_id = resolved_brand LIMIT 1;

  IF NOT allow_negative AND acc.current_balance < p.total_bdt THEN
    RAISE EXCEPTION 'Insufficient balance in % (have %, need %)', acc.name, acc.current_balance, p.total_bdt;
  END IF;

  -- Single source of wallet balance impact: erp_transactions trigger.
  INSERT INTO public.erp_transactions (brand_id, txn_type, account_id, amount, reference_type, reference_id,
                                       description, transaction_date, created_by, attachment_url)
  VALUES (resolved_brand, 'expense', acc.id, p.total_bdt,
          'meta_dollar_purchase', p.id,
          'Meta USD funding $' || p.usd_amount || ' @ ' || p.usd_rate,
          p.purchase_date, v_user, p.attachment_url);

  INSERT INTO public.meta_fifo_lots (ad_account_id, purchase_id, lot_date, usd_total, usd_remaining, effective_rate)
  VALUES (p.ad_account_id, p.id, p.purchase_date, p.usd_amount, p.usd_amount, p.effective_rate);

  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            rate_used, source_purchase_id, conversion_source, note,
                                            balance_usd_after, created_by)
  VALUES (p.ad_account_id, p.purchase_date, 'purchase', p.usd_amount, p.total_bdt,
          p.effective_rate, p.id, 'fifo', 'Dollar purchase confirmed',
          (SELECT COALESCE(SUM(usd_delta),0) + p.usd_amount FROM public.meta_ad_wallet_ledger WHERE ad_account_id = p.ad_account_id),
          v_user);

  UPDATE public.meta_dollar_purchases
     SET status='confirmed', confirmed_at=now(), confirmed_by=v_user
   WHERE id = p.id;

  SELECT current_balance INTO new_balance FROM public.erp_accounts WHERE id = acc.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (resolved_brand, v_user, 'confirm', 'meta_dollar_purchase', p.id,
          jsonb_build_object('usd', p.usd_amount, 'rate', p.usd_rate, 'fee', p.fee_bdt, 'total_bdt', p.total_bdt));

  RETURN jsonb_build_object('ok', true, 'new_account_balance', new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_meta_dollar_purchase(_purchase_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.meta_dollar_purchases;
  lot public.meta_fifo_lots;
  consumed numeric := 0;
  v_deleted integer := 0;
  v_user uuid := auth.uid();
  ad_brand uuid;
  acc_brand uuid;
  resolved_brand uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR public.has_role(v_user, 'accountant'::public.app_role)
    OR public.has_role(v_user, 'operations'::public.app_role)
    OR public.has_role(v_user, 'marketing_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status = 'cancelled' THEN RAISE EXCEPTION 'Already cancelled'; END IF;

  SELECT brand_id INTO ad_brand FROM public.mkt_ad_accounts WHERE id = p.ad_account_id;
  SELECT brand_id INTO acc_brand FROM public.erp_accounts WHERE id = p.paid_from_account_id;
  resolved_brand := COALESCE(p.brand_id, acc_brand, ad_brand,
                             (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1));

  IF p.status = 'confirmed' THEN
    SELECT * INTO lot FROM public.meta_fifo_lots WHERE purchase_id = p.id FOR UPDATE;
    consumed := COALESCE(lot.usd_total - lot.usd_remaining, 0);
    IF consumed > 0 THEN
      RAISE EXCEPTION 'Cannot cancel: $% already consumed by Meta spend. Create an adjustment instead.', consumed;
    END IF;

    -- Delete the original funding expense; the erp_transactions trigger refunds the wallet once.
    DELETE FROM public.erp_transactions
     WHERE reference_type = 'meta_dollar_purchase'
       AND reference_id = p.id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Legacy fallback only: if no finance transaction existed, refund the direct historical debit.
    IF v_deleted = 0 THEN
      UPDATE public.erp_accounts
         SET current_balance = current_balance + p.total_bdt,
             updated_at = now()
       WHERE id = p.paid_from_account_id;
    END IF;

    UPDATE public.meta_fifo_lots
       SET is_active=false, usd_remaining=0
     WHERE purchase_id = p.id;

    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              source_purchase_id, conversion_source, note, balance_usd_after, created_by)
    VALUES (p.ad_account_id, CURRENT_DATE, 'adjustment', -p.usd_amount, -p.total_bdt,
            p.id, 'manual', 'Cancellation reversal',
            (SELECT COALESCE(SUM(usd_delta),0) - p.usd_amount FROM public.meta_ad_wallet_ledger WHERE ad_account_id=p.ad_account_id),
            v_user);
  END IF;

  UPDATE public.meta_dollar_purchases
     SET status='cancelled', cancelled_at=now(), cancelled_by=v_user, cancel_reason=_reason
   WHERE id = p.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (resolved_brand, v_user, 'cancel', 'meta_dollar_purchase', p.id,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.confirm_meta_dollar_purchase(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_meta_dollar_purchase(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.imp_delete_po(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_meta_dollar_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_meta_dollar_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.imp_delete_po(uuid) TO authenticated;