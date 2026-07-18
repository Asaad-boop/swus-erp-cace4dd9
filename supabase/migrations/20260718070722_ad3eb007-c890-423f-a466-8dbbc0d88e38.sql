
-- 1) Break cascade: consumption should survive insight window rebuilds
ALTER TABLE public.meta_spend_consumptions
  DROP CONSTRAINT IF EXISTS meta_spend_consumptions_insight_id_fkey;
ALTER TABLE public.meta_spend_consumptions
  ADD CONSTRAINT meta_spend_consumptions_insight_id_fkey
  FOREIGN KEY (insight_id) REFERENCES public.mkt_insights_daily(id) ON DELETE SET NULL;

-- 2) Ensure one consumption row per (ad_account, spend_ref) — canonical key
CREATE UNIQUE INDEX IF NOT EXISTS meta_spend_consumptions_acct_ref_uidx
  ON public.meta_spend_consumptions (ad_account_id, spend_ref);

-- 3) Cleanup: dedupe wallet ledger spend rows, keep earliest per source_spend_ref
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY ad_account_id, source_spend_ref
                            ORDER BY created_at ASC, id ASC) AS rn
  FROM public.meta_ad_wallet_ledger
  WHERE entry_type = 'spend' AND source_spend_ref IS NOT NULL
)
DELETE FROM public.meta_ad_wallet_ledger l
USING ranked r
WHERE l.id = r.id AND r.rn > 1;

-- 4) Guard: prevent future duplicate spend rows for same source_spend_ref
CREATE UNIQUE INDEX IF NOT EXISTS meta_ad_wallet_ledger_spend_ref_uidx
  ON public.meta_ad_wallet_ledger (ad_account_id, source_spend_ref)
  WHERE entry_type = 'spend' AND source_spend_ref IS NOT NULL;

-- 5) Recompute balance_usd_after as running total across ALL entries per account
WITH running AS (
  SELECT id,
         SUM(usd_delta) OVER (PARTITION BY ad_account_id
                              ORDER BY created_at ASC, id ASC
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bal
  FROM public.meta_ad_wallet_ledger
)
UPDATE public.meta_ad_wallet_ledger l
   SET balance_usd_after = r.bal
  FROM running r
 WHERE l.id = r.id;

-- 6) Repair consumption rows that got wiped by prior cascades (rebuild from surviving ledger)
INSERT INTO public.meta_spend_consumptions
  (ad_account_id, insight_id, spend_ref, usd_spend_recorded, usd_consumed, bdt_cost, conversion_source, lots_used)
SELECT l.ad_account_id, NULL, l.source_spend_ref, -l.usd_delta, -l.usd_delta, -l.bdt_value,
       COALESCE(l.conversion_source, 'fifo'), '[]'::jsonb
FROM public.meta_ad_wallet_ledger l
WHERE l.entry_type = 'spend' AND l.source_spend_ref IS NOT NULL
ON CONFLICT (ad_account_id, spend_ref) DO NOTHING;

