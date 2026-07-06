
CREATE OR REPLACE FUNCTION public.adjust_meta_dollar_purchase(_purchase_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.meta_dollar_purchases;
  lot public.meta_fifo_lots;
  remaining_usd numeric := 0;
  refund_bdt numeric := 0;
  eff_rate numeric := 0;
  resolved_brand uuid;
  ad_brand uuid;
  acc_brand uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

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
  IF p.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed purchases can be adjusted'; END IF;

  SELECT brand_id INTO ad_brand FROM public.mkt_ad_accounts WHERE id = p.ad_account_id;
  SELECT brand_id INTO acc_brand FROM public.erp_accounts WHERE id = p.paid_from_account_id;
  resolved_brand := COALESCE(p.brand_id, acc_brand, ad_brand,
                             (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1));

  SELECT * INTO lot FROM public.meta_fifo_lots WHERE purchase_id = p.id FOR UPDATE;
  IF FOUND THEN
    remaining_usd := COALESCE(lot.usd_remaining, 0);
    eff_rate := COALESCE(lot.effective_rate, p.effective_rate, p.usd_rate);
  END IF;

  refund_bdt := ROUND(remaining_usd * eff_rate, 2);

  IF refund_bdt > 0 THEN
    -- Refund the unspent portion back to the paid-from account.
    INSERT INTO public.erp_transactions (brand_id, txn_type, account_id, amount, reference_type, reference_id,
                                         description, transaction_date, created_by)
    VALUES (resolved_brand, 'income', p.paid_from_account_id, refund_bdt,
            'meta_dollar_purchase_adjust', p.id,
            'Adjust Meta USD funding — refund unspent $' || remaining_usd || ' @ ' || eff_rate
              || COALESCE(' · ' || _reason, ''),
            CURRENT_DATE, v_user);
  END IF;

  IF lot.id IS NOT NULL THEN
    UPDATE public.meta_fifo_lots
       SET usd_remaining = 0, is_active = false
     WHERE id = lot.id;
  END IF;

  IF remaining_usd > 0 THEN
    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              rate_used, source_purchase_id, conversion_source, note,
                                              balance_usd_after, created_by)
    VALUES (p.ad_account_id, CURRENT_DATE, 'adjustment', -remaining_usd, -refund_bdt,
            eff_rate, p.id, 'manual',
            'Adjustment write-off' || COALESCE(' · ' || _reason, ''),
            (SELECT COALESCE(SUM(usd_delta),0) - remaining_usd FROM public.meta_ad_wallet_ledger WHERE ad_account_id = p.ad_account_id),
            v_user);
  END IF;

  UPDATE public.meta_dollar_purchases
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user,
         cancel_reason = COALESCE(_reason, 'Adjusted / written off')
   WHERE id = p.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (resolved_brand, v_user, 'adjust', 'meta_dollar_purchase', p.id,
          jsonb_build_object('remaining_usd', remaining_usd, 'refund_bdt', refund_bdt, 'reason', _reason));

  RETURN jsonb_build_object('ok', true, 'remaining_usd', remaining_usd, 'refund_bdt', refund_bdt);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.adjust_meta_dollar_purchase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_meta_dollar_purchase(uuid, text) TO authenticated;
