
-- =====================================================================
-- Marketing profit consolidation — canonical calculation source
-- =====================================================================
-- Foundation function: atomic per-line rows with deterministic COGS.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mkt_delivered_line_costs(
  _brand_id uuid,
  _from date,
  _to date
)
RETURNS TABLE (
  order_id uuid,
  order_item_id uuid,
  day date,
  campaign_id uuid,
  product_id uuid,
  variant_id uuid,
  quantity numeric,
  line_total numeric,
  unit_cost numeric,
  line_cogs numeric,
  cost_source text,
  cost_missing boolean,
  courier_cost_allocated numeric,
  packaging_cost_allocated numeric,
  refund_amount_allocated numeric,
  operating_cost numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      o.id AS order_id,
      oi.id AS order_item_id,
      (o.created_at AT TIME ZONE 'Asia/Dhaka')::date AS day,
      oi.product_id,
      oi.variant_id,
      COALESCE(oi.quantity, 0)::numeric AS quantity,
      COALESCE(oi.line_total, 0)::numeric AS line_total,
      NULLIF(oi.unit_cost_snapshot, 0)::numeric AS snap_cost,
      NULLIF(pv.weighted_avg_cost, 0)::numeric AS variant_wac,
      NULLIF(p.weighted_avg_cost, 0)::numeric AS product_wac,
      NULLIF(p.cost_price, 0)::numeric AS product_cost_price,
      COALESCE(oi.courier_cost_allocated, 0)::numeric AS courier_cost_allocated,
      COALESCE(oi.packaging_cost_allocated, 0)::numeric AS packaging_cost_allocated,
      COALESCE(oi.refund_amount_allocated, 0)::numeric AS refund_amount_allocated
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE o.brand_id = _brand_id
      AND o.status = 'delivered'
      AND o.created_at >= _from::timestamptz
      AND o.created_at <  (_to::date + 1)::timestamptz
  ),
  costed AS (
    SELECT
      b.*,
      COALESCE(b.snap_cost, b.variant_wac, b.product_wac, b.product_cost_price, 0)::numeric AS unit_cost_resolved,
      CASE
        WHEN b.snap_cost         IS NOT NULL THEN 'snapshot'
        WHEN b.variant_wac       IS NOT NULL THEN 'wac_variant'
        WHEN b.product_wac       IS NOT NULL THEN 'wac_product'
        WHEN b.product_cost_price IS NOT NULL THEN 'cost_price'
        ELSE 'missing'
      END AS cost_source_resolved
    FROM base b
  )
  -- One row per (order_item, distinct attribution campaign).
  -- Using LEFT JOIN so unattributed lines still surface (needed for brand-level totals).
  -- Attribution rows are deduped so a repeated (order, campaign) attribution
  -- can't double-count revenue on the campaign side.
  SELECT
    c.order_id,
    c.order_item_id,
    c.day,
    attr.campaign_id,
    c.product_id,
    c.variant_id,
    c.quantity,
    c.line_total,
    c.unit_cost_resolved AS unit_cost,
    (c.unit_cost_resolved * c.quantity)::numeric AS line_cogs,
    c.cost_source_resolved AS cost_source,
    (c.cost_source_resolved = 'missing') AS cost_missing,
    c.courier_cost_allocated,
    c.packaging_cost_allocated,
    c.refund_amount_allocated,
    (c.courier_cost_allocated + c.packaging_cost_allocated + c.refund_amount_allocated)::numeric AS operating_cost
  FROM costed c
  LEFT JOIN (
    SELECT DISTINCT order_id, campaign_id
    FROM public.mkt_order_attributions
    WHERE campaign_id IS NOT NULL
  ) attr ON attr.order_id = c.order_id;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_delivered_line_costs(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.mkt_delivered_line_costs(uuid, date, date) IS
  'Canonical per-line source for marketing profit calculations. Deterministic COGS fallback: unit_cost_snapshot → variant.weighted_avg_cost → product.weighted_avg_cost → product.cost_price → 0 (with cost_missing=true). Rows are duplicated across distinct attributed campaigns; unattributed lines appear once with campaign_id=NULL.';

-- =====================================================================
-- Convenience aggregator: per-campaign profit
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_campaign_profit(
  _brand_id uuid,
  _from date,
  _to date
)
RETURNS TABLE (
  campaign_id uuid,
  delivered_orders bigint,
  delivered_units numeric,
  delivered_revenue numeric,
  cogs numeric,
  operating_cost numeric,
  gross_profit numeric,
  cost_missing_units numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT * FROM public.mkt_delivered_line_costs(_brand_id, _from, _to)
    WHERE campaign_id IS NOT NULL
  )
  SELECT
    campaign_id,
    COUNT(DISTINCT order_id)                                              AS delivered_orders,
    COALESCE(SUM(quantity), 0)::numeric                                   AS delivered_units,
    COALESCE(SUM(line_total), 0)::numeric                                 AS delivered_revenue,
    COALESCE(SUM(line_cogs), 0)::numeric                                  AS cogs,
    COALESCE(SUM(operating_cost), 0)::numeric                             AS operating_cost,
    (COALESCE(SUM(line_total), 0)
      - COALESCE(SUM(line_cogs), 0)
      - COALESCE(SUM(operating_cost), 0))::numeric                        AS gross_profit,
    COALESCE(SUM(CASE WHEN cost_missing THEN quantity ELSE 0 END), 0)::numeric AS cost_missing_units
  FROM src
  GROUP BY campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_profit(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_campaign_profit(uuid, date, date) IS
  'Per-campaign delivered revenue, COGS, ops cost, and gross profit from the canonical line source. delivered_revenue is line-total-based (excludes shipping/discount, no attribution double-count). cost_missing_units flags rows with no resolvable unit cost.';

-- =====================================================================
-- Convenience aggregator: per-SKU / per-product profit (brand-scoped)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_sku_profit(
  _brand_id uuid,
  _from date,
  _to date
)
RETURNS TABLE (
  product_id uuid,
  delivered_units numeric,
  delivered_revenue numeric,
  cogs numeric,
  operating_cost numeric,
  gross_profit numeric,
  cost_missing_units numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Distinct on (order_item_id) so lines attributed to multiple campaigns
  -- don't inflate SKU-level totals.
  WITH lines AS (
    SELECT DISTINCT ON (order_item_id)
      order_item_id, product_id, quantity, line_total, line_cogs,
      operating_cost, cost_missing
    FROM public.mkt_delivered_line_costs(_brand_id, _from, _to)
    ORDER BY order_item_id
  )
  SELECT
    product_id,
    COALESCE(SUM(quantity), 0)::numeric                                   AS delivered_units,
    COALESCE(SUM(line_total), 0)::numeric                                 AS delivered_revenue,
    COALESCE(SUM(line_cogs), 0)::numeric                                  AS cogs,
    COALESCE(SUM(operating_cost), 0)::numeric                             AS operating_cost,
    (COALESCE(SUM(line_total), 0)
      - COALESCE(SUM(line_cogs), 0)
      - COALESCE(SUM(operating_cost), 0))::numeric                        AS gross_profit,
    COALESCE(SUM(CASE WHEN cost_missing THEN quantity ELSE 0 END), 0)::numeric AS cost_missing_units
  FROM lines
  GROUP BY product_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_sku_profit(uuid, date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_sku_profit(uuid, date, date) IS
  'Per-product delivered revenue, COGS, ops cost, and gross profit (brand-scoped, deduped across attribution). Includes unattributed lines. cost_missing_units flags SKUs with no resolvable cost so UI can show a "cost data incomplete" badge.';
