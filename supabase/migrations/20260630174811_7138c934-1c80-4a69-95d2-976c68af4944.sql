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
BEGIN
  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Purchase already %', p.status; END IF;

  SELECT * INTO acc FROM public.erp_accounts WHERE id = p.paid_from_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paid-from account not found'; END IF;

  SELECT brand_id INTO ad_brand FROM public.mkt_ad_accounts WHERE id = p.ad_account_id;
  resolved_brand := COALESCE(p.brand_id, acc.brand_id, ad_brand,
                             (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1));

  SELECT COALESCE((config->>'allow_negative_account')::boolean, false) INTO allow_negative
    FROM public.erp_settings WHERE brand_id = resolved_brand LIMIT 1;

  IF NOT allow_negative AND acc.current_balance < p.total_bdt THEN
    RAISE EXCEPTION 'Insufficient balance in % (have %, need %)', acc.name, acc.current_balance, p.total_bdt;
  END IF;

  UPDATE public.erp_accounts SET current_balance = current_balance - p.total_bdt, updated_at = now() WHERE id = acc.id;
  new_balance := acc.current_balance - p.total_bdt;

  INSERT INTO public.erp_transactions (brand_id, txn_type, account_id, amount, reference_type, reference_id,
                                       description, transaction_date, created_by, attachment_url)
  VALUES (resolved_brand, 'expense', acc.id, p.total_bdt,
          'meta_dollar_purchase', p.id,
          'Meta USD funding $' || p.usd_amount || ' @ ' || p.usd_rate,
          p.purchase_date, auth.uid(), p.attachment_url);

  INSERT INTO public.meta_fifo_lots (ad_account_id, purchase_id, lot_date, usd_total, usd_remaining, effective_rate)
  VALUES (p.ad_account_id, p.id, p.purchase_date, p.usd_amount, p.usd_amount, p.effective_rate);

  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            rate_used, source_purchase_id, conversion_source, note,
                                            balance_usd_after, created_by)
  VALUES (p.ad_account_id, p.purchase_date, 'purchase', p.usd_amount, p.total_bdt,
          p.effective_rate, p.id, 'fifo', 'Dollar purchase confirmed',
          (SELECT COALESCE(SUM(usd_delta),0) + p.usd_amount FROM public.meta_ad_wallet_ledger WHERE ad_account_id = p.ad_account_id),
          auth.uid());

  UPDATE public.meta_dollar_purchases
     SET status='confirmed', confirmed_at=now(), confirmed_by=auth.uid()
   WHERE id = p.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (resolved_brand, auth.uid(), 'confirm', 'meta_dollar_purchase', p.id,
          jsonb_build_object('usd', p.usd_amount, 'rate', p.usd_rate, 'fee', p.fee_bdt, 'total_bdt', p.total_bdt));

  RETURN jsonb_build_object('ok', true, 'new_account_balance', new_balance);
END;
$function$;