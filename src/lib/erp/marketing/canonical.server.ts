/**
 * Canonical marketing profit source (Phase 4a.1 consolidation).
 *
 * All marketing surfaces (dashboard, campaigns, rollup, sku-pnl, meta-reports,
 * performance) must derive `delivered_revenue`, `cogs`, `operating_cost`, and
 * `gross_profit` from these helpers so numbers stay consistent across pages.
 *
 * Backed by three Postgres functions:
 *  - mkt_delivered_line_costs(brand, from, to)  — atomic per-line rows
 *  - get_campaign_profit(brand, from, to)       — per-campaign aggregate
 *  - get_sku_profit(brand, from, to)            — per-product aggregate
 *
 * Cost fallback chain (deterministic, same for every surface):
 *   order_items.unit_cost_snapshot
 *     → product_variants.weighted_avg_cost
 *     → products.weighted_avg_cost
 *     → products.cost_price
 *     → 0 with cost_missing = true (surfaced as `cost_missing_units`)
 *
 * Revenue definition: sum of order_items.line_total for delivered orders in
 * window. Excludes shipping/discount (which sit on orders.total). This is
 * per-item safe and cannot double-count from attribution rows.
 */

export type CampaignProfitAgg = {
  delivered_orders: number;
  delivered_units: number;
  delivered_revenue: number;
  cogs: number;
  operating_cost: number;
  gross_profit: number; // delivered_revenue - cogs - operating_cost (pre-ad-spend)
  cost_missing_units: number;
};

export type SkuProfitAgg = {
  delivered_units: number;
  delivered_revenue: number;
  cogs: number;
  operating_cost: number;
  gross_profit: number;
  cost_missing_units: number;
};

export type BrandProfitTotals = SkuProfitAgg;

const zeroCampaign = (): CampaignProfitAgg => ({
  delivered_orders: 0,
  delivered_units: 0,
  delivered_revenue: 0,
  cogs: 0,
  operating_cost: 0,
  gross_profit: 0,
  cost_missing_units: 0,
});

const zeroSku = (): SkuProfitAgg => ({
  delivered_units: 0,
  delivered_revenue: 0,
  cogs: 0,
  operating_cost: 0,
  gross_profit: 0,
  cost_missing_units: 0,
});

export async function getCampaignProfitMap(
  supabase: any,
  brandId: string,
  from: string,
  to: string,
): Promise<Map<string, CampaignProfitAgg>> {
  const { data, error } = await supabase.rpc("get_campaign_profit", {
    _brand_id: brandId,
    _from: from,
    _to: to,
  });
  if (error) throw error;
  const m = new Map<string, CampaignProfitAgg>();
  for (const r of (data ?? []) as any[]) {
    if (!r?.campaign_id) continue;
    m.set(r.campaign_id, {
      delivered_orders: Number(r.delivered_orders) || 0,
      delivered_units: Number(r.delivered_units) || 0,
      delivered_revenue: Number(r.delivered_revenue) || 0,
      cogs: Number(r.cogs) || 0,
      operating_cost: Number(r.operating_cost) || 0,
      gross_profit: Number(r.gross_profit) || 0,
      cost_missing_units: Number(r.cost_missing_units) || 0,
    });
  }
  return m;
}

export async function getSkuProfitMap(
  supabase: any,
  brandId: string,
  from: string,
  to: string,
): Promise<Map<string, SkuProfitAgg>> {
  const { data, error } = await supabase.rpc("get_sku_profit", {
    _brand_id: brandId,
    _from: from,
    _to: to,
  });
  if (error) throw error;
  const m = new Map<string, SkuProfitAgg>();
  for (const r of (data ?? []) as any[]) {
    if (!r?.product_id) continue;
    m.set(r.product_id, {
      delivered_units: Number(r.delivered_units) || 0,
      delivered_revenue: Number(r.delivered_revenue) || 0,
      cogs: Number(r.cogs) || 0,
      operating_cost: Number(r.operating_cost) || 0,
      gross_profit: Number(r.gross_profit) || 0,
      cost_missing_units: Number(r.cost_missing_units) || 0,
    });
  }
  return m;
}

export async function getBrandProfitTotals(
  supabase: any,
  brandId: string,
  from: string,
  to: string,
): Promise<BrandProfitTotals> {
  const m = await getSkuProfitMap(supabase, brandId, from, to);
  const t = zeroSku();
  for (const r of m.values()) {
    t.delivered_units += r.delivered_units;
    t.delivered_revenue += r.delivered_revenue;
    t.cogs += r.cogs;
    t.operating_cost += r.operating_cost;
    t.gross_profit += r.gross_profit;
    t.cost_missing_units += r.cost_missing_units;
  }
  return t;
}

export function emptyCampaignProfit(): CampaignProfitAgg {
  return zeroCampaign();
}

export function emptySkuProfit(): SkuProfitAgg {
  return zeroSku();
}
