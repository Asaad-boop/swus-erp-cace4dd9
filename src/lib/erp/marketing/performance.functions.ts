import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DecisionBucket = "scale" | "monitor" | "optimize" | "kill" | "insufficient";

export type PerfRow = {
  campaign_id: string;
  external_id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
  account_id: string;
  brand_id: string;
  account_name: string | null;
  account_currency: string;
  fx_rate: number; // 1 unit account currency in BDT
  daily_budget_usd: number | null;
  // Meta
  spend_usd: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  meta_purchases: number;
  meta_purchase_value_usd: number;
  meta_roas: number | null;
  meta_cost_per_purchase: number | null;
  // Actual (BDT)
  spend_bdt: number;
  manual_spend_bdt: number;
  total_spend_bdt: number;
  // FIFO cost-source info (per Step 2)
  spend_bdt_fifo: number;
  cost_source: "fifo" | "fx_fallback" | "manual" | "mixed";
  estimated_bdt_cost: boolean;
  confirmed_orders: number;
  delivered_orders: number;
  delivered_revenue_bdt: number;
  confirmed_revenue_bdt: number;
  cogs_bdt: number;
  operating_cost_bdt: number;
  profit_bdt: number;
  margin_pct: number | null;
  breakeven_revenue_bdt: number;
  is_breakeven: boolean;
  true_roas: number | null;
  confirmed_roas: number | null;
  actual_cost_per_purchase_bdt: number | null;
  // Decision
  decision: DecisionBucket;
  decision_reason: string;
  // Linked products (for visual identification in tables)
  products: Array<{ id: string; title: string | null; image: string | null; sku: string | null }>;
};

export type PerfTotals = {
  active_campaigns: number;
  total_spend_usd: number;
  total_spend_bdt: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  meta_purchases: number;
  meta_purchase_value_usd: number;
  meta_roas: number | null;
  delivered_orders: number;
  delivered_revenue_bdt: number;
  confirmed_orders: number;
  confirmed_revenue_bdt: number;
  cogs_bdt: number;
  operating_cost_bdt: number;
  profit_bdt: number;
  margin_pct: number | null;
  true_roas: number | null;
  confirmed_roas: number | null;
};

