
CREATE OR REPLACE FUNCTION public.consume_meta_spend_fifo(
  _ad_account_id uuid, _spend_ref text, _usd_spend numeric, _spend_date date, _insight_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing public.meta_spend_consumptions;
  delta numeric;
  remaining_to_consume numeric;
  lot RECORD;
  take numeric;
  total_bdt numeric := 0;
  lots_used jsonb := '[]'::jsonb;
  fallback_rate numeric;
  conversion text := 'fifo';
  bal numeric;
BEGIN
  IF _usd_spend IS NULL OR _usd_spend < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid spend');
  END IF;

  SELECT * INTO existing FROM public.meta_spend_consumptions
    WHERE ad_account_id=_ad_account_id AND spend_ref=_spend_ref FOR UPDATE;

  delta := _usd_spend - COALESCE(existing.usd_spend_recorded, 0);
  IF delta = 0 THEN RETURN jsonb_build_object('ok', true, 'noop', true); END IF;

  IF delta < 0 THEN
    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              source_spend_ref, conversion_source, note, balance_usd_after)
    VALUES (_ad_account_id, _spend_date, 'adjustment', -delta, 0,
            _spend_ref, 'manual', 'Spend decreased — manual review',
            (SELECT COALESCE(SUM(usd_delta),0) + (-delta) FROM public.meta_ad_wallet_ledger WHERE ad_account_id=_ad_account_id));
    UPDATE public.meta_spend_consumptions SET usd_spend_recorded=_usd_spend, updated_at=now() WHERE id = existing.id;
    RETURN jsonb_build_object('ok', true, 'decreased', true, 'delta', delta);
  END IF;

  remaining_to_consume := delta;
  FOR lot IN
    SELECT * FROM public.meta_fifo_lots
     WHERE ad_account_id=_ad_account_id AND is_active AND usd_remaining > 0
     ORDER BY lot_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN remaining_to_consume <= 0;
    take := LEAST(lot.usd_remaining, remaining_to_consume);
    UPDATE public.meta_fifo_lots SET usd_remaining = usd_remaining - take WHERE id = lot.id;
    total_bdt := total_bdt + (take * lot.effective_rate);
    lots_used := lots_used || jsonb_build_array(jsonb_build_object('lot_id', lot.id, 'usd', take, 'rate', lot.effective_rate));
    remaining_to_consume := remaining_to_consume - take;
  END LOOP;

  IF remaining_to_consume > 0 THEN
    SELECT rate INTO fallback_rate FROM public.erp_fx_rates
      WHERE from_ccy='USD' AND to_ccy='BDT'
      ORDER BY rate_date DESC LIMIT 1;
    fallback_rate := COALESCE(fallback_rate, 120);
    total_bdt := total_bdt + (remaining_to_consume * fallback_rate);
    lots_used := lots_used || jsonb_build_array(jsonb_build_object('fallback_usd', remaining_to_consume, 'rate', fallback_rate));
    conversion := 'fx_fallback';
    remaining_to_consume := 0;
  END IF;

  SELECT COALESCE(SUM(usd_delta),0) - delta INTO bal FROM public.meta_ad_wallet_ledger WHERE ad_account_id=_ad_account_id;
  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            source_spend_ref, conversion_source, note, balance_usd_after)
  VALUES (_ad_account_id, _spend_date, 'spend', -delta, -total_bdt,
          _spend_ref, conversion,
          CASE WHEN conversion='fx_fallback' THEN 'FIFO + FX fallback' ELSE 'FIFO consumed' END,
          bal);

  IF existing.id IS NULL THEN
    INSERT INTO public.meta_spend_consumptions (ad_account_id, insight_id, spend_ref, usd_spend_recorded,
                                                usd_consumed, bdt_cost, conversion_source, lots_used)
    VALUES (_ad_account_id, _insight_id, _spend_ref, _usd_spend, delta, total_bdt, conversion, lots_used);
  ELSE
    UPDATE public.meta_spend_consumptions
       SET usd_spend_recorded=_usd_spend,
           usd_consumed = usd_consumed + delta,
           bdt_cost = bdt_cost + total_bdt,
           conversion_source = conversion,
           lots_used = lots_used || existing.lots_used,
           updated_at = now()
     WHERE id = existing.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'delta_usd', delta, 'bdt_cost', total_bdt, 'conversion', conversion);
END;
$$;
