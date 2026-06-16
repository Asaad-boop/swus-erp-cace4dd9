
-- D1: Brand-wide product profitability rollup
CREATE OR REPLACE FUNCTION public.get_brand_profitability_rollup(
  p_brand_id uuid,
  p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_date_to   date DEFAULT CURRENT_DATE,
  p_date_basis text DEFAULT 'delivered'
)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  image text,
  current_stock int,
  confirmed_qty numeric,
  delivered_qty numeric,
  returned_qty numeric,
  revenue numeric,
  cogs numeric,
  courier_cost numeric,
  return_loss numeric,
  exchange_loss numeric,
  meta_ads numeric,
  marketing_content numeric,
  gross_profit numeric,
  net_profit numeric,
  profit_per_unit numeric,
  roi_percent numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _user uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role)
       OR public.has_role(_user,'operations'::public.app_role)
       OR public.has_role(_user,'accountant'::public.app_role)
       OR public.has_role(_user,'customer_service'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH oi AS (
    SELECT
      oi.product_id,
      oi.quantity,
      oi.line_total,
      oi.unit_cost_snapshot,
      oi.courier_cost_allocated,
      oi.packaging_cost_allocated,
      oi.line_discount_allocated,
      oi.delivery_charge_allocated,
      o.status::text AS o_status,
      o.brand_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.brand_id = p_brand_id
      AND (
        (p_date_basis='created'   AND o.created_at::date BETWEEN p_date_from AND p_date_to) OR
        (p_date_basis='confirmed' AND o.confirmed_at::date BETWEEN p_date_from AND p_date_to) OR
        (p_date_basis='delivered' AND COALESCE(o.delivered_at, o.created_at)::date BETWEEN p_date_from AND p_date_to)
      )
  ),
  agg_oi AS (
    SELECT
      product_id,
      SUM(CASE WHEN o_status IN ('confirmed','packaging','packed','ready_to_ship','ready_to_pack','shipped','in_transit','delivered','partial_delivered','paid') THEN quantity ELSE 0 END)::numeric AS confirmed_qty,
      SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid') THEN quantity ELSE 0 END)::numeric AS delivered_qty,
      SUM(CASE WHEN o_status IN ('returned','partial_returned') THEN quantity ELSE 0 END)::numeric AS returned_qty,
      SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid') THEN COALESCE(line_total,0) - COALESCE(line_discount_allocated,0) + COALESCE(delivery_charge_allocated,0) ELSE 0 END)::numeric AS revenue,
      SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid') THEN COALESCE(unit_cost_snapshot,0) * quantity ELSE 0 END)::numeric AS cogs,
      SUM(COALESCE(courier_cost_allocated,0) + COALESCE(packaging_cost_allocated,0))::numeric AS courier_cost
    FROM oi
    GROUP BY product_id
  ),
  ret AS (
    SELECT product_id,
           SUM(COALESCE(product_cost_loss,0) + COALESCE(return_delivery_cost,0) + COALESCE(outbound_delivery_cost,0))::numeric AS return_loss
    FROM public.erp_return_cases
    WHERE brand_id = p_brand_id
      AND created_at::date BETWEEN p_date_from AND p_date_to
      AND product_id IS NOT NULL
    GROUP BY product_id
  ),
  exch AS (
    SELECT original_product_id AS product_id,
           SUM(COALESCE(product_cost_loss,0) + COALESCE(return_delivery_cost,0) + COALESCE(replacement_delivery_cost,0) + COALESCE(refund_amount,0) - COALESCE(exchange_charge_collected,0))::numeric AS exchange_loss
    FROM public.erp_exchange_cases
    WHERE brand_id = p_brand_id
      AND created_at::date BETWEEN p_date_from AND p_date_to
      AND original_product_id IS NOT NULL
    GROUP BY original_product_id
  ),
  mkt AS (
    SELECT product_id,
           SUM(CASE WHEN expense_type IN ('meta_ads_manual') THEN amount ELSE 0 END)::numeric AS meta_ads_alloc,
           SUM(CASE WHEN expense_type NOT IN ('meta_ads_manual') THEN amount ELSE 0 END)::numeric AS marketing_content
    FROM public.erp_product_expense_allocations
    WHERE brand_id = p_brand_id
      AND created_at::date BETWEEN p_date_from AND p_date_to
    GROUP BY product_id
  ),
  ads AS (
    -- Attribute Meta spend via ad-product links proportionally
    SELECT l.product_id,
           SUM(COALESCE(ci.spend,0) * (l.allocation_percent / 100.0))::numeric AS meta_spend
    FROM public.erp_ad_product_links l
    JOIN public.marketing_campaign_insights ci ON ci.campaign_id = l.campaign_id
    WHERE l.brand_id = p_brand_id
      AND ci.date BETWEEN p_date_from AND p_date_to
    GROUP BY l.product_id
  )
  SELECT
    p.id AS product_id,
    p.title AS name,
    p.sku,
    p.image,
    p.stock::int AS current_stock,
    COALESCE(a.confirmed_qty,0),
    COALESCE(a.delivered_qty,0),
    COALESCE(a.returned_qty,0),
    COALESCE(a.revenue,0),
    COALESCE(a.cogs,0),
    COALESCE(a.courier_cost,0),
    COALESCE(r.return_loss,0),
    COALESCE(e.exchange_loss,0),
    (COALESCE(m.meta_ads_alloc,0) + COALESCE(ad.meta_spend,0))::numeric AS meta_ads,
    COALESCE(m.marketing_content,0),
    (COALESCE(a.revenue,0) - COALESCE(a.cogs,0))::numeric AS gross_profit,
    (COALESCE(a.revenue,0)
      - COALESCE(a.cogs,0)
      - COALESCE(a.courier_cost,0)
      - COALESCE(r.return_loss,0)
      - COALESCE(e.exchange_loss,0)
      - COALESCE(m.meta_ads_alloc,0) - COALESCE(ad.meta_spend,0)
      - COALESCE(m.marketing_content,0)
    )::numeric AS net_profit,
    CASE WHEN COALESCE(a.delivered_qty,0) > 0 THEN
      ROUND((COALESCE(a.revenue,0)
        - COALESCE(a.cogs,0)
        - COALESCE(a.courier_cost,0)
        - COALESCE(r.return_loss,0)
        - COALESCE(e.exchange_loss,0)
        - COALESCE(m.meta_ads_alloc,0) - COALESCE(ad.meta_spend,0)
        - COALESCE(m.marketing_content,0)
      ) / COALESCE(a.delivered_qty,0), 2)
    ELSE 0 END AS profit_per_unit,
    CASE WHEN COALESCE(a.cogs,0) + COALESCE(a.courier_cost,0) + COALESCE(m.meta_ads_alloc,0) + COALESCE(ad.meta_spend,0) + COALESCE(m.marketing_content,0) > 0 THEN
      ROUND(((COALESCE(a.revenue,0)
        - COALESCE(a.cogs,0)
        - COALESCE(a.courier_cost,0)
        - COALESCE(r.return_loss,0)
        - COALESCE(e.exchange_loss,0)
        - COALESCE(m.meta_ads_alloc,0) - COALESCE(ad.meta_spend,0)
        - COALESCE(m.marketing_content,0)
      ) / NULLIF(COALESCE(a.cogs,0) + COALESCE(a.courier_cost,0) + COALESCE(m.meta_ads_alloc,0) + COALESCE(ad.meta_spend,0) + COALESCE(m.marketing_content,0), 0)) * 100, 2)
    ELSE 0 END AS roi_percent
  FROM public.products p
  LEFT JOIN agg_oi a ON a.product_id = p.id
  LEFT JOIN ret    r  ON r.product_id = p.id
  LEFT JOIN exch   e  ON e.product_id = p.id
  LEFT JOIN mkt    m  ON m.product_id = p.id
  LEFT JOIN ads    ad ON ad.product_id = p.id
  WHERE p.brand_id = p_brand_id
    AND (a.confirmed_qty > 0 OR a.delivered_qty > 0 OR r.return_loss > 0 OR e.exchange_loss > 0
         OR m.meta_ads_alloc > 0 OR m.marketing_content > 0 OR ad.meta_spend > 0)
  ORDER BY net_profit DESC NULLS LAST;
END $$;

-- D2: Admin backfill of profit snapshots
CREATE OR REPLACE FUNCTION public.backfill_order_profit_snapshots(p_brand_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _user uuid := auth.uid(); _count int := 0; r record;
BEGIN
  IF NOT public.has_role(_user,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  FOR r IN
    SELECT id FROM public.orders
    WHERE brand_id = p_brand_id
      AND status::text IN ('confirmed','shipped','in_transit','delivered','partial_delivered','paid','packaging','packed','ready_to_ship','ready_to_pack')
  LOOP
    PERFORM public.snapshot_order_item_profit_fields(r.id);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;