-- 7) Harden FIFO RPC: use ON CONFLICT to be belt-and-suspenders idempotent even under races
CREATE OR REPLACE FUNCTION public.consume_meta_spend_fifo(_ad_account_id uuid, _spend_ref text, _usd_spend numeric, _spend_date date, _insight_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing              public.meta_spend_consumptions;
  delta                 numeric;
  remaining_to_consume  numeric;
  lot                   RECORD;
  take                  numeric;
  delta_bdt             numeric := 0;
  cumulative_bdt        numeric;
  lots_used_local       jsonb := '[]'::jsonb;
  fallback_rate         numeric;
  conversion            text := 'fifo';
  bal                   numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_ad_account_id::text || ':' || _spend_ref));

  IF _usd_spend IS NULL OR _usd_spend < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid spend');
  END IF;

  SELECT * INTO existing FROM public.meta_spend_consumptions
    WHERE ad_account_id = _ad_account_id AND spend_ref = _spend_ref
    FOR UPDATE;

  delta := _usd_spend - COALESCE(existing.usd_spend_recorded, 0);

  IF delta = 0 THEN
    IF _insight_id IS NOT NULL AND existing.id IS NOT NULL THEN
      UPDATE public.mkt_insights_daily
         SET spend_bdt_fifo = existing.bdt_cost,
             conversion_source = existing.conversion_source,
             estimated_bdt_cost = (existing.conversion_source <> 'fifo'),
             fifo_consumption_ref = _spend_ref,
             fifo_consumed_at = COALESCE(fifo_consumed_at, now())
       WHERE id = _insight_id;
      -- Self-heal: re-attach insight_id if it was nulled by SET NULL
      UPDATE public.meta_spend_consumptions SET insight_id = _insight_id
        WHERE id = existing.id AND insight_id IS DISTINCT FROM _insight_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'noop', true,
                              'cumulative_bdt', COALESCE(existing.bdt_cost, 0));
  END IF;

  IF delta < 0 THEN
    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              source_spend_ref, conversion_source, note, balance_usd_after)
    VALUES (_ad_account_id, _spend_date, 'adjustment', -delta, 0,
            _spend_ref, 'manual', 'Spend decreased — manual review',
            (SELECT COALESCE(SUM(usd_delta),0) + (-delta) FROM public.meta_ad_wallet_ledger WHERE ad_account_id=_ad_account_id));
    UPDATE public.meta_spend_consumptions SET usd_spend_recorded=_usd_spend, updated_at=now() WHERE id = existing.id;

    IF _insight_id IS NOT NULL THEN
      UPDATE public.mkt_insights_daily
         SET spend_bdt_fifo = existing.bdt_cost,
             conversion_source = existing.conversion_source,
             estimated_bdt_cost = (existing.conversion_source <> 'fifo'),
             fifo_consumption_ref = _spend_ref,
             fifo_consumed_at = now()
       WHERE id = _insight_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'decreased', true, 'delta', delta,
                              'cumulative_bdt', COALESCE(existing.bdt_cost, 0));
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
    delta_bdt := delta_bdt + (take * lot.effective_rate);
    lots_used_local := lots_used_local || jsonb_build_array(
      jsonb_build_object('lot_id', lot.id, 'usd', take, 'rate', lot.effective_rate));
    remaining_to_consume := remaining_to_consume - take;
  END LOOP;

  IF remaining_to_consume > 0 THEN
    SELECT CASE WHEN SUM(usd_amount) > 0 THEN SUM(total_bdt)/SUM(usd_amount) END
      INTO fallback_rate
      FROM public.meta_dollar_purchases
     WHERE ad_account_id = _ad_account_id AND status = 'confirmed';

    IF fallback_rate IS NULL OR fallback_rate <= 0 THEN
      SELECT rate INTO fallback_rate FROM public.erp_fx_rates
        WHERE from_ccy='USD' AND to_ccy='BDT'
        ORDER BY rate_date DESC LIMIT 1;
    END IF;

    fallback_rate := COALESCE(fallback_rate, 0);
    IF fallback_rate <= 0 THEN
      RAISE EXCEPTION 'No USD->BDT rate available for ad account %. Add a Dollar Purchase or FX rate first.', _ad_account_id;
    END IF;

    delta_bdt := delta_bdt + (remaining_to_consume * fallback_rate);
    lots_used_local := lots_used_local || jsonb_build_array(
      jsonb_build_object('fallback_usd', remaining_to_consume, 'rate', fallback_rate));
    conversion := 'fx_fallback';
    remaining_to_consume := 0;
  END IF;

  -- Idempotent ledger insert: unique(ad_account_id, source_spend_ref) WHERE entry_type='spend'
  SELECT COALESCE(SUM(usd_delta),0) - delta INTO bal
    FROM public.meta_ad_wallet_ledger WHERE ad_account_id=_ad_account_id;
  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            source_spend_ref, conversion_source, note, balance_usd_after)
  VALUES (_ad_account_id, _spend_date, 'spend', -delta, -delta_bdt,
          _spend_ref, conversion,
          CASE WHEN conversion='fx_fallback' THEN 'FIFO + FX fallback' ELSE 'FIFO consumed' END,
          bal)
  ON CONFLICT (ad_account_id, source_spend_ref) WHERE entry_type='spend' AND source_spend_ref IS NOT NULL
  DO UPDATE SET usd_delta = meta_ad_wallet_ledger.usd_delta + EXCLUDED.usd_delta,
                bdt_value = meta_ad_wallet_ledger.bdt_value + EXCLUDED.bdt_value,
                conversion_source = EXCLUDED.conversion_source;

  IF existing.id IS NULL THEN
    INSERT INTO public.meta_spend_consumptions (ad_account_id, insight_id, spend_ref, usd_spend_recorded,
                                                usd_consumed, bdt_cost, conversion_source, lots_used)
    VALUES (_ad_account_id, _insight_id, _spend_ref, _usd_spend, delta, delta_bdt, conversion, lots_used_local)
    ON CONFLICT (ad_account_id, spend_ref) DO UPDATE
      SET usd_spend_recorded = EXCLUDED.usd_spend_recorded,
          usd_consumed = meta_spend_consumptions.usd_consumed + EXCLUDED.usd_consumed,
          bdt_cost = meta_spend_consumptions.bdt_cost + EXCLUDED.bdt_cost,
          conversion_source = EXCLUDED.conversion_source,
          lots_used = COALESCE(meta_spend_consumptions.lots_used,'[]'::jsonb) || EXCLUDED.lots_used,
          insight_id = COALESCE(EXCLUDED.insight_id, meta_spend_consumptions.insight_id),
          updated_at = now()
    RETURNING bdt_cost INTO cumulative_bdt;
  ELSE
    UPDATE public.meta_spend_consumptions
       SET usd_spend_recorded = _usd_spend,
           usd_consumed = COALESCE(usd_consumed,0) + delta,
           bdt_cost     = COALESCE(bdt_cost,0)     + delta_bdt,
           conversion_source = CASE WHEN conversion_source = 'fifo' AND conversion <> 'fifo'
                                    THEN conversion ELSE COALESCE(conversion_source, conversion) END,
           lots_used    = COALESCE(lots_used, '[]'::jsonb) || lots_used_local,
           updated_at   = now(),
           insight_id   = COALESCE(_insight_id, insight_id)
     WHERE id = existing.id
    RETURNING bdt_cost INTO cumulative_bdt;
  END IF;

  IF _insight_id IS NOT NULL THEN
    UPDATE public.mkt_insights_daily
       SET spend_bdt_fifo = cumulative_bdt,
           conversion_source = conversion,
           estimated_bdt_cost = (conversion <> 'fifo'),
           fifo_consumption_ref = _spend_ref,
           fifo_consumed_at = now()
     WHERE id = _insight_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'delta_usd', delta,
    'delta_bdt', delta_bdt,
    'cumulative_bdt', cumulative_bdt,
    'conversion', conversion
  );
END;
$function$;
