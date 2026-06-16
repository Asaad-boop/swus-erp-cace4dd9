ALTER TABLE public.erp_product_expense_allocations
  ADD COLUMN IF NOT EXISTS allocation_date date,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.mkt_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mkt_ad_account_id uuid REFERENCES public.mkt_ad_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_prod_expense_alloc_meta_auto
  ON public.erp_product_expense_allocations(source, mkt_ad_account_id, campaign_id, allocation_date)
  WHERE expense_type = 'meta_ads';

CREATE INDEX IF NOT EXISTS idx_prod_expense_alloc_product_date
  ON public.erp_product_expense_allocations(brand_id, product_id, allocation_date);

CREATE OR REPLACE FUNCTION public.rebuild_meta_product_allocations_for_campaign(
  p_campaign_id uuid,
  p_since date DEFAULT NULL,
  p_until date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_brand_id uuid;
  v_account_id uuid;
  v_account_name text;
  v_currency text;
  v_fx numeric;
  v_from date;
  v_to date;
BEGIN
  SELECT c.brand_id, c.account_id, c.name, upper(coalesce(a.currency, 'USD')), coalesce(a.usd_to_bdt_rate, 110)
    INTO v_brand_id, v_account_id, v_account_name, v_currency, v_fx
  FROM public.mkt_campaigns c
  LEFT JOIN public.mkt_ad_accounts a ON a.id = c.account_id
  WHERE c.id = p_campaign_id;

  IF v_brand_id IS NULL THEN
    RETURN;
  END IF;

  SELECT min(i.date), max(i.date)
    INTO v_from, v_to
  FROM public.mkt_insights_daily i
  WHERE i.campaign_id = p_campaign_id
    AND (p_since IS NULL OR i.date >= p_since)
    AND (p_until IS NULL OR i.date <= p_until);

  v_from := coalesce(p_since, v_from);
  v_to := coalesce(p_until, v_to);

  IF v_from IS NULL OR v_to IS NULL THEN
    DELETE FROM public.erp_product_expense_allocations
    WHERE source = 'meta_auto'
      AND expense_type = 'meta_ads'
      AND campaign_id = p_campaign_id;
    RETURN;
  END IF;

  DELETE FROM public.erp_product_expense_allocations
  WHERE source = 'meta_auto'
    AND expense_type = 'meta_ads'
    AND campaign_id = p_campaign_id
    AND allocation_date BETWEEN v_from AND v_to;

  INSERT INTO public.erp_product_expense_allocations (
    brand_id,
    product_id,
    campaign_id,
    mkt_ad_account_id,
    allocation_date,
    expense_transaction_id,
    expense_type,
    amount,
    allocation_method,
    source,
    note,
    created_at
  )
  WITH weights AS (
    SELECT cp.product_id, GREATEST(coalesce(cp.weight, 1), 0) AS weight
    FROM public.mkt_campaign_products cp
    WHERE cp.campaign_id = p_campaign_id
  ), total_weight AS (
    SELECT nullif(sum(weight), 0) AS total_weight FROM weights
  ), daily AS (
    SELECT i.date, i.campaign_id, i.account_id, sum(coalesce(i.spend, 0)) AS spend_usd
    FROM public.mkt_insights_daily i
    WHERE i.campaign_id = p_campaign_id
      AND i.date BETWEEN v_from AND v_to
    GROUP BY i.date, i.campaign_id, i.account_id
  ), finance AS (
    SELECT me.date, max(me.transaction_id) AS transaction_id
    FROM public.mkt_manual_expenses me
    WHERE me.source = 'meta_auto'
      AND me.mkt_ad_account_id = v_account_id
      AND me.date BETWEEN v_from AND v_to
    GROUP BY me.date
  )
  SELECT
    v_brand_id,
    w.product_id,
    d.campaign_id,
    v_account_id,
    d.date,
    f.transaction_id,
    'meta_ads',
    round((d.spend_usd * CASE WHEN v_currency = 'BDT' THEN 1 ELSE v_fx END * w.weight / tw.total_weight)::numeric, 2),
    'campaign_weight',
    'meta_auto',
    'Meta spend — ' || coalesce(v_account_name, 'Campaign') || ' — ' || d.date::text,
    d.date::timestamptz
  FROM daily d
  CROSS JOIN weights w
  CROSS JOIN total_weight tw
  LEFT JOIN finance f ON f.date = d.date
  WHERE tw.total_weight IS NOT NULL
    AND w.weight > 0
    AND d.spend_usd > 0
    AND round((d.spend_usd * CASE WHEN v_currency = 'BDT' THEN 1 ELSE v_fx END * w.weight / tw.total_weight)::numeric, 2) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_meta_product_allocations_for_campaign(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_meta_product_allocations_for_campaign(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.rebuild_meta_product_allocations_for_campaign(uuid, date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_meta_product_allocations_for_campaign(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_refresh_meta_allocations_on_campaign_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.rebuild_meta_product_allocations_for_campaign(OLD.campaign_id, NULL, NULL);
    RETURN OLD;
  END IF;

  PERFORM public.rebuild_meta_product_allocations_for_campaign(NEW.campaign_id, NULL, NULL);
  IF TG_OP = 'UPDATE' AND OLD.campaign_id IS DISTINCT FROM NEW.campaign_id THEN
    PERFORM public.rebuild_meta_product_allocations_for_campaign(OLD.campaign_id, NULL, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_meta_allocations_on_campaign_product ON public.mkt_campaign_products;
CREATE TRIGGER refresh_meta_allocations_on_campaign_product
AFTER INSERT OR UPDATE OR DELETE ON public.mkt_campaign_products
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_meta_allocations_on_campaign_product();

CREATE OR REPLACE FUNCTION public.trg_refresh_meta_allocations_on_insight()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.campaign_id IS NOT NULL THEN
      PERFORM public.rebuild_meta_product_allocations_for_campaign(OLD.campaign_id, OLD.date, OLD.date);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.campaign_id IS NOT NULL THEN
    PERFORM public.rebuild_meta_product_allocations_for_campaign(NEW.campaign_id, NEW.date, NEW.date);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.campaign_id IS DISTINCT FROM NEW.campaign_id AND OLD.campaign_id IS NOT NULL THEN
    PERFORM public.rebuild_meta_product_allocations_for_campaign(OLD.campaign_id, OLD.date, OLD.date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_meta_allocations_on_insight ON public.mkt_insights_daily;
CREATE TRIGGER refresh_meta_allocations_on_insight
AFTER INSERT OR UPDATE OR DELETE ON public.mkt_insights_daily
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_meta_allocations_on_insight();