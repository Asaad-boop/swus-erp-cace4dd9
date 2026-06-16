
-- Phase 7: Marketing analytics RPCs (campaigns/adsets/ads list+detail, attribution explorer, product×campaign, courier×campaign)

-- List campaigns with aggregated KPIs
CREATE OR REPLACE FUNCTION public.mkt_list_campaigns(p_brand_id uuid, p_from date, p_to date)
RETURNS TABLE(
  campaign_id uuid, external_campaign_id text, name text, objective text,
  status text, effective_status text,
  ad_spend numeric, impressions bigint, clicks bigint,
  orders_attributed bigint, delivered_orders bigint, returned_orders bigint,
  net_revenue numeric, net_profit numeric,
  real_roas numeric, poas numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH spend AS (
    SELECT campaign_id, SUM(spend) AS spend, SUM(impressions) AS imp, SUM(clicks) AS clk
    FROM marketing_insights_daily
    WHERE brand_id = p_brand_id AND level='campaign' AND date BETWEEN p_from AND p_to AND campaign_id IS NOT NULL
    GROUP BY campaign_id
  ),
  prof AS (
    SELECT s.campaign_id,
      COUNT(*) AS orders_attributed,
      COUNT(*) FILTER (WHERE s.is_delivered) AS delivered_orders,
      COUNT(*) FILTER (WHERE s.is_returned) AS returned_orders,
      SUM(s.net_sales) AS net_revenue,
      SUM(s.net_profit_after_ads) AS net_profit
    FROM marketing_order_profit_snapshots s
    WHERE s.brand_id = p_brand_id AND s.campaign_id IS NOT NULL
      AND s.order_created_at::date BETWEEN p_from AND p_to
    GROUP BY s.campaign_id
  )
  SELECT c.id, c.external_campaign_id, c.name, c.objective, c.status, c.effective_status,
    COALESCE(sp.spend,0), COALESCE(sp.imp,0)::bigint, COALESCE(sp.clk,0)::bigint,
    COALESCE(pr.orders_attributed,0)::bigint,
    COALESCE(pr.delivered_orders,0)::bigint,
    COALESCE(pr.returned_orders,0)::bigint,
    COALESCE(pr.net_revenue,0),
    COALESCE(pr.net_profit,0),
    CASE WHEN COALESCE(sp.spend,0)>0 THEN ROUND(COALESCE(pr.net_revenue,0)/sp.spend,4) END,
    CASE WHEN COALESCE(sp.spend,0)>0 THEN ROUND(COALESCE(pr.net_profit,0)/sp.spend,4) END
  FROM marketing_campaigns c
  LEFT JOIN spend sp ON sp.campaign_id = c.id
  LEFT JOIN prof pr ON pr.campaign_id = c.id
  WHERE c.brand_id = p_brand_id
    AND (sp.spend IS NOT NULL OR pr.orders_attributed IS NOT NULL OR c.effective_status IN ('ACTIVE','PAUSED'))
  ORDER BY COALESCE(sp.spend,0) DESC, c.name;
$$;

-- List adsets under a campaign
CREATE OR REPLACE FUNCTION public.mkt_list_adsets(p_brand_id uuid, p_campaign_id uuid, p_from date, p_to date)
RETURNS TABLE(
  adset_id uuid, external_adset_id text, name text, status text, effective_status text,
  daily_budget numeric, lifetime_budget numeric,
  ad_spend numeric, impressions bigint, clicks bigint,
  orders_attributed bigint, delivered_orders bigint, net_revenue numeric, net_profit numeric,
  real_roas numeric, poas numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH spend AS (
    SELECT adset_id, SUM(spend) AS spend, SUM(impressions) AS imp, SUM(clicks) AS clk
    FROM marketing_insights_daily
    WHERE brand_id=p_brand_id AND level='adset' AND date BETWEEN p_from AND p_to
      AND campaign_id=p_campaign_id AND adset_id IS NOT NULL
    GROUP BY adset_id
  ),
  prof AS (
    SELECT s.adset_id,
      COUNT(*) AS orders_attributed,
      COUNT(*) FILTER (WHERE s.is_delivered) AS delivered_orders,
      SUM(s.net_sales) AS net_revenue,
      SUM(s.net_profit_after_ads) AS net_profit
    FROM marketing_order_profit_snapshots s
    WHERE s.brand_id=p_brand_id AND s.campaign_id=p_campaign_id AND s.adset_id IS NOT NULL
      AND s.order_created_at::date BETWEEN p_from AND p_to
    GROUP BY s.adset_id
  )
  SELECT a.id, a.external_adset_id, a.name, a.status, a.effective_status, a.daily_budget, a.lifetime_budget,
    COALESCE(sp.spend,0), COALESCE(sp.imp,0)::bigint, COALESCE(sp.clk,0)::bigint,
    COALESCE(pr.orders_attributed,0)::bigint, COALESCE(pr.delivered_orders,0)::bigint,
    COALESCE(pr.net_revenue,0), COALESCE(pr.net_profit,0),
    CASE WHEN COALESCE(sp.spend,0)>0 THEN ROUND(COALESCE(pr.net_revenue,0)/sp.spend,4) END,
    CASE WHEN COALESCE(sp.spend,0)>0 THEN ROUND(COALESCE(pr.net_profit,0)/sp.spend,4) END
  FROM marketing_adsets a
  LEFT JOIN spend sp ON sp.adset_id=a.id
  LEFT JOIN prof pr ON pr.adset_id=a.id
  WHERE a.brand_id=p_brand_id AND a.campaign_id=p_campaign_id
  ORDER BY COALESCE(sp.spend,0) DESC, a.name;
$$;

-- List ads under an adset
CREATE OR REPLACE FUNCTION public.mkt_list_ads(p_brand_id uuid, p_adset_id uuid, p_from date, p_to date)
RETURNS TABLE(
  ad_id uuid, external_ad_id text, name text, status text, effective_status text,
  creative_name text, thumbnail_url text, preview_url text,
  ad_spend numeric, impressions bigint, clicks bigint,
  orders_attributed bigint, delivered_orders bigint, net_revenue numeric, net_profit numeric,
  real_roas numeric, poas numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH spend AS (
    SELECT ad_id, SUM(spend) AS spend, SUM(impressions) AS imp, SUM(clicks) AS clk
    FROM marketing_insights_daily
    WHERE brand_id=p_brand_id AND level='ad' AND date BETWEEN p_from AND p_to
      AND adset_id=p_adset_id AND ad_id IS NOT NULL
    GROUP BY ad_id
  ),
  prof AS (
    SELECT s.ad_id,
      COUNT(*) AS orders_attributed,
      COUNT(*) FILTER (WHERE s.is_delivered) AS delivered_orders,
      SUM(s.net_sales) AS net_revenue,
      SUM(s.net_profit_after_ads) AS net_profit
    FROM marketing_order_profit_snapshots s
    WHERE s.brand_id=p_brand_id AND s.adset_id=p_adset_id AND s.ad_id IS NOT NULL
      AND s.order_created_at::date BETWEEN p_from AND p_to
    GROUP BY s.ad_id
  )
  SELECT ad.id, ad.external_ad_id, ad.name, ad.status, ad.effective_status,
    ad.creative_name, ad.thumbnail_url, ad.preview_url,
    COALESCE(sp.spend,0), COALESCE(sp.imp,0)::bigint, COALESCE(sp.clk,0)::bigint,
    COALESCE(pr.orders_attributed,0)::bigint, COALESCE(pr.delivered_orders,0)::bigint,
    COALESCE(pr.net_revenue,0), COALESCE(pr.net_profit,0),
    CASE WHEN COALESCE(sp.spend,0)>0 THEN ROUND(COALESCE(pr.net_revenue,0)/sp.spend,4) END,
    CASE WHEN COALESCE(sp.spend,0)>0 THEN ROUND(COALESCE(pr.net_profit,0)/sp.spend,4) END
  FROM marketing_ads ad
  LEFT JOIN spend sp ON sp.ad_id=ad.id
  LEFT JOIN prof pr ON pr.ad_id=ad.id
  WHERE ad.brand_id=p_brand_id AND ad.adset_id=p_adset_id
  ORDER BY COALESCE(sp.spend,0) DESC, ad.name;
$$;

-- Attribution explorer: per-order rows with source/campaign + profit
CREATE OR REPLACE FUNCTION public.mkt_attribution_explorer(
  p_brand_id uuid, p_from date, p_to date,
  p_source text DEFAULT NULL, p_campaign_id uuid DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE(
  order_id uuid, order_created_at timestamptz,
  source text, medium text, campaign_name text, adset_name text, ad_name text,
  campaign_id uuid, adset_id uuid, ad_id uuid,
  is_delivered boolean, is_returned boolean, order_status text,
  net_sales numeric, net_profit numeric, allocated_ad_spend numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT s.order_id, s.order_created_at,
    a.source, a.medium,
    c.name, ast.name, ad.name,
    s.campaign_id, s.adset_id, s.ad_id,
    s.is_delivered, s.is_returned, s.order_status,
    s.net_sales, s.net_profit_after_ads, s.allocated_ad_spend
  FROM marketing_order_profit_snapshots s
  LEFT JOIN marketing_order_attributions a ON a.id = s.attribution_id
  LEFT JOIN marketing_campaigns c ON c.id = s.campaign_id
  LEFT JOIN marketing_adsets ast ON ast.id = s.adset_id
  LEFT JOIN marketing_ads ad ON ad.id = s.ad_id
  WHERE s.brand_id = p_brand_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
    AND (p_source IS NULL OR a.source = p_source)
    AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id)
  ORDER BY s.order_created_at DESC
  LIMIT p_limit;
$$;

-- Product × Campaign report
CREATE OR REPLACE FUNCTION public.mkt_product_campaign_report(p_brand_id uuid, p_from date, p_to date)
RETURNS TABLE(
  product_id uuid, product_name text,
  campaign_id uuid, campaign_name text,
  units_sold bigint, gross_revenue numeric, product_cost numeric,
  delivered_units bigint, returned_units bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT oi.product_id,
    MAX(oi.name) AS product_name,
    s.campaign_id,
    MAX(c.name) AS campaign_name,
    SUM(oi.quantity)::bigint AS units_sold,
    SUM(oi.line_total) AS gross_revenue,
    SUM(COALESCE(oi.unit_cost_snapshot, oi.cost_price, 0) * oi.quantity) AS product_cost,
    SUM(CASE WHEN s.is_delivered THEN oi.quantity ELSE 0 END)::bigint AS delivered_units,
    SUM(CASE WHEN s.is_returned THEN oi.quantity ELSE 0 END)::bigint AS returned_units
  FROM marketing_order_profit_snapshots s
  JOIN order_items oi ON oi.order_id = s.order_id
  LEFT JOIN marketing_campaigns c ON c.id = s.campaign_id
  WHERE s.brand_id = p_brand_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id, s.campaign_id
  ORDER BY SUM(oi.line_total) DESC NULLS LAST
  LIMIT 500;
$$;

-- Courier × Campaign report
CREATE OR REPLACE FUNCTION public.mkt_courier_campaign_report(p_brand_id uuid, p_from date, p_to date)
RETURNS TABLE(
  courier_provider text,
  campaign_id uuid, campaign_name text,
  total_orders bigint, delivered_orders bigint, returned_orders bigint,
  delivery_rate numeric, return_rate numeric,
  net_revenue numeric, net_profit numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH base AS (
    SELECT s.order_id, s.campaign_id, s.is_delivered, s.is_returned, s.net_sales, s.net_profit_after_ads,
      (SELECT cs.provider FROM courier_shipments cs WHERE cs.order_id=s.order_id ORDER BY cs.created_at DESC LIMIT 1) AS provider
    FROM marketing_order_profit_snapshots s
    WHERE s.brand_id=p_brand_id AND s.order_created_at::date BETWEEN p_from AND p_to
  )
  SELECT COALESCE(b.provider,'(none)'),
    b.campaign_id,
    MAX(c.name),
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE b.is_delivered)::bigint,
    COUNT(*) FILTER (WHERE b.is_returned)::bigint,
    CASE WHEN COUNT(*)>0 THEN ROUND(COUNT(*) FILTER (WHERE b.is_delivered)::numeric / COUNT(*), 4) END,
    CASE WHEN COUNT(*)>0 THEN ROUND(COUNT(*) FILTER (WHERE b.is_returned)::numeric / COUNT(*), 4) END,
    SUM(b.net_sales),
    SUM(b.net_profit_after_ads)
  FROM base b
  LEFT JOIN marketing_campaigns c ON c.id=b.campaign_id
  GROUP BY b.provider, b.campaign_id
  ORDER BY COUNT(*) DESC
  LIMIT 500;
$$;

-- Detail header for a campaign
CREATE OR REPLACE FUNCTION public.mkt_campaign_summary(p_brand_id uuid, p_campaign_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH spend AS (
    SELECT SUM(spend) s, SUM(impressions) i, SUM(clicks) ck
    FROM marketing_insights_daily
    WHERE brand_id=p_brand_id AND level='campaign' AND campaign_id=p_campaign_id AND date BETWEEN p_from AND p_to
  ),
  prof AS (
    SELECT COUNT(*) o, COUNT(*) FILTER (WHERE is_delivered) d, COUNT(*) FILTER (WHERE is_returned) r,
      SUM(net_sales) nr, SUM(net_profit_after_ads) np
    FROM marketing_order_profit_snapshots
    WHERE brand_id=p_brand_id AND campaign_id=p_campaign_id AND order_created_at::date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'campaign', (SELECT to_jsonb(c) FROM marketing_campaigns c WHERE c.id=p_campaign_id),
    'ad_spend', COALESCE((SELECT s FROM spend),0),
    'impressions', COALESCE((SELECT i FROM spend),0),
    'clicks', COALESCE((SELECT ck FROM spend),0),
    'orders_attributed', COALESCE((SELECT o FROM prof),0),
    'delivered_orders', COALESCE((SELECT d FROM prof),0),
    'returned_orders', COALESCE((SELECT r FROM prof),0),
    'net_revenue', COALESCE((SELECT nr FROM prof),0),
    'net_profit', COALESCE((SELECT np FROM prof),0)
  );
$$;