function dateRangeDefaults(input: { from?: string; to?: string }) {
  const today = new Date();
  const to = input.to ?? today.toISOString().slice(0, 10);
  const from =
    input.from ?? new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

// Convert a YYYY-MM-DD local-date in the ad account timezone to a UTC ISO string.
// Default offset = Asia/Dhaka (+6h). Ads Manager day-buckets in the account TZ,
// so we must match that window when joining to orders (which are stored UTC).
function localDayToUtcIso(dateStr: string, tzOffsetMinutes: number, endOfDay: boolean) {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const ms = Date.parse(`${dateStr}T${time}Z`) - tzOffsetMinutes * 60_000;
  return new Date(ms).toISOString();
}

// Best-effort offset for an IANA timezone string. We support the few that
// matter for our users; anything else falls back to +6 (Dhaka).
function tzOffsetMinutes(tz: string | null | undefined): number {
  switch ((tz ?? "").trim()) {
    case "Asia/Dhaka":
      return 6 * 60;
    case "Asia/Karachi":
      return 5 * 60;
    case "Asia/Kolkata":
      return 5 * 60 + 30;
    case "UTC":
    case "Etc/UTC":
      return 0;
    default:
      return 6 * 60; // Dhaka default for this app
  }
}

function classify(row: {
  spend_bdt: number;
  delivered_orders: number;
  true_roas: number | null;
  meta_purchases: number;
}): { decision: DecisionBucket; reason: string } {
  // Need at least ~3 USD-equivalent (~330 BDT) spend to judge
  if (row.spend_bdt < 330) {
    return { decision: "insufficient", reason: "Not enough spend to evaluate yet" };
  }
  const r = row.true_roas;
  if (r == null) {
    if (row.meta_purchases > 0) {
      return { decision: "monitor", reason: "Meta shows purchases but no delivered orders yet" };
    }
    return { decision: "kill", reason: "Spend with zero attributed revenue" };
  }
  if (r >= 3) return { decision: "scale", reason: `True ROAS ${r.toFixed(2)}× — scale up budget` };
  if (r >= 2) return { decision: "monitor", reason: `True ROAS ${r.toFixed(2)}× — keep watching` };
  if (r >= 1) return { decision: "optimize", reason: `True ROAS ${r.toFixed(2)}× — optimize creative/audience` };
  return { decision: "kill", reason: `True ROAS ${r.toFixed(2)}× — losing money, pause` };
}

export const getPerformanceDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[]; from?: string; to?: string }) =>
    z
      .object({
        brandId: z.string().uuid().optional(),
        brandIds: z.array(z.string().uuid()).min(1).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .refine((v) => !!v.brandId || (v.brandIds && v.brandIds.length > 0), {
        message: "brandId or brandIds required",
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: PerfRow[]; totals: PerfTotals }> => {
    const supabase = context.supabase;
    const { from, to } = dateRangeDefaults(data);
    const { getBrandUsdBdtMap } = await import("./fx.server");
    const brandIds = data.brandIds && data.brandIds.length ? data.brandIds : [data.brandId!];
    const fxMap = await getBrandUsdBdtMap(supabase, brandIds);
    // Default timezone = Asia/Dhaka (matches Meta Ads Manager day buckets for BD accounts).
    const tzMin = tzOffsetMinutes("Asia/Dhaka");
    const fromStart = localDayToUtcIso(from, tzMin, false);
    const toEnd = localDayToUtcIso(to, tzMin, true);

    const { data: campaigns, error: cErr } = await supabase
      .from("mkt_campaigns")
      .select(
        "id, external_id, name, objective, status, effective_status, account_id, brand_id, daily_budget, mkt_ad_accounts(name, currency, timezone, usd_to_bdt_rate)",
      )
      .in("brand_id", brandIds)
      .order("name");
    if (cErr) throw cErr;
    if (!campaigns?.length) return { rows: [], totals: emptyTotals() };

    const campIds = campaigns.map((c: any) => c.id);

    const { data: insights } = await supabase
      .from("mkt_insights_daily")
      .select(
        "campaign_id, spend, impressions, clicks, meta_purchases, meta_purchase_value, meta_leads, spend_bdt_fifo, conversion_source, estimated_bdt_cost",
      )
      .in("campaign_id", campIds)
      .gte("date", from)
      .lte("date", to);

    type Ins = {
      spend: number;
      impressions: number;
      clicks: number;
      meta_purchases: number;
      meta_purchase_value: number;
      spend_bdt_fifo: number;
      fifo_rows: number;
      fallback_rows: number;
      total_rows: number;
    };
    const insMap = new Map<string, Ins>();
    for (const r of insights ?? []) {
      if (!r.campaign_id) continue;
      const cur = insMap.get(r.campaign_id) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        meta_purchases: 0,
        meta_purchase_value: 0,
        spend_bdt_fifo: 0,
        fifo_rows: 0,
        fallback_rows: 0,
        total_rows: 0,
      };
      cur.spend += Number(r.spend) || 0;
      cur.impressions += Number(r.impressions) || 0;
      cur.clicks += Number(r.clicks) || 0;
      cur.meta_purchases += Number(r.meta_purchases) || 0;
      cur.meta_purchase_value += Number(r.meta_purchase_value) || 0;
      cur.spend_bdt_fifo += Number((r as any).spend_bdt_fifo) || 0;
      cur.total_rows += 1;
      if ((r as any).conversion_source === "fifo") cur.fifo_rows += 1;
      if ((r as any).conversion_source === "fx_fallback" || (r as any).estimated_bdt_cost) cur.fallback_rows += 1;
      insMap.set(r.campaign_id, cur);
    }

    const { data: manuals } = await supabase
      .from("mkt_manual_expenses")
      .select("campaign_id, amount")
      .in("brand_id", brandIds)
      .in("campaign_id", campIds)
      .gte("date", from)
      .lte("date", to);
    const manualMap = new Map<string, number>();
    for (const r of manuals ?? []) {
      if (!r.campaign_id) continue;
      manualMap.set(r.campaign_id, (manualMap.get(r.campaign_id) ?? 0) + (Number(r.amount) || 0));
    }

    const { data: attribs } = await supabase
      .from("mkt_order_attributions")
      .select(
        `campaign_id,
         orders!inner(
           id, status, total, created_at,
           order_items(quantity, unit_cost_snapshot, cost_price, courier_cost_allocated, packaging_cost_allocated, refund_amount_allocated)
         )`,
      )
      .in("campaign_id", campIds)
      .gte("orders.created_at", fromStart)
      .lte("orders.created_at", toEnd);

    type Agg = {
      confirmed_orders: number;
      delivered_orders: number;
      delivered_revenue: number;
      confirmed_revenue: number;
      cogs: number;
      operating_cost: number;
    };
    const aggMap = new Map<string, Agg>();
    for (const r of (attribs ?? []) as any[]) {
      if (!r.campaign_id || !r.orders) continue;
      const o = r.orders;
      const status = o.status as string;
      const cur = aggMap.get(r.campaign_id) ?? {
        confirmed_orders: 0,
        delivered_orders: 0,
        delivered_revenue: 0,
        confirmed_revenue: 0,
        cogs: 0,
        operating_cost: 0,
      };
      if (status !== "cancelled" && status !== "returned") {
        cur.confirmed_orders += 1;
        cur.confirmed_revenue += Number(o.total) || 0;
      }
      if (status === "delivered") {
        cur.delivered_orders += 1;
        cur.delivered_revenue += Number(o.total) || 0;
        for (const it of o.order_items ?? []) {
          const qty = Number(it.quantity) || 0;
          const unitCost = Number(it.unit_cost_snapshot ?? it.cost_price) || 0;
          cur.cogs += unitCost * qty;
          cur.operating_cost +=
            (Number(it.courier_cost_allocated) || 0) +
            (Number(it.packaging_cost_allocated) || 0) +
            (Number(it.refund_amount_allocated) || 0);
        }
      }
      aggMap.set(r.campaign_id, cur);
    }

    // Linked products per campaign — for visual ID in the Performance table
    const { data: prodLinks } = await supabase
      .from("mkt_campaign_products")
      .select("campaign_id, products(id, title, sku, image)")
      .in("campaign_id", campIds);
    const prodMap = new Map<string, PerfRow["products"]>();
    for (const r of (prodLinks ?? []) as any[]) {
      if (!r.campaign_id || !r.products) continue;
      const arr = prodMap.get(r.campaign_id) ?? [];
      arr.push({
        id: r.products.id,
        title: r.products.title ?? null,
        image: r.products.image ?? null,
        sku: r.products.sku ?? null,
      });
      prodMap.set(r.campaign_id, arr);
    }

    const rows: PerfRow[] = (campaigns as any[]).map((c) => {
      const acc = c.mkt_ad_accounts;
      const currency: string = (acc?.currency ?? "USD").toUpperCase();
      const usdFx: number = Number(acc?.usd_to_bdt_rate) || (fxMap.get(c.brand_id) ?? 0);
      // If account currency is BDT, spend is already BDT — do NOT multiply by FX.
      const fx: number = currency === "BDT" ? 1 : usdFx;
      const ins = insMap.get(c.id) ?? {
        spend: 0,
        impressions: 0,
        clicks: 0,
        meta_purchases: 0,
        meta_purchase_value: 0,
        spend_bdt_fifo: 0,
        fifo_rows: 0,
        fallback_rows: 0,
        total_rows: 0,
      };
      const agg =
        aggMap.get(c.id) ?? {
          confirmed_orders: 0,
          delivered_orders: 0,
          delivered_revenue: 0,
          confirmed_revenue: 0,
          cogs: 0,
          operating_cost: 0,
        };
      const manual = manualMap.get(c.id) ?? 0;
      // Prefer FIFO-computed BDT cost when present, else fall back to FX-rate conversion.
      const hasFifo = ins.spend_bdt_fifo > 0;
      const spend_bdt = hasFifo ? ins.spend_bdt_fifo : ins.spend * fx;
      const total_spend_bdt = spend_bdt + manual;
      const cost_source: PerfRow["cost_source"] = !hasFifo
        ? "fx_fallback"
        : ins.fallback_rows > 0 && ins.fifo_rows > 0
        ? "mixed"
        : ins.fallback_rows > 0
        ? "fx_fallback"
        : "fifo";
      const estimated_bdt_cost = cost_source !== "fifo";
      const ctr = ins.impressions > 0 ? (ins.clicks / ins.impressions) * 100 : null;
      const cpc = ins.clicks > 0 ? ins.spend / ins.clicks : null;
      const cpm = ins.impressions > 0 ? (ins.spend / ins.impressions) * 1000 : null;
      const profit = agg.delivered_revenue - agg.cogs - agg.operating_cost - total_spend_bdt;
      const margin = agg.delivered_revenue > 0 ? profit / agg.delivered_revenue : null;
      const breakeven_revenue = agg.cogs + agg.operating_cost + total_spend_bdt;
      const true_roas = total_spend_bdt > 0 ? agg.delivered_revenue / total_spend_bdt : null;
      const confirmed_roas =
        total_spend_bdt > 0 ? agg.confirmed_revenue / total_spend_bdt : null;
      const dec = classify({
        spend_bdt: total_spend_bdt,
        delivered_orders: agg.delivered_orders,
        true_roas,
        meta_purchases: ins.meta_purchases,
      });
      return {
        campaign_id: c.id,
        external_id: c.external_id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        effective_status: c.effective_status,
        account_id: c.account_id,
        brand_id: c.brand_id,
        account_name: acc?.name ?? null,
        account_currency: currency,
        fx_rate: fx,
        daily_budget_usd: c.daily_budget != null ? Number(c.daily_budget) : null,
        spend_usd: ins.spend,
        impressions: ins.impressions,
        clicks: ins.clicks,
        ctr,
        cpc,
        cpm,
        meta_purchases: ins.meta_purchases,
        meta_purchase_value_usd: ins.meta_purchase_value,
        meta_roas: ins.spend > 0 ? ins.meta_purchase_value / ins.spend : null,
        meta_cost_per_purchase: ins.meta_purchases > 0 ? ins.spend / ins.meta_purchases : null,
        spend_bdt,
        manual_spend_bdt: manual,
        total_spend_bdt,
        spend_bdt_fifo: ins.spend_bdt_fifo,
        cost_source,
        estimated_bdt_cost,
        confirmed_orders: agg.confirmed_orders,
        delivered_orders: agg.delivered_orders,
        delivered_revenue_bdt: agg.delivered_revenue,
        confirmed_revenue_bdt: agg.confirmed_revenue,
        cogs_bdt: agg.cogs,
        operating_cost_bdt: agg.operating_cost,
        profit_bdt: profit,
        margin_pct: margin,
        breakeven_revenue_bdt: breakeven_revenue,
        is_breakeven: agg.delivered_revenue >= breakeven_revenue && total_spend_bdt > 0,
        true_roas,
        confirmed_roas,
        actual_cost_per_purchase_bdt:
          agg.delivered_orders > 0 ? total_spend_bdt / agg.delivered_orders : null,
        decision: dec.decision,
        decision_reason: dec.reason,
        products: prodMap.get(c.id) ?? [],
      };
    });

    const totals = rows.reduce<PerfTotals>(
      (t, r) => {
        const isActive = (r.effective_status ?? r.status ?? "").toUpperCase() === "ACTIVE";
        if (isActive) t.active_campaigns += 1;
        t.total_spend_usd += r.spend_usd;
        t.total_spend_bdt += r.total_spend_bdt;
        t.impressions += r.impressions;
        t.clicks += r.clicks;
        t.meta_purchases += r.meta_purchases;
        t.meta_purchase_value_usd += r.meta_purchase_value_usd;
        t.delivered_orders += r.delivered_orders;
        t.delivered_revenue_bdt += r.delivered_revenue_bdt;
        t.confirmed_orders += r.confirmed_orders;
        t.confirmed_revenue_bdt += r.confirmed_revenue_bdt;
        t.cogs_bdt += r.cogs_bdt;
        t.operating_cost_bdt += r.operating_cost_bdt;
        t.profit_bdt += r.profit_bdt;
        return t;
      },
      emptyTotals(),
    );
    totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;
    totals.meta_roas =
      totals.total_spend_usd > 0 ? totals.meta_purchase_value_usd / totals.total_spend_usd : null;
    totals.true_roas =
      totals.total_spend_bdt > 0 ? totals.delivered_revenue_bdt / totals.total_spend_bdt : null;
    totals.confirmed_roas =
      totals.total_spend_bdt > 0 ? totals.confirmed_revenue_bdt / totals.total_spend_bdt : null;
    totals.margin_pct =
      totals.delivered_revenue_bdt > 0 ? totals.profit_bdt / totals.delivered_revenue_bdt : null;

    return { rows, totals };
  });

function emptyTotals(): PerfTotals {
  return {
    active_campaigns: 0,
    total_spend_usd: 0,
    total_spend_bdt: 0,
    impressions: 0,
    clicks: 0,
    ctr: null,
    meta_purchases: 0,
    meta_purchase_value_usd: 0,
    meta_roas: null,
    delivered_orders: 0,
    delivered_revenue_bdt: 0,
    confirmed_orders: 0,
    confirmed_revenue_bdt: 0,
    cogs_bdt: 0,
    operating_cost_bdt: 0,
    profit_bdt: 0,
    margin_pct: null,
    true_roas: null,
    confirmed_roas: null,
  };
}