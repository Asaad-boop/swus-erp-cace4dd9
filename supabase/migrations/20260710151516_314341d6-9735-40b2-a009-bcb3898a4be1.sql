DO $$
DECLARE
  v_ad_account uuid;
BEGIN
  SELECT id INTO v_ad_account FROM public.mkt_ad_accounts LIMIT 1;
  IF v_ad_account IS NULL THEN RAISE EXCEPTION 'No ad account found'; END IF;

  -- 1) Backfill meta_dollar_purchases (id = erp_transactions.reference_id)
  INSERT INTO public.meta_dollar_purchases (
    id, brand_id, ad_account_id, paid_from_account_id, purchase_date,
    usd_amount, usd_rate, fee_bdt,
    status, confirmed_at, note, created_at
  )
  SELECT
    t.reference_id,
    t.brand_id,
    v_ad_account,
    t.account_id,
    t.transaction_date,
    ROUND(t.amount / NULLIF(substring(t.description from '@ ([0-9.]+)')::numeric, 0), 4),
    substring(t.description from '@ ([0-9.]+)')::numeric,
    0,
    'confirmed', now(),
    'backfill-phase-4a',
    t.created_at
  FROM public.erp_transactions t
  WHERE t.reference_type = 'meta_dollar_purchase'
    AND NOT EXISTS (SELECT 1 FROM public.meta_dollar_purchases p WHERE p.id = t.reference_id);

  -- 2) FIFO lots
  INSERT INTO public.meta_fifo_lots (ad_account_id, purchase_id, lot_date, usd_total, usd_remaining, effective_rate, is_active)
  SELECT p.ad_account_id, p.id, p.purchase_date, p.usd_amount, p.usd_amount, p.effective_rate, true
  FROM public.meta_dollar_purchases p
  WHERE p.note = 'backfill-phase-4a'
    AND NOT EXISTS (SELECT 1 FROM public.meta_fifo_lots l WHERE l.purchase_id = p.id);

  -- 3) Wallet ledger entries
  WITH ordered AS (
    SELECT p.*,
           SUM(p.usd_amount) OVER (
             PARTITION BY p.ad_account_id
             ORDER BY p.purchase_date, p.created_at, p.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS running_bal
      FROM public.meta_dollar_purchases p
     WHERE p.note = 'backfill-phase-4a'
  )
  INSERT INTO public.meta_ad_wallet_ledger (
    ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
    rate_used, source_purchase_id, conversion_source, note, balance_usd_after
  )
  SELECT o.ad_account_id, o.purchase_date, 'purchase', o.usd_amount, o.total_bdt,
         o.effective_rate, o.id, 'fifo', 'backfill-phase-4a', o.running_bal
    FROM ordered o
   WHERE NOT EXISTS (SELECT 1 FROM public.meta_ad_wallet_ledger w WHERE w.source_purchase_id = o.id);

  -- 4) Reset & re-consume
  DELETE FROM public.meta_spend_consumptions WHERE ad_account_id = v_ad_account;

  UPDATE public.meta_fifo_lots
     SET usd_remaining = usd_total, is_active = true
   WHERE ad_account_id = v_ad_account;

  UPDATE public.mkt_insights_daily
     SET spend_bdt_fifo = 0,
         conversion_source = 'fx_fallback',
         estimated_bdt_cost = true
   WHERE account_id = v_ad_account;

  DECLARE r RECORD;
  BEGIN
    FOR r IN
      SELECT id, date, spend
        FROM public.mkt_insights_daily
       WHERE account_id = v_ad_account
         AND spend > 0
       ORDER BY date ASC, id ASC
    LOOP
      PERFORM public.consume_meta_spend_fifo(
        v_ad_account,
        'insight:' || r.id::text,
        r.spend,
        r.date,
        r.id
      );
    END LOOP;
  END;
END $$;