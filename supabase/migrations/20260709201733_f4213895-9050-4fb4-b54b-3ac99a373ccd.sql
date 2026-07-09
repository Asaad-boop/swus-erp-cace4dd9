
-- 1. Missing columns on mkt_insights_daily (sync.server.ts references them; silently failing today)
ALTER TABLE public.mkt_insights_daily
  ADD COLUMN IF NOT EXISTS fifo_consumption_ref text,
  ADD COLUMN IF NOT EXISTS fifo_consumed_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_mkt_insights_daily_fifo_ref
  ON public.mkt_insights_daily(fifo_consumption_ref)
  WHERE fifo_consumption_ref IS NOT NULL;

-- 2. Fix consume_meta_spend_fifo: cumulative BDT write-back (was writing delta only)
CREATE OR REPLACE FUNCTION public.consume_meta_spend_fifo(
  _ad_account_id uuid,
  _spend_ref     text,
  _usd_spend     numeric,
  _spend_date    date,
  _insight_id    uuid DEFAULT NULL
)
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
  -- Serialize concurrent consumption on same spend_ref
  PERFORM pg_advisory_xact_lock(hashtext(_ad_account_id::text || ':' || _spend_ref));

  IF _usd_spend IS NULL OR _usd_spend < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid spend');
  END IF;

  SELECT * INTO existing FROM public.meta_spend_consumptions
    WHERE ad_account_id = _ad_account_id AND spend_ref = _spend_ref
    FOR UPDATE;

  delta := _usd_spend - COALESCE(existing.usd_spend_recorded, 0);

  -- Noop
  IF delta = 0 THEN
    -- Still ensure insight row reflects the recorded cumulative BDT (self-healing)
    IF _insight_id IS NOT NULL AND existing.id IS NOT NULL THEN
      UPDATE public.mkt_insights_daily
         SET spend_bdt_fifo = existing.bdt_cost,
             conversion_source = existing.conversion_source,
             estimated_bdt_cost = (existing.conversion_source <> 'fifo'),
             fifo_consumption_ref = _spend_ref,
             fifo_consumed_at = COALESCE(fifo_consumed_at, now())
       WHERE id = _insight_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'noop', true,
                              'cumulative_bdt', COALESCE(existing.bdt_cost, 0));
  END IF;

  -- Decrease: don't refund lots (would corrupt FIFO history); log adjustment
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

  -- Positive delta: consume FIFO lots
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

  -- Fallback FX if not enough lots
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

  -- Wallet ledger entry for this delta
  SELECT COALESCE(SUM(usd_delta),0) - delta INTO bal
    FROM public.meta_ad_wallet_ledger WHERE ad_account_id=_ad_account_id;
  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            source_spend_ref, conversion_source, note, balance_usd_after)
  VALUES (_ad_account_id, _spend_date, 'spend', -delta, -delta_bdt,
          _spend_ref, conversion,
          CASE WHEN conversion='fx_fallback' THEN 'FIFO + FX fallback' ELSE 'FIFO consumed' END,
          bal);

  -- Upsert consumption row and get cumulative bdt back
  IF existing.id IS NULL THEN
    INSERT INTO public.meta_spend_consumptions (ad_account_id, insight_id, spend_ref, usd_spend_recorded,
                                                usd_consumed, bdt_cost, conversion_source, lots_used)
    VALUES (_ad_account_id, _insight_id, _spend_ref, _usd_spend, delta, delta_bdt, conversion, lots_used_local)
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

  -- FIX: write CUMULATIVE bdt to insight (previously wrote delta only)
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

GRANT EXECUTE ON FUNCTION public.consume_meta_spend_fifo(uuid, text, numeric, date, uuid)
  TO authenticated, service_role;

