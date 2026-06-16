
-- =========================================================================
-- PHASE 2 — Marketing Intelligence: DB Functions & RPC
-- =========================================================================

-- ---------- helper: normalize Bangladeshi mobile to 11 digits ----------
CREATE OR REPLACE FUNCTION public.normalize_mobile_bd(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(p_phone, '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  -- strip leading 88 (country code) if length 13
  IF length(d) = 13 AND left(d, 2) = '88' THEN d := substr(d, 3); END IF;
  -- strip leading 880
  IF length(d) = 13 AND left(d, 3) = '880' THEN d := substr(d, 4); END IF;
  -- already 11 digits starting with 01
  IF length(d) = 11 AND left(d, 2) = '01' THEN RETURN d; END IF;
  -- 10 digits starting with 1 → prefix 0
  IF length(d) = 10 AND left(d, 1) = '1' THEN RETURN '0' || d; END IF;
  RETURN d;
END $$;
GRANT EXECUTE ON FUNCTION public.normalize_mobile_bd(text) TO authenticated, anon, service_role;

-- ---------- helper: has_brand_access ----------
CREATE OR REPLACE FUNCTION public.has_brand_access(_brand_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'operations'::app_role)
    OR public.has_role(_user_id, 'customer_service'::app_role)
    OR public.has_role(_user_id, 'accountant'::app_role);
$$;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated, service_role;

-- ---------- helper: staff guard ----------
CREATE OR REPLACE FUNCTION public._mkt_require_staff()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operations'::app_role)
    OR public.has_role(auth.uid(), 'customer_service'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: staff role required';
  END IF;
END $$;

-- =========================================================================
-- ATTRIBUTION ENGINE
-- =========================================================================

CREATE OR REPLACE FUNCTION public.rebuild_order_attribution(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        record;
  v_session      record;
  v_window_days  integer;
  v_mobile       text;
  v_existing     record;
  v_attr_id      uuid;
  v_attr_type    text;
  v_confidence   integer;
  v_campaign_id  uuid;
  v_adset_id     uuid;
  v_ad_id        uuid;
BEGIN
  SELECT id, brand_id, user_id, shipping_phone, guest_phone, alternate_phone,
         created_at
  INTO v_order
  FROM public.orders WHERE id = p_order_id;

  IF v_order.id IS NULL THEN RETURN NULL; END IF;
  IF v_order.brand_id IS NULL THEN RETURN NULL; END IF;

  -- Preserve manual attribution if exists
  SELECT * INTO v_existing FROM public.marketing_order_attributions
   WHERE order_id = p_order_id AND is_primary;
  IF v_existing.id IS NOT NULL AND v_existing.attribution_type = 'manual' THEN
    RETURN v_existing.id;
  END IF;

  SELECT COALESCE(attribution_window_days, 7) INTO v_window_days
  FROM public.marketing_cost_rules WHERE brand_id = v_order.brand_id;
  v_window_days := COALESCE(v_window_days, 7);

  v_mobile := public.normalize_mobile_bd(
    COALESCE(v_order.shipping_phone, v_order.guest_phone, v_order.alternate_phone)
  );

  v_session := NULL;

  -- Tier 1: session match by mobile within window
  IF v_mobile IS NOT NULL THEN
    SELECT * INTO v_session FROM public.marketing_sessions s
     WHERE s.mobile_normalized = v_mobile
       AND s.last_seen_at <= v_order.created_at
       AND s.last_seen_at >= v_order.created_at - (v_window_days || ' days')::interval
       AND (s.meta_campaign_id IS NOT NULL OR s.utm_campaign IS NOT NULL OR s.fbclid IS NOT NULL)
     ORDER BY s.last_seen_at DESC
     LIMIT 1;
    IF v_session.id IS NOT NULL THEN
      v_attr_type := 'session_match';
      v_confidence := 80;
    END IF;
  END IF;

  -- Tier 2: customer match by user_id within window
  IF v_session.id IS NULL AND v_order.user_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.marketing_sessions s
     WHERE s.customer_id = v_order.user_id
       AND s.last_seen_at <= v_order.created_at
       AND s.last_seen_at >= v_order.created_at - (v_window_days || ' days')::interval
       AND (s.meta_campaign_id IS NOT NULL OR s.utm_campaign IS NOT NULL OR s.fbclid IS NOT NULL)
     ORDER BY s.last_seen_at DESC
     LIMIT 1;
    IF v_session.id IS NOT NULL THEN
      v_attr_type := 'customer_match';
      v_confidence := 60;
    END IF;
  END IF;

  -- Resolve internal campaign/adset/ad ids if we have externals
  IF v_session.id IS NOT NULL THEN
    SELECT id INTO v_campaign_id FROM public.marketing_campaigns
      WHERE brand_id = v_order.brand_id AND external_campaign_id = v_session.meta_campaign_id LIMIT 1;
    SELECT id INTO v_adset_id    FROM public.marketing_adsets
      WHERE brand_id = v_order.brand_id AND external_adset_id    = v_session.meta_adset_id    LIMIT 1;
    SELECT id INTO v_ad_id       FROM public.marketing_ads
      WHERE brand_id = v_order.brand_id AND external_ad_id       = v_session.meta_ad_id       LIMIT 1;
  END IF;

  -- Upsert primary attribution row
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.marketing_order_attributions SET
      platform              = COALESCE(CASE WHEN v_session.meta_campaign_id IS NOT NULL THEN 'meta' ELSE v_session.utm_source END, 'unknown'),
      source                = v_session.utm_source,
      medium                = v_session.utm_medium,
      campaign_id           = v_campaign_id,
      adset_id              = v_adset_id,
      ad_id                 = v_ad_id,
      external_campaign_id  = v_session.meta_campaign_id,
      external_adset_id     = v_session.meta_adset_id,
      external_ad_id        = v_session.meta_ad_id,
      campaign_name_snapshot= v_session.meta_campaign_name,
      adset_name_snapshot   = v_session.meta_adset_name,
      ad_name_snapshot      = v_session.meta_ad_name,
      placement             = v_session.meta_placement,
      session_id            = v_session.session_id,
      fbclid                = v_session.fbclid,
      fbc                   = v_session.fbc,
      fbp                   = v_session.fbp,
      landing_page          = v_session.landing_page,
      attribution_type      = COALESCE(v_attr_type, 'unknown'),
      confidence_score      = COALESCE(v_confidence, 0),
      click_time            = v_session.last_seen_at,
      order_time            = v_order.created_at,
      updated_at            = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_attr_id;
  ELSE
    INSERT INTO public.marketing_order_attributions (
      brand_id, order_id, customer_id, mobile_normalized, platform,
      source, medium, campaign_id, adset_id, ad_id,
      external_campaign_id, external_adset_id, external_ad_id,
      campaign_name_snapshot, adset_name_snapshot, ad_name_snapshot,
      placement, session_id, fbclid, fbc, fbp, landing_page,
      attribution_type, confidence_score, click_time, order_time, is_primary
    ) VALUES (
      v_order.brand_id, p_order_id, v_order.user_id, v_mobile,
      COALESCE(CASE WHEN v_session.meta_campaign_id IS NOT NULL THEN 'meta' ELSE v_session.utm_source END, 'unknown'),
      v_session.utm_source, v_session.utm_medium,
      v_campaign_id, v_adset_id, v_ad_id,
      v_session.meta_campaign_id, v_session.meta_adset_id, v_session.meta_ad_id,
      v_session.meta_campaign_name, v_session.meta_adset_name, v_session.meta_ad_name,
      v_session.meta_placement, v_session.session_id,
      v_session.fbclid, v_session.fbc, v_session.fbp, v_session.landing_page,
      COALESCE(v_attr_type, 'unknown'), COALESCE(v_confidence, 0),
      v_session.last_seen_at, v_order.created_at, true
    ) RETURNING id INTO v_attr_id;
  END IF;

  RETURN v_attr_id;
END $$;
GRANT EXECUTE ON FUNCTION public.rebuild_order_attribution(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rebuild_all_marketing_attributions(
  p_brand_id uuid, p_from date, p_to date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  PERFORM public._mkt_require_staff();
  FOR r IN
    SELECT id FROM public.orders
     WHERE brand_id = p_brand_id
       AND created_at::date BETWEEN p_from AND p_to
  LOOP
    PERFORM public.rebuild_order_attribution(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.rebuild_all_marketing_attributions(uuid, date, date) TO authenticated, service_role;

-- =========================================================================
-- PROFIT SNAPSHOT ENGINE
-- =========================================================================

CREATE OR REPLACE FUNCTION public.rebuild_marketing_profit_snapshot(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        record;
  v_attr         record;
  v_rules        record;
  v_product_cost numeric := 0;
  v_courier_cost numeric := 0;
  v_packaging    numeric := 0;
  v_cod_fee      numeric := 0;
  v_pg_fee       numeric := 0;
  v_return_cost  numeric := 0;
  v_refund       numeric := 0;
  v_gross_sales  numeric := 0;
  v_delivery_charge numeric := 0;
  v_discount     numeric := 0;
  v_net_sales    numeric := 0;
  v_collected    numeric := 0;
  v_allocated_ad numeric := 0;
  v_day_spend    numeric := 0;
  v_day_orders   integer := 0;
  v_gross_profit numeric := 0;
  v_contrib      numeric := 0;
  v_net_profit   numeric := 0;
  v_is_delivered boolean := false;
  v_is_returned  boolean := false;
  v_is_refunded  boolean := false;
  v_is_cancelled boolean := false;
  v_is_confirmed boolean := false;
  v_courier      record;
  v_snap_id      uuid;
BEGIN
  SELECT o.*, cs.delivery_fee AS cs_delivery_fee, cs.status AS cs_status
    INTO v_order
  FROM public.orders o
  LEFT JOIN LATERAL (
    SELECT delivery_fee, status FROM public.courier_shipments
     WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
  ) cs ON true
  WHERE o.id = p_order_id;

  IF v_order.id IS NULL OR v_order.brand_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_attr FROM public.marketing_order_attributions
   WHERE order_id = p_order_id AND is_primary;

  SELECT * INTO v_rules FROM public.marketing_cost_rules WHERE brand_id = v_order.brand_id;

  -- Revenue
  v_gross_sales     := COALESCE(v_order.subtotal, 0);
  v_delivery_charge := COALESCE(v_order.shipping_fee, 0);
  v_discount        := COALESCE(v_order.discount_amount, 0);
  v_net_sales       := v_gross_sales - v_discount;
  v_refund          := COALESCE(v_order.refund_amount, 0);

  -- Product cost from items
  SELECT COALESCE(SUM(COALESCE(unit_cost_snapshot, cost_price, 0) * COALESCE(quantity,0)),0)
    INTO v_product_cost
    FROM public.order_items WHERE order_id = p_order_id;

  -- Courier cost: prefer shipment fee, fallback to actual_shipping_cost, then 0
  v_courier_cost := COALESCE(v_order.cs_delivery_fee, v_order.actual_shipping_cost, 0);

  -- Packaging
  v_packaging := COALESCE(v_rules.packaging_cost_default, 0);

  -- COD fee
  IF v_order.payment_method ILIKE '%cod%' OR v_order.payment_method ILIKE '%cash%' THEN
    IF v_rules.cod_fee_type = 'percentage' THEN
      v_cod_fee := v_order.total * COALESCE(v_rules.cod_fee_value, 0) / 100.0;
    ELSE
      v_cod_fee := COALESCE(v_rules.cod_fee_value, 0);
    END IF;
  END IF;

  -- Payment gateway fee
  IF v_order.payment_method IS NOT NULL AND NOT (v_order.payment_method ILIKE '%cod%' OR v_order.payment_method ILIKE '%cash%') THEN
    IF v_rules.payment_gateway_fee_type = 'percentage' THEN
      v_pg_fee := v_order.total * COALESCE(v_rules.payment_gateway_fee_value, 0) / 100.0;
    ELSE
      v_pg_fee := COALESCE(v_rules.payment_gateway_fee_value, 0);
    END IF;
  END IF;

  -- Status flags
  v_is_confirmed := v_order.confirmed_at IS NOT NULL;
  v_is_delivered := v_order.delivered_at IS NOT NULL OR v_order.status::text = 'delivered';
  v_is_cancelled := v_order.cancelled_at IS NOT NULL OR v_order.status::text = 'cancelled';
  v_is_returned  := v_order.status::text IN ('returned','return') OR v_order.return_type IS NOT NULL;
  v_is_refunded  := v_refund > 0;

  IF v_is_returned THEN
    v_return_cost := COALESCE(v_rules.return_cost_default, 0);
  END IF;

  v_collected := CASE WHEN v_is_delivered THEN COALESCE(v_order.total, 0) ELSE 0 END;

  -- Allocated ad spend: only for delivered/confirmed attributed orders
  IF v_attr.external_campaign_id IS NOT NULL THEN
    SELECT COALESCE(SUM(spend),0) INTO v_day_spend
      FROM public.marketing_insights_daily
     WHERE brand_id = v_order.brand_id
       AND external_campaign_id = v_attr.external_campaign_id
       AND level = 'campaign'
       AND date = (v_attr.click_time)::date;

    SELECT COUNT(*) INTO v_day_orders
      FROM public.marketing_order_attributions a
      JOIN public.orders o2 ON o2.id = a.order_id
     WHERE a.brand_id = v_order.brand_id
       AND a.external_campaign_id = v_attr.external_campaign_id
       AND a.is_primary
       AND (a.click_time)::date = (v_attr.click_time)::date;

    IF v_day_orders > 0 THEN
      v_allocated_ad := v_day_spend / v_day_orders;
    END IF;
  END IF;

  v_gross_profit := v_net_sales - v_product_cost;
  v_contrib      := v_gross_profit - v_courier_cost - v_packaging - v_cod_fee - v_pg_fee - v_return_cost - v_refund;
  v_net_profit   := v_contrib - v_allocated_ad;

  INSERT INTO public.marketing_order_profit_snapshots (
    brand_id, order_id, attribution_id,
    campaign_id, adset_id, ad_id,
    external_campaign_id, external_adset_id, external_ad_id,
    gross_sales, discount_amount, delivery_charge_collected,
    net_sales, collected_amount,
    product_cost, courier_cost, packaging_cost, cod_charge, payment_gateway_fee,
    refund_amount, return_cost, allocated_ad_spend,
    gross_profit, contribution_profit_before_ads, net_profit_after_ads,
    order_status, payment_status, courier_status,
    is_confirmed, is_delivered, is_returned, is_refunded, is_cancelled,
    order_created_at, confirmed_at, shipped_at, delivered_at, returned_at,
    snapshot_at
  ) VALUES (
    v_order.brand_id, p_order_id, v_attr.id,
    v_attr.campaign_id, v_attr.adset_id, v_attr.ad_id,
    v_attr.external_campaign_id, v_attr.external_adset_id, v_attr.external_ad_id,
    v_gross_sales, v_discount, v_delivery_charge,
    v_net_sales, v_collected,
    v_product_cost, v_courier_cost, v_packaging, v_cod_fee, v_pg_fee,
    v_refund, v_return_cost, v_allocated_ad,
    v_gross_profit, v_contrib, v_net_profit,
    v_order.status::text, v_order.payment_status::text, v_order.cs_status,
    v_is_confirmed, v_is_delivered, v_is_returned, v_is_refunded, v_is_cancelled,
    v_order.created_at, v_order.confirmed_at, v_order.shipped_at, v_order.delivered_at, NULL,
    now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    attribution_id        = EXCLUDED.attribution_id,
    campaign_id           = EXCLUDED.campaign_id,
    adset_id              = EXCLUDED.adset_id,
    ad_id                 = EXCLUDED.ad_id,
    external_campaign_id  = EXCLUDED.external_campaign_id,
    external_adset_id     = EXCLUDED.external_adset_id,
    external_ad_id        = EXCLUDED.external_ad_id,
    gross_sales           = EXCLUDED.gross_sales,
    discount_amount       = EXCLUDED.discount_amount,
    delivery_charge_collected = EXCLUDED.delivery_charge_collected,
    net_sales             = EXCLUDED.net_sales,
    collected_amount      = EXCLUDED.collected_amount,
    product_cost          = EXCLUDED.product_cost,
    courier_cost          = EXCLUDED.courier_cost,
    packaging_cost        = EXCLUDED.packaging_cost,
    cod_charge            = EXCLUDED.cod_charge,
    payment_gateway_fee   = EXCLUDED.payment_gateway_fee,
    refund_amount         = EXCLUDED.refund_amount,
    return_cost           = EXCLUDED.return_cost,
    allocated_ad_spend    = EXCLUDED.allocated_ad_spend,
    gross_profit          = EXCLUDED.gross_profit,
    contribution_profit_before_ads = EXCLUDED.contribution_profit_before_ads,
    net_profit_after_ads  = EXCLUDED.net_profit_after_ads,
    order_status          = EXCLUDED.order_status,
    payment_status        = EXCLUDED.payment_status,
    courier_status        = EXCLUDED.courier_status,
    is_confirmed          = EXCLUDED.is_confirmed,
    is_delivered          = EXCLUDED.is_delivered,
    is_returned           = EXCLUDED.is_returned,
    is_refunded           = EXCLUDED.is_refunded,
    is_cancelled          = EXCLUDED.is_cancelled,
    order_created_at      = EXCLUDED.order_created_at,
    confirmed_at          = EXCLUDED.confirmed_at,
    shipped_at            = EXCLUDED.shipped_at,
    delivered_at          = EXCLUDED.delivered_at,
    snapshot_at           = now(),
    updated_at            = now()
  RETURNING id INTO v_snap_id;

  RETURN v_snap_id;
END $$;
GRANT EXECUTE ON FUNCTION public.rebuild_marketing_profit_snapshot(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rebuild_marketing_profit_snapshots(
  p_brand_id uuid, p_from date, p_to date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  PERFORM public._mkt_require_staff();
  -- ensure attributions exist first
  PERFORM public.rebuild_all_marketing_attributions(p_brand_id, p_from, p_to);
  FOR r IN
    SELECT id FROM public.orders
     WHERE brand_id = p_brand_id
       AND created_at::date BETWEEN p_from AND p_to
  LOOP
    PERFORM public.rebuild_marketing_profit_snapshot(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.rebuild_marketing_profit_snapshots(uuid, date, date) TO authenticated, service_role;

-- =========================================================================
-- REPORTING RPCs
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_marketing_overview(
  p_brand_id uuid, p_from date, p_to date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spend         numeric := 0;
  v_impressions   bigint  := 0;
  v_clicks        bigint  := 0;
  v_meta_purch    bigint  := 0;
  v_meta_value    numeric := 0;
  v_orders        integer := 0;
  v_attr_orders   integer := 0;
  v_delivered     integer := 0;
  v_returned      integer := 0;
  v_revenue       numeric := 0;
  v_collected     numeric := 0;
  v_net_profit    numeric := 0;
  v_product_cost  numeric := 0;
  v_unattributed  integer := 0;
BEGIN
  PERFORM public._mkt_require_staff();

  SELECT COALESCE(SUM(spend),0), COALESCE(SUM(impressions),0), COALESCE(SUM(clicks),0),
         COALESCE(SUM(meta_purchases),0), COALESCE(SUM(meta_purchase_value),0)
    INTO v_spend, v_impressions, v_clicks, v_meta_purch, v_meta_value
  FROM public.marketing_insights_daily
  WHERE brand_id = p_brand_id AND date BETWEEN p_from AND p_to AND level = 'campaign';

  SELECT COUNT(*) INTO v_orders
  FROM public.orders WHERE brand_id = p_brand_id AND created_at::date BETWEEN p_from AND p_to;

  SELECT
    COUNT(*) FILTER (WHERE s.external_campaign_id IS NOT NULL),
    COUNT(*) FILTER (WHERE s.is_delivered),
    COUNT(*) FILTER (WHERE s.is_returned),
    COALESCE(SUM(s.net_sales),0),
    COALESCE(SUM(s.collected_amount),0),
    COALESCE(SUM(s.net_profit_after_ads),0),
    COALESCE(SUM(s.product_cost),0),
    COUNT(*) FILTER (WHERE s.external_campaign_id IS NULL)
  INTO v_attr_orders, v_delivered, v_returned, v_revenue, v_collected, v_net_profit, v_product_cost, v_unattributed
  FROM public.marketing_order_profit_snapshots s
  WHERE s.brand_id = p_brand_id AND s.order_created_at::date BETWEEN p_from AND p_to;

  RETURN jsonb_build_object(
    'spend',         v_spend,
    'impressions',   v_impressions,
    'clicks',        v_clicks,
    'meta_purchases',v_meta_purch,
    'meta_value',    v_meta_value,
    'meta_roas',     CASE WHEN v_spend > 0 THEN v_meta_value / v_spend ELSE 0 END,
    'orders',        v_orders,
    'attributed_orders', v_attr_orders,
    'unattributed_orders', v_unattributed,
    'delivered_orders',  v_delivered,
    'returned_orders',   v_returned,
    'delivery_rate', CASE WHEN v_attr_orders > 0 THEN v_delivered::numeric / v_attr_orders ELSE 0 END,
    'return_rate',   CASE WHEN v_delivered  > 0 THEN v_returned::numeric  / v_delivered  ELSE 0 END,
    'revenue',       v_revenue,
    'collected',     v_collected,
    'product_cost',  v_product_cost,
    'net_profit',    v_net_profit,
    'actual_roas',   CASE WHEN v_spend > 0 THEN v_collected   / v_spend ELSE 0 END,
    'poas',          CASE WHEN v_spend > 0 THEN v_net_profit  / v_spend ELSE 0 END
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_marketing_overview(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_campaign_report(
  p_brand_id uuid, p_from date, p_to date
) RETURNS TABLE (
  campaign_id          uuid,
  external_campaign_id text,
  campaign_name        text,
  status               text,
  spend                numeric,
  impressions          bigint,
  clicks               bigint,
  meta_purchases       bigint,
  meta_value           numeric,
  meta_roas            numeric,
  attributed_orders    integer,
  delivered_orders     integer,
  returned_orders      integer,
  revenue              numeric,
  collected            numeric,
  product_cost         numeric,
  net_profit           numeric,
  actual_roas          numeric,
  poas                 numeric,
  delivery_rate        numeric,
  return_rate          numeric,
  health               text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rules record;
BEGIN
  PERFORM public._mkt_require_staff();
  SELECT * INTO v_rules FROM public.marketing_cost_rules WHERE brand_id = p_brand_id;

  RETURN QUERY
  WITH ins AS (
    SELECT i.external_campaign_id,
           SUM(i.spend) AS spend,
           SUM(i.impressions)::bigint AS impressions,
           SUM(i.clicks)::bigint AS clicks,
           SUM(i.meta_purchases)::bigint AS meta_purchases,
           SUM(i.meta_purchase_value) AS meta_value
      FROM public.marketing_insights_daily i
     WHERE i.brand_id = p_brand_id AND i.date BETWEEN p_from AND p_to AND i.level = 'campaign'
     GROUP BY i.external_campaign_id
  ),
  snaps AS (
    SELECT s.external_campaign_id,
           COUNT(*)::integer AS attributed_orders,
           COUNT(*) FILTER (WHERE s.is_delivered)::integer AS delivered_orders,
           COUNT(*) FILTER (WHERE s.is_returned)::integer  AS returned_orders,
           SUM(s.net_sales) AS revenue,
           SUM(s.collected_amount) AS collected,
           SUM(s.product_cost) AS product_cost,
           SUM(s.net_profit_after_ads) AS net_profit
      FROM public.marketing_order_profit_snapshots s
     WHERE s.brand_id = p_brand_id
       AND s.order_created_at::date BETWEEN p_from AND p_to
       AND s.external_campaign_id IS NOT NULL
     GROUP BY s.external_campaign_id
  )
  SELECT
    c.id AS campaign_id,
    COALESCE(c.external_campaign_id, ins.external_campaign_id, snaps.external_campaign_id) AS external_campaign_id,
    COALESCE(c.name, '(unknown)') AS campaign_name,
    c.effective_status AS status,
    COALESCE(ins.spend, 0),
    COALESCE(ins.impressions, 0),
    COALESCE(ins.clicks, 0),
    COALESCE(ins.meta_purchases, 0),
    COALESCE(ins.meta_value, 0),
    CASE WHEN COALESCE(ins.spend,0) > 0 THEN COALESCE(ins.meta_value,0) / ins.spend ELSE 0 END AS meta_roas,
    COALESCE(snaps.attributed_orders, 0),
    COALESCE(snaps.delivered_orders, 0),
    COALESCE(snaps.returned_orders, 0),
    COALESCE(snaps.revenue, 0),
    COALESCE(snaps.collected, 0),
    COALESCE(snaps.product_cost, 0),
    COALESCE(snaps.net_profit, 0),
    CASE WHEN COALESCE(ins.spend,0) > 0 THEN COALESCE(snaps.collected,0)  / ins.spend ELSE 0 END AS actual_roas,
    CASE WHEN COALESCE(ins.spend,0) > 0 THEN COALESCE(snaps.net_profit,0) / ins.spend ELSE 0 END AS poas,
    CASE WHEN COALESCE(snaps.attributed_orders,0) > 0 THEN snaps.delivered_orders::numeric / snaps.attributed_orders ELSE 0 END AS delivery_rate,
    CASE WHEN COALESCE(snaps.delivered_orders,0)  > 0 THEN snaps.returned_orders::numeric  / snaps.delivered_orders  ELSE 0 END AS return_rate,
    CASE
      WHEN COALESCE(snaps.attributed_orders,0) = 0 AND COALESCE(ins.spend,0) > 0 THEN 'no_attribution'
      WHEN COALESCE(snaps.net_profit,0) > 0 AND COALESCE(ins.spend,0) > 0 THEN 'profitable'
      WHEN COALESCE(snaps.net_profit,0) < 0 AND COALESCE(ins.spend,0) > 0 THEN 'losing'
      WHEN COALESCE(snaps.delivered_orders,0) > 0 AND snaps.returned_orders::numeric / snaps.delivered_orders > COALESCE(v_rules.high_return_rate_threshold, 0.30) THEN 'high_return'
      WHEN COALESCE(snaps.attributed_orders,0) > 0 AND snaps.delivered_orders::numeric / snaps.attributed_orders < COALESCE(v_rules.low_delivery_rate_threshold, 0.50) THEN 'low_delivery'
      ELSE 'neutral'
    END AS health
  FROM ins
  FULL OUTER JOIN snaps ON snaps.external_campaign_id = ins.external_campaign_id
  LEFT JOIN public.marketing_campaigns c
    ON c.brand_id = p_brand_id
   AND c.external_campaign_id = COALESCE(ins.external_campaign_id, snaps.external_campaign_id)
  ORDER BY COALESCE(ins.spend, 0) DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.get_campaign_report(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_adset_report(
  p_brand_id uuid, p_from date, p_to date
) RETURNS TABLE (
  adset_id           uuid,
  external_adset_id  text,
  adset_name         text,
  campaign_name      text,
  spend              numeric,
  impressions        bigint,
  clicks             bigint,
  attributed_orders  integer,
  delivered_orders   integer,
  revenue            numeric,
  net_profit         numeric,
  actual_roas        numeric,
  poas               numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._mkt_require_staff();
  RETURN QUERY
  WITH ins AS (
    SELECT external_adset_id, SUM(spend) AS spend,
           SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks
    FROM public.marketing_insights_daily
    WHERE brand_id = p_brand_id AND date BETWEEN p_from AND p_to AND level = 'adset'
    GROUP BY external_adset_id
  ),
  snaps AS (
    SELECT external_adset_id,
           COUNT(*)::integer AS attributed_orders,
           COUNT(*) FILTER (WHERE is_delivered)::integer AS delivered_orders,
           SUM(net_sales) AS revenue,
           SUM(collected_amount) AS collected,
           SUM(net_profit_after_ads) AS net_profit
    FROM public.marketing_order_profit_snapshots
    WHERE brand_id = p_brand_id AND order_created_at::date BETWEEN p_from AND p_to
      AND external_adset_id IS NOT NULL
    GROUP BY external_adset_id
  )
  SELECT
    a.id, COALESCE(a.external_adset_id, ins.external_adset_id, snaps.external_adset_id),
    COALESCE(a.name,'(unknown)'), c.name,
    COALESCE(ins.spend,0), COALESCE(ins.impressions,0), COALESCE(ins.clicks,0),
    COALESCE(snaps.attributed_orders,0), COALESCE(snaps.delivered_orders,0),
    COALESCE(snaps.revenue,0), COALESCE(snaps.net_profit,0),
    CASE WHEN COALESCE(ins.spend,0) > 0 THEN COALESCE(snaps.collected,0)/ins.spend ELSE 0 END,
    CASE WHEN COALESCE(ins.spend,0) > 0 THEN COALESCE(snaps.net_profit,0)/ins.spend ELSE 0 END
  FROM ins
  FULL OUTER JOIN snaps ON snaps.external_adset_id = ins.external_adset_id
  LEFT JOIN public.marketing_adsets a ON a.brand_id = p_brand_id AND a.external_adset_id = COALESCE(ins.external_adset_id, snaps.external_adset_id)
  LEFT JOIN public.marketing_campaigns c ON c.id = a.campaign_id
  ORDER BY COALESCE(ins.spend,0) DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.get_adset_report(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_ad_report(
  p_brand_id uuid, p_from date, p_to date
) RETURNS TABLE (
  ad_id              uuid,
  external_ad_id     text,
  ad_name            text,
  campaign_name      text,
  thumbnail_url      text,
  spend              numeric,
  impressions        bigint,
  clicks             bigint,
  attributed_orders  integer,
  delivered_orders   integer,
  revenue            numeric,
  net_profit         numeric,
  actual_roas        numeric,
  poas               numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._mkt_require_staff();
  RETURN QUERY
  WITH ins AS (
    SELECT external_ad_id, SUM(spend) AS spend,
           SUM(impressions)::bigint AS impressions, SUM(clicks)::bigint AS clicks
    FROM public.marketing_insights_daily
    WHERE brand_id = p_brand_id AND date BETWEEN p_from AND p_to AND level = 'ad'
    GROUP BY external_ad_id
  ),
  snaps AS (
    SELECT external_ad_id,
           COUNT(*)::integer AS attributed_orders,
           COUNT(*) FILTER (WHERE is_delivered)::integer AS delivered_orders,
           SUM(net_sales) AS revenue,
           SUM(collected_amount) AS collected,
           SUM(net_profit_after_ads) AS net_profit
    FROM public.marketing_order_profit_snapshots
    WHERE brand_id = p_brand_id AND order_created_at::date BETWEEN p_from AND p_to
      AND external_ad_id IS NOT NULL
    GROUP BY external_ad_id
  )
  SELECT
    ad.id, COALESCE(ad.external_ad_id, ins.external_ad_id, snaps.external_ad_id),
    COALESCE(ad.name,'(unknown)'), c.name, ad.thumbnail_url,
    COALESCE(ins.spend,0), COALESCE(ins.impressions,0), COALESCE(ins.clicks,0),
    COALESCE(snaps.attributed_orders,0), COALESCE(snaps.delivered_orders,0),
    COALESCE(snaps.revenue,0), COALESCE(snaps.net_profit,0),
    CASE WHEN COALESCE(ins.spend,0) > 0 THEN COALESCE(snaps.collected,0)/ins.spend ELSE 0 END,
    CASE WHEN COALESCE(ins.spend,0) > 0 THEN COALESCE(snaps.net_profit,0)/ins.spend ELSE 0 END
  FROM ins
  FULL OUTER JOIN snaps ON snaps.external_ad_id = ins.external_ad_id
  LEFT JOIN public.marketing_ads ad ON ad.brand_id = p_brand_id AND ad.external_ad_id = COALESCE(ins.external_ad_id, snaps.external_ad_id)
  LEFT JOIN public.marketing_campaigns c ON c.id = ad.campaign_id
  ORDER BY COALESCE(ins.spend,0) DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.get_ad_report(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_actual_roas_daily(
  p_brand_id uuid, p_from date, p_to date
) RETURNS TABLE (
  day              date,
  spend            numeric,
  attributed_orders integer,
  delivered_orders integer,
  revenue          numeric,
  collected        numeric,
  net_profit       numeric,
  meta_roas        numeric,
  actual_roas      numeric,
  poas             numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._mkt_require_staff();
  RETURN QUERY
  WITH ins AS (
    SELECT date AS day, SUM(spend) AS spend, SUM(meta_purchase_value) AS meta_value
    FROM public.marketing_insights_daily
    WHERE brand_id = p_brand_id AND date BETWEEN p_from AND p_to AND level='campaign'
    GROUP BY date
  ),
  snaps AS (
    SELECT order_created_at::date AS day,
           COUNT(*)::integer AS attributed_orders,
           COUNT(*) FILTER (WHERE is_delivered)::integer AS delivered_orders,
           SUM(net_sales) AS revenue,
           SUM(collected_amount) AS collected,
           SUM(net_profit_after_ads) AS net_profit
    FROM public.marketing_order_profit_snapshots
    WHERE brand_id = p_brand_id AND order_created_at::date BETWEEN p_from AND p_to
    GROUP BY order_created_at::date
  )
  SELECT
    COALESCE(ins.day, snaps.day),
    COALESCE(ins.spend,0),
    COALESCE(snaps.attributed_orders,0),
    COALESCE(snaps.delivered_orders,0),
    COALESCE(snaps.revenue,0),
    COALESCE(snaps.collected,0),
    COALESCE(snaps.net_profit,0),
    CASE WHEN COALESCE(ins.spend,0)>0 THEN COALESCE(ins.meta_value,0)/ins.spend ELSE 0 END,
    CASE WHEN COALESCE(ins.spend,0)>0 THEN COALESCE(snaps.collected,0)/ins.spend ELSE 0 END,
    CASE WHEN COALESCE(ins.spend,0)>0 THEN COALESCE(snaps.net_profit,0)/ins.spend ELSE 0 END
  FROM ins
  FULL OUTER JOIN snaps ON snaps.day = ins.day
  ORDER BY 1;
END $$;
GRANT EXECUTE ON FUNCTION public.get_actual_roas_daily(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_product_campaign_report(
  p_brand_id uuid, p_from date, p_to date
) RETURNS TABLE (
  product_id        uuid,
  product_name      text,
  campaign_id       uuid,
  campaign_name     text,
  units_sold        integer,
  revenue           numeric,
  product_cost      numeric,
  attributed_orders integer,
  delivered_orders  integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._mkt_require_staff();
  RETURN QUERY
  SELECT
    oi.product_id,
    COALESCE(p.name, oi.name) AS product_name,
    s.campaign_id,
    c.name AS campaign_name,
    SUM(oi.quantity)::integer,
    SUM(oi.line_total),
    SUM(COALESCE(oi.unit_cost_snapshot, oi.cost_price, 0) * oi.quantity),
    COUNT(DISTINCT s.order_id)::integer,
    COUNT(DISTINCT s.order_id) FILTER (WHERE s.is_delivered)::integer
  FROM public.marketing_order_profit_snapshots s
  JOIN public.order_items oi ON oi.order_id = s.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN public.marketing_campaigns c ON c.id = s.campaign_id
  WHERE s.brand_id = p_brand_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
  GROUP BY oi.product_id, COALESCE(p.name, oi.name), s.campaign_id, c.name
  ORDER BY SUM(oi.line_total) DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.get_product_campaign_report(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_courier_campaign_report(
  p_brand_id uuid, p_from date, p_to date
) RETURNS TABLE (
  provider          text,
  campaign_id       uuid,
  campaign_name     text,
  attributed_orders integer,
  delivered_orders  integer,
  returned_orders   integer,
  delivery_rate     numeric,
  return_rate       numeric,
  courier_cost      numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._mkt_require_staff();
  RETURN QUERY
  SELECT
    COALESCE(cs.provider, 'unknown') AS provider,
    s.campaign_id,
    c.name AS campaign_name,
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE s.is_delivered)::integer,
    COUNT(*) FILTER (WHERE s.is_returned)::integer,
    CASE WHEN COUNT(*)>0 THEN COUNT(*) FILTER (WHERE s.is_delivered)::numeric / COUNT(*) ELSE 0 END,
    CASE WHEN COUNT(*) FILTER (WHERE s.is_delivered)>0
         THEN COUNT(*) FILTER (WHERE s.is_returned)::numeric / COUNT(*) FILTER (WHERE s.is_delivered)
         ELSE 0 END,
    SUM(s.courier_cost)
  FROM public.marketing_order_profit_snapshots s
  LEFT JOIN LATERAL (
    SELECT provider FROM public.courier_shipments WHERE order_id = s.order_id ORDER BY created_at DESC LIMIT 1
  ) cs ON true
  LEFT JOIN public.marketing_campaigns c ON c.id = s.campaign_id
  WHERE s.brand_id = p_brand_id
    AND s.order_created_at::date BETWEEN p_from AND p_to
  GROUP BY COALESCE(cs.provider, 'unknown'), s.campaign_id, c.name
  ORDER BY 4 DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.get_courier_campaign_report(uuid, date, date) TO authenticated, service_role;
