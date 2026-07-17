
-- 1. Cleanup
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC NULLS LAST, id) AS rn
    FROM public.erp_expense_categories
   WHERE brand_id = '1f1f366d-ad85-4513-85ab-2dbb6b23c513'
     AND lower(name) = 'marketing — meta ads'
)
DELETE FROM public.erp_expense_categories c USING ranked r
 WHERE c.id = r.id AND r.rn > 1
   AND NOT EXISTS (SELECT 1 FROM public.erp_transactions t WHERE t.category_id = c.id);

DELETE FROM public.erp_expense_categories c
 WHERE c.brand_id IS NULL
   AND lower(c.name) IN ('marketing','meta ads')
   AND NOT EXISTS (SELECT 1 FROM public.erp_transactions t WHERE t.category_id = c.id);

UPDATE public.erp_expense_categories
   SET excluded_from_pnl = true
 WHERE lower(name) = 'meta ad balance / prepaid marketing'
   AND excluded_from_pnl IS DISTINCT FROM true;

-- 2. System RPC
CREATE OR REPLACE FUNCTION public.post_meta_ad_spend_daily_system(
  _brand_id uuid, _from date, _to date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_category_id uuid;
  v_days_posted int := 0; v_days_updated int := 0; v_days_skipped int := 0;
  v_total_bdt numeric := 0;
  r RECORD; v_existing_id uuid;
BEGIN
  IF _brand_id IS NULL OR _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'brand_id, from, to are required';
  END IF;
  IF _to < _from THEN RAISE EXCEPTION 'to must be >= from'; END IF;

  SELECT id INTO v_category_id
    FROM public.erp_expense_categories
   WHERE brand_id = _brand_id AND kind = 'expense'
     AND lower(name) = 'meta ads expense' AND is_active = true
   ORDER BY created_at ASC LIMIT 1;

  IF v_category_id IS NULL THEN
    INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active)
    VALUES (_brand_id, 'Meta Ads Expense', 'expense', true)
    RETURNING id INTO v_category_id;
  END IF;

  FOR r IN
    SELECT day, spend_bdt, is_estimated
      FROM public.get_meta_spend_bdt(_brand_id, _from, _to)
     WHERE day IS NOT NULL
  LOOP
    IF COALESCE(r.spend_bdt, 0) <= 0 THEN
      v_days_skipped := v_days_skipped + 1; CONTINUE;
    END IF;

    SELECT id INTO v_existing_id
      FROM public.erp_transactions
     WHERE reference_type = 'meta_ad_spend_daily'
       AND brand_id = _brand_id AND transaction_date = r.day LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.erp_transactions (
        brand_id, txn_type, category_id, amount,
        reference_type, reference_id, description, transaction_date, created_by
      ) VALUES (
        _brand_id, 'expense', v_category_id, r.spend_bdt,
        'meta_ad_spend_daily', NULL,
        'Meta Ads daily spend' || CASE WHEN r.is_estimated THEN ' (FX est.)' ELSE ' (FIFO)' END,
        r.day, NULL
      );
      v_days_posted := v_days_posted + 1;
    ELSE
      UPDATE public.erp_transactions
         SET amount = r.spend_bdt, category_id = v_category_id,
             description = 'Meta Ads daily spend' || CASE WHEN r.is_estimated THEN ' (FX est.)' ELSE ' (FIFO)' END,
             updated_at = now()
       WHERE id = v_existing_id AND amount IS DISTINCT FROM r.spend_bdt;
      IF FOUND THEN v_days_updated := v_days_updated + 1; END IF;
    END IF;
    v_total_bdt := v_total_bdt + r.spend_bdt;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'brand_id', _brand_id, 'from', _from, 'to', _to,
    'category_id', v_category_id, 'days_posted', v_days_posted,
    'days_updated', v_days_updated, 'days_skipped_zero', v_days_skipped,
    'total_bdt', v_total_bdt
  );
END; $$;

REVOKE ALL ON FUNCTION public.post_meta_ad_spend_daily_system(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_meta_ad_spend_daily_system(uuid, date, date) TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.post_meta_ad_spend_all_brands(
  _from date DEFAULT (CURRENT_DATE - INTERVAL '3 days')::date,
  _to   date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b RECORD; results jsonb := '[]'::jsonb; one jsonb;
BEGIN
  FOR b IN
    SELECT DISTINCT brand_id FROM public.mkt_insights_daily
     WHERE brand_id IS NOT NULL AND date >= _from AND date <= _to
  LOOP
    one := public.post_meta_ad_spend_daily_system(b.brand_id, _from, _to);
    results := results || jsonb_build_array(one);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'from', _from, 'to', _to, 'brands', results);
END; $$;
REVOKE ALL ON FUNCTION public.post_meta_ad_spend_all_brands(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_meta_ad_spend_all_brands(date, date) TO service_role, postgres;

-- 3. Backfill
DO $$
DECLARE
  hs uuid := '1f1f366d-ad85-4513-85ab-2dbb6b23c513';
  ty uuid := '40abf6fa-404e-4c3f-b0df-f35c1535e95d';
  d1 date; d2 date; res jsonb;
BEGIN
  SELECT MIN(date), MAX(date) INTO d1, d2 FROM public.mkt_insights_daily WHERE brand_id = hs;
  IF d1 IS NOT NULL THEN
    res := public.post_meta_ad_spend_daily_system(hs, d1, d2);
    RAISE NOTICE 'HobbyShop backfill: %', res;
  END IF;
  SELECT MIN(date), MAX(date) INTO d1, d2 FROM public.mkt_insights_daily WHERE brand_id = ty;
  IF d1 IS NOT NULL THEN
    res := public.post_meta_ad_spend_daily_system(ty, d1, d2);
    RAISE NOTICE 'Toyora backfill: %', res;
  END IF;
END $$;

-- 4. Daily cron 03:30 UTC, rolling last 5 days
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-ad-spend-post-daily') THEN
    PERFORM cron.unschedule('meta-ad-spend-post-daily');
  END IF;
  PERFORM cron.schedule(
    'meta-ad-spend-post-daily',
    '30 3 * * *',
    $cron$ SELECT public.post_meta_ad_spend_all_brands((CURRENT_DATE - INTERVAL '5 days')::date, CURRENT_DATE); $cron$
  );
END $$;