-- 3. Single-source-of-truth RPC for spend queries
CREATE OR REPLACE FUNCTION public.get_meta_spend_bdt(
  _brand_id uuid,
  _from     date,
  _to       date
)
RETURNS TABLE (
  brand_id           uuid,
  day                date,
  spend_usd          numeric,
  spend_bdt          numeric,   -- authoritative: FIFO when set, else USD * fallback_rate
  spend_bdt_fifo     numeric,   -- FIFO portion only
  spend_bdt_fallback numeric,   -- FX-fallback portion (spend_bdt - spend_bdt_fifo when estimated)
  is_estimated       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH fallback AS (
    SELECT COALESCE(
      (SELECT CASE WHEN SUM(usd_amount) > 0 THEN SUM(total_bdt)/SUM(usd_amount) END
         FROM public.meta_dollar_purchases WHERE status='confirmed'),
      (SELECT rate FROM public.erp_fx_rates
         WHERE from_ccy='USD' AND to_ccy='BDT'
         ORDER BY rate_date DESC LIMIT 1),
      0
    ) AS rate
  )
  SELECT
    i.brand_id,
    i.date AS day,
    COALESCE(SUM(i.spend), 0)::numeric AS spend_usd,
    COALESCE(SUM(
      CASE
        WHEN i.spend_bdt_fifo IS NOT NULL AND i.spend_bdt_fifo > 0 THEN i.spend_bdt_fifo
        ELSE COALESCE(i.spend,0) * (SELECT rate FROM fallback)
      END
    ), 0)::numeric AS spend_bdt,
    COALESCE(SUM(COALESCE(i.spend_bdt_fifo, 0)), 0)::numeric AS spend_bdt_fifo,
    COALESCE(SUM(
      CASE
        WHEN i.spend_bdt_fifo IS NULL OR i.spend_bdt_fifo = 0
          THEN COALESCE(i.spend,0) * (SELECT rate FROM fallback)
        ELSE 0
      END
    ), 0)::numeric AS spend_bdt_fallback,
    bool_or(COALESCE(i.estimated_bdt_cost, false) OR i.spend_bdt_fifo IS NULL OR i.spend_bdt_fifo = 0) AS is_estimated
  FROM public.mkt_insights_daily i
  WHERE i.brand_id = _brand_id
    AND i.date >= _from
    AND i.date <= _to
  GROUP BY i.brand_id, i.date
  ORDER BY i.date;
$function$;

GRANT EXECUTE ON FUNCTION public.get_meta_spend_bdt(uuid, date, date)
  TO authenticated, service_role;

-- 4. Reconciliation view: FIFO vs naive flat FX comparison
CREATE OR REPLACE VIEW public.v_meta_spend_reconciliation AS
WITH fallback AS (
  SELECT COALESCE(
    (SELECT CASE WHEN SUM(usd_amount) > 0 THEN SUM(total_bdt)/SUM(usd_amount) END
       FROM public.meta_dollar_purchases WHERE status='confirmed'),
    (SELECT rate FROM public.erp_fx_rates
       WHERE from_ccy='USD' AND to_ccy='BDT'
       ORDER BY rate_date DESC LIMIT 1),
    0
  ) AS rate
)
SELECT
  i.brand_id,
  i.date,
  COALESCE(SUM(i.spend), 0)::numeric                       AS spend_usd,
  COALESCE(SUM(i.spend_bdt_fifo), 0)::numeric              AS spend_bdt_fifo,
  (COALESCE(SUM(i.spend), 0) * (SELECT rate FROM fallback))::numeric AS spend_bdt_flat_fx,
  (COALESCE(SUM(i.spend_bdt_fifo), 0)
    - (COALESCE(SUM(i.spend), 0) * (SELECT rate FROM fallback)))::numeric AS gap_bdt,
  CASE
    WHEN COALESCE(SUM(i.spend), 0) * (SELECT rate FROM fallback) = 0 THEN NULL
    ELSE ROUND(
      100.0 * (COALESCE(SUM(i.spend_bdt_fifo),0)
        - (COALESCE(SUM(i.spend),0) * (SELECT rate FROM fallback)))
      / NULLIF((COALESCE(SUM(i.spend),0) * (SELECT rate FROM fallback)), 0),
    2) END AS gap_pct,
  COUNT(*)                                                  AS insight_rows,
  COUNT(*) FILTER (WHERE i.spend_bdt_fifo IS NULL OR i.spend_bdt_fifo = 0) AS unenriched_rows,
  COUNT(*) FILTER (WHERE i.conversion_source = 'fx_fallback')              AS fallback_rows,
  (SELECT rate FROM fallback)                               AS flat_fx_rate_used
FROM public.mkt_insights_daily i
GROUP BY i.brand_id, i.date
ORDER BY i.date DESC;

GRANT SELECT ON public.v_meta_spend_reconciliation TO authenticated, service_role;
