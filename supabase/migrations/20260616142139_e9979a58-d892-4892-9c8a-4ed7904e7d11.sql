
-- Job log table
CREATE TABLE IF NOT EXISTS public.marketing_rebuild_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  range_from date NOT NULL,
  range_to date NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',
  orders_processed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.marketing_rebuild_jobs TO authenticated;
GRANT ALL ON public.marketing_rebuild_jobs TO service_role;

ALTER TABLE public.marketing_rebuild_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_rebuild_jobs" ON public.marketing_rebuild_jobs
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'operations'::app_role)
    OR public.has_role(auth.uid(),'accountant'::app_role)
  );

CREATE POLICY "staff_insert_rebuild_jobs" ON public.marketing_rebuild_jobs
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'operations'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_rebuild_jobs_brand_started
  ON public.marketing_rebuild_jobs(brand_id, started_at DESC);

CREATE TRIGGER trg_mkt_jobs_updated
  BEFORE UPDATE ON public.marketing_rebuild_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Orchestrator
CREATE OR REPLACE FUNCTION public.mkt_rebuild_window(
  p_brand_id uuid,
  p_days integer DEFAULT 2,
  p_trigger text DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := (now() - make_interval(days => GREATEST(p_days,1)))::date;
  v_to   date := now()::date;
  v_count integer := 0;
  v_job_id uuid;
  v_order_id uuid;
BEGIN
  INSERT INTO public.marketing_rebuild_jobs(brand_id, range_from, range_to, trigger, status)
    VALUES (p_brand_id, v_from, v_to, p_trigger, 'running')
    RETURNING id INTO v_job_id;

  BEGIN
    FOR v_order_id IN
      SELECT id FROM public.orders
       WHERE (p_brand_id IS NULL OR brand_id = p_brand_id)
         AND created_at >= v_from::timestamptz
         AND created_at <  (v_to + 1)::timestamptz
    LOOP
      PERFORM public.rebuild_order_attribution(v_order_id);
      PERFORM public.rebuild_marketing_profit_snapshot(v_order_id);
      v_count := v_count + 1;
    END LOOP;

    UPDATE public.marketing_rebuild_jobs
       SET orders_processed=v_count, status='success', finished_at=now()
     WHERE id=v_job_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.marketing_rebuild_jobs
       SET status='error', error=SQLERRM, finished_at=now(), orders_processed=v_count
     WHERE id=v_job_id;
    RAISE;
  END;

  RETURN jsonb_build_object('ok',true,'job_id',v_job_id,'orders_processed',v_count,'range_from',v_from,'range_to',v_to);
END;
$$;

REVOKE ALL ON FUNCTION public.mkt_rebuild_window(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_rebuild_window(uuid, integer, text) TO authenticated, service_role;

-- Campaign × day rollup
CREATE OR REPLACE FUNCTION public.mkt_get_campaign_daily_rollup(
  p_brand_id uuid, p_from date, p_to date
) RETURNS TABLE (
  day date, campaign_id uuid, external_campaign_id text, campaign_name text,
  ad_spend numeric, impressions bigint, clicks bigint,
  orders_attributed bigint, delivered_orders bigint, returned_orders bigint, cancelled_orders bigint,
  gross_revenue numeric, net_revenue numeric, net_profit numeric,
  real_roas numeric, poas numeric, delivery_rate numeric, return_rate numeric, health text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH spend AS (
    SELECT i.date::date AS day, c.id AS campaign_id, c.external_campaign_id, c.name AS campaign_name,
           SUM(COALESCE(i.spend,0)) AS ad_spend,
           SUM(COALESCE(i.impressions,0)) AS impressions,
           SUM(COALESCE(i.clicks,0)) AS clicks
      FROM public.marketing_insights_daily i
      JOIN public.marketing_campaigns c ON c.id=i.campaign_id
     WHERE i.brand_id=p_brand_id AND i.date BETWEEN p_from AND p_to AND i.level='campaign'
     GROUP BY 1,2,3,4
  ),
  ord AS (
    SELECT s.order_created_at::date AS day, c.id AS campaign_id, c.external_campaign_id, c.name AS campaign_name,
           COUNT(*) AS orders_attributed,
           COUNT(*) FILTER (WHERE s.is_delivered) AS delivered_orders,
           COUNT(*) FILTER (WHERE s.is_returned)  AS returned_orders,
           COUNT(*) FILTER (WHERE s.is_cancelled) AS cancelled_orders,
           SUM(COALESCE(s.gross_sales,0)) AS gross_revenue,
           SUM(COALESCE(s.net_sales,0))   AS net_revenue,
           SUM(COALESCE(s.net_profit_after_ads,0)) AS net_profit
      FROM public.marketing_order_profit_snapshots s
      JOIN public.marketing_campaigns c ON c.id=s.campaign_id
     WHERE s.brand_id=p_brand_id AND s.order_created_at::date BETWEEN p_from AND p_to
     GROUP BY 1,2,3,4
  ),
  j AS (
    SELECT COALESCE(sp.day,o.day) AS day,
           COALESCE(sp.campaign_id,o.campaign_id) AS campaign_id,
           COALESCE(sp.external_campaign_id,o.external_campaign_id) AS external_campaign_id,
           COALESCE(sp.campaign_name,o.campaign_name) AS campaign_name,
           COALESCE(sp.ad_spend,0) AS ad_spend,
           COALESCE(sp.impressions,0)::bigint AS impressions,
           COALESCE(sp.clicks,0)::bigint AS clicks,
           COALESCE(o.orders_attributed,0)::bigint AS orders_attributed,
           COALESCE(o.delivered_orders,0)::bigint AS delivered_orders,
           COALESCE(o.returned_orders,0)::bigint AS returned_orders,
           COALESCE(o.cancelled_orders,0)::bigint AS cancelled_orders,
           COALESCE(o.gross_revenue,0) AS gross_revenue,
           COALESCE(o.net_revenue,0) AS net_revenue,
           COALESCE(o.net_profit,0) AS net_profit
      FROM spend sp FULL OUTER JOIN ord o
        ON sp.day=o.day AND sp.campaign_id=o.campaign_id
  )
  SELECT j.day, j.campaign_id, j.external_campaign_id, j.campaign_name,
         j.ad_spend, j.impressions, j.clicks,
         j.orders_attributed, j.delivered_orders, j.returned_orders, j.cancelled_orders,
         j.gross_revenue, j.net_revenue, j.net_profit,
         CASE WHEN j.ad_spend>0 THEN ROUND(j.net_revenue/j.ad_spend,3) END AS real_roas,
         CASE WHEN j.ad_spend>0 THEN ROUND(j.net_profit/j.ad_spend,3) END AS poas,
         CASE WHEN j.orders_attributed>0 THEN ROUND(j.delivered_orders::numeric/j.orders_attributed,3) END AS delivery_rate,
         CASE WHEN j.delivered_orders>0 THEN ROUND(j.returned_orders::numeric/j.delivered_orders,3) END AS return_rate,
         CASE
           WHEN j.ad_spend=0 AND j.orders_attributed=0 THEN 'idle'
           WHEN j.ad_spend>0 AND j.orders_attributed=0 THEN 'no_orders'
           WHEN j.orders_attributed>0 AND j.delivered_orders::numeric/j.orders_attributed<0.4 THEN 'low_delivery'
           WHEN j.delivered_orders>0 AND j.returned_orders::numeric/j.delivered_orders>0.25 THEN 'high_return'
           WHEN j.ad_spend>0 AND j.net_profit<0 THEN 'losing'
           WHEN j.ad_spend>0 AND j.net_profit>0 THEN 'profitable'
           ELSE 'unknown'
         END AS health
    FROM j
   ORDER BY j.day DESC, j.ad_spend DESC NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.mkt_get_campaign_daily_rollup(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_get_campaign_daily_rollup(uuid, date, date) TO authenticated, service_role;

-- Overview KPIs
CREATE OR REPLACE FUNCTION public.mkt_get_overview_kpis(
  p_brand_id uuid, p_from date, p_to date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH spend AS (
    SELECT COALESCE(SUM(spend),0) AS ad_spend,
           COALESCE(SUM(impressions),0)::bigint AS impressions,
           COALESCE(SUM(clicks),0)::bigint AS clicks
      FROM public.marketing_insights_daily
     WHERE brand_id=p_brand_id AND level='campaign' AND date BETWEEN p_from AND p_to
  ),
  snaps AS (
    SELECT COUNT(*) AS attributed_orders,
           COUNT(*) FILTER (WHERE is_delivered) AS delivered_orders,
           COUNT(*) FILTER (WHERE is_returned)  AS returned_orders,
           COALESCE(SUM(net_sales),0) AS net_revenue,
           COALESCE(SUM(gross_sales),0) AS gross_revenue,
           COALESCE(SUM(net_profit_after_ads),0) AS net_profit
      FROM public.marketing_order_profit_snapshots
     WHERE brand_id=p_brand_id AND order_created_at::date BETWEEN p_from AND p_to
  ),
  all_orders AS (
    SELECT COUNT(*) AS total_orders
      FROM public.orders
     WHERE brand_id=p_brand_id AND created_at::date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'ad_spend', s.ad_spend, 'impressions', s.impressions, 'clicks', s.clicks,
    'attributed_orders', sn.attributed_orders,
    'total_orders', ao.total_orders,
    'attribution_coverage', CASE WHEN ao.total_orders>0 THEN ROUND(sn.attributed_orders::numeric/ao.total_orders,3) ELSE 0 END,
    'delivered_orders', sn.delivered_orders, 'returned_orders', sn.returned_orders,
    'gross_revenue', sn.gross_revenue, 'net_revenue', sn.net_revenue, 'net_profit', sn.net_profit,
    'real_roas', CASE WHEN s.ad_spend>0 THEN ROUND(sn.net_revenue/s.ad_spend,3) END,
    'poas',      CASE WHEN s.ad_spend>0 THEN ROUND(sn.net_profit/s.ad_spend,3) END,
    'delivery_rate', CASE WHEN sn.attributed_orders>0 THEN ROUND(sn.delivered_orders::numeric/sn.attributed_orders,3) END,
    'return_rate',   CASE WHEN sn.delivered_orders>0 THEN ROUND(sn.returned_orders::numeric/sn.delivered_orders,3) END,
    'range_from', p_from, 'range_to', p_to
  )
  FROM spend s, snaps sn, all_orders ao
$$;

REVOKE ALL ON FUNCTION public.mkt_get_overview_kpis(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_get_overview_kpis(uuid, date, date) TO authenticated, service_role;
