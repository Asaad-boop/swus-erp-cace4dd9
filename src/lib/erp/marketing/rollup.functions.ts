import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignProfitRow = {
  campaign_id: string;
  campaign_name: string;
  account_name: string | null;
  status: string | null;
  // spend
  ad_spend: number;
  manual_spend: number;
  total_spend: number;
  // results
  confirmed_orders: number;
  delivered_orders: number;
  delivered_revenue: number;
  // costs
  cogs: number;
  operating_cost: number; // courier+packaging+refund allocations
  // derived
  gross_profit: number; // revenue - cogs - op
  net_profit: number; // gross - total_spend
  roas: number | null; // revenue / total_spend
  poas: number | null; // net_profit / total_spend
  profit_margin: number | null; // net_profit / revenue
};

export type ProductProfitRow = {
  product_id: string;
  product_name: string;
  sku: string | null;
  units_sold: number;
  delivered_revenue: number;
  cogs: number;
  operating_cost: number;
  gross_profit: number;
  direct_marketing_spend: number; // manual expenses tagged to product
  allocated_ad_spend: number; // proportional ad spend from attributed orders containing this product
  total_marketing_spend: number;
  net_profit: number;
  roas: number | null;
  poas: number | null;
};

function dateRangeDefaults(input: { from?: string; to?: string }) {
  const today = new Date();
  const to = input.to ?? today.toISOString().slice(0, 10);
  const from =
    input.from ??
    new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

const InputSchema = z.object({
  brandId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const getCampaignProfitRollup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from?: string; to?: string }) => InputSchema.parse(d))
  .handler(async ({ data, context }): Promise<{
    rows: CampaignProfitRow[];
    totals: Omit<CampaignProfitRow, "campaign_id" | "campaign_name" | "account_name" | "status">;
    cost_source: "fifo" | "fx_fallback" | "manual" | "mixed";
    estimated: boolean;
  }> => {
    const supabase = context.supabase;
    const { from, to } = dateRangeDefaults(data);
    const toEnd = `${to}T23:59:59.999Z`;
    const fromStart = `${from}T00:00:00.000Z`;

    const { data: campaigns, error: cErr } = await supabase
      .from("mkt_campaigns")
      .select("id, name, status, effective_status, brand_id, mkt_ad_accounts(id, name, currency, usd_to_bdt_rate)")
      .eq("brand_id", data.brandId)
      .order("name");
    if (cErr) throw cErr;

    const campIds = (campaigns ?? []).map((c: any) => c.id);
    if (!campIds.length) {
      return {
        rows: [],
        totals: emptyTotals(),
        cost_source: "manual",
        estimated: false,
      };
    }

    // Per-brand USD→BDT fallback for accounts without their own rate
    const { getBrandUsdBdt } = await import("./fx.server");
    const brandUsdBdt = await getBrandUsdBdt(supabase, data.brandId);

    // Ad spend per campaign — convert USD → BDT using FIFO when present,
    // else account/brand FX. Raw USD summed straight into BDT totals was
    // the ~110x ROAS inflation bug (Phase 4a — C1 fix).
    const { data: insights } = await supabase
      .from("mkt_insights_daily")
      .select("campaign_id, spend, spend_bdt_fifo, conversion_source, estimated_bdt_cost")
      .in("campaign_id", campIds)
      .gte("date", from)
      .lte("date", to);
    const campFx = new Map<string, number>();
    for (const c of (campaigns ?? []) as any[]) {
      const acc = c.mkt_ad_accounts ?? {};
      const currency: string = (acc.currency ?? "USD").toUpperCase();
      const fx: number = currency === "BDT" ? 1 : (Number(acc.usd_to_bdt_rate) || brandUsdBdt);
      campFx.set(c.id, fx);
    }
    const adSpendMap = new Map<string, number>();
    for (const r of (insights ?? []) as any[]) {
      if (!r.campaign_id) continue;
      const fx = campFx.get(r.campaign_id) ?? brandUsdBdt;
      const fifo = Number(r.spend_bdt_fifo) || 0;
      const bdt = fifo > 0 && r.conversion_source === "fifo"
        ? fifo
        : (Number(r.spend) || 0) * fx;
      adSpendMap.set(r.campaign_id, (adSpendMap.get(r.campaign_id) ?? 0) + bdt);
    }

    // Phase 4a — side-by-side drift check vs canonical get_meta_spend_bdt RPC.
    // Log-only for now; Phase 4a.1 will replace the local sum.
    try {
      let localBdt = 0;
      for (const v of adSpendMap.values()) localBdt += v;
      if (localBdt > 0) {
        const { data: rpcRows } = await supabase.rpc("get_meta_spend_bdt", {
          _brand_id: data.brandId, _from: from, _to: to,
        });
        const rpcSum = ((rpcRows ?? []) as any[]).reduce(
          (s, r) => s + (Number(r.spend_bdt) || 0), 0,
        );
        const drift = localBdt - rpcSum;
        if (Math.abs(drift) >= 0.5) {
          console.warn("[phase4a-drift] rollup", {
            brand: data.brandId, from, to,
            local: +localBdt.toFixed(2),
            rpc: +rpcSum.toFixed(2),
            drift: +drift.toFixed(2),
          });
        }
      }
    } catch (e) {
      console.warn("[phase4a-drift] rollup rpc failed", e);
    }

    // Manual spend per campaign
    const { data: manuals } = await supabase
      .from("mkt_manual_expenses")
      .select("campaign_id, amount")
      .eq("brand_id", data.brandId)
      .in("campaign_id", campIds)
      .gte("date", from)
      .lte("date", to);
    const manualSpendMap = new Map<string, number>();
    for (const r of manuals ?? []) {
      if (!r.campaign_id) continue;
      manualSpendMap.set(r.campaign_id, (manualSpendMap.get(r.campaign_id) ?? 0) + (Number(r.amount) || 0));
    }

    // Attributions → orders with items
    const { data: attribs } = await supabase
      .from("mkt_order_attributions")
      .select(`
        campaign_id,
        orders!inner(
          id, status, total, created_at,
          order_items(line_total, quantity, unit_cost_snapshot, cost_price, courier_cost_allocated, packaging_cost_allocated, refund_amount_allocated)
        )
      `)
      .in("campaign_id", campIds)
      .gte("orders.created_at", fromStart)
      .lte("orders.created_at", toEnd);

    type Agg = {
      confirmed_orders: number;
      delivered_orders: number;
      delivered_revenue: number;
      cogs: number;
      operating_cost: number;
    };
    const aggMap = new Map<string, Agg>();
    for (const r of (attribs ?? []) as any[]) {
      if (!r.campaign_id || !r.orders) continue;
      const order = r.orders;
      const status = order.status as string;
      const cur = aggMap.get(r.campaign_id) ?? {
        confirmed_orders: 0,
        delivered_orders: 0,
        delivered_revenue: 0,
        cogs: 0,
        operating_cost: 0,
      };
      const isCancelled = status === "cancelled" || status === "returned";
      if (!isCancelled) cur.confirmed_orders += 1;
      if (status === "delivered") {
        cur.delivered_orders += 1;
        cur.delivered_revenue += Number(order.total) || 0;
        for (const it of order.order_items ?? []) {
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

    const rows: CampaignProfitRow[] = (campaigns ?? []).map((c: any) => {
      const ad = adSpendMap.get(c.id) ?? 0;
      const man = manualSpendMap.get(c.id) ?? 0;
      const agg = aggMap.get(c.id) ?? { confirmed_orders: 0, delivered_orders: 0, delivered_revenue: 0, cogs: 0, operating_cost: 0 };
      const total_spend = ad + man;
      const gross_profit = agg.delivered_revenue - agg.cogs - agg.operating_cost;
      const net_profit = gross_profit - total_spend;
      return {
        campaign_id: c.id,
        campaign_name: c.name,
        account_name: c.mkt_ad_accounts?.name ?? null,
        status: c.effective_status ?? c.status ?? null,
        ad_spend: ad,
        manual_spend: man,
        total_spend,
        confirmed_orders: agg.confirmed_orders,
        delivered_orders: agg.delivered_orders,
        delivered_revenue: agg.delivered_revenue,
        cogs: agg.cogs,
        operating_cost: agg.operating_cost,
        gross_profit,
        net_profit,
        roas: total_spend > 0 ? agg.delivered_revenue / total_spend : null,
        poas: total_spend > 0 ? net_profit / total_spend : null,
        profit_margin: agg.delivered_revenue > 0 ? net_profit / agg.delivered_revenue : null,
      };
    });

    const totals = rows.reduce<Omit<CampaignProfitRow, "campaign_id" | "campaign_name" | "account_name" | "status">>(
      (acc, r) => {
        acc.ad_spend += r.ad_spend;
        acc.manual_spend += r.manual_spend;
        acc.total_spend += r.total_spend;
        acc.confirmed_orders += r.confirmed_orders;
        acc.delivered_orders += r.delivered_orders;
        acc.delivered_revenue += r.delivered_revenue;
        acc.cogs += r.cogs;
        acc.operating_cost += r.operating_cost;
        acc.gross_profit += r.gross_profit;
        acc.net_profit += r.net_profit;
        return acc;
      },
      emptyTotals(),
    );
    totals.roas = totals.total_spend > 0 ? totals.delivered_revenue / totals.total_spend : null;
    totals.poas = totals.total_spend > 0 ? totals.net_profit / totals.total_spend : null;
    totals.profit_margin = totals.delivered_revenue > 0 ? totals.net_profit / totals.delivered_revenue : null;

    // Cost-source flag: check meta_spend_consumptions in window for these campaigns' ad accounts
    const acctIds = Array.from(
      new Set((campaigns ?? []).map((c: any) => c.mkt_ad_accounts?.id).filter(Boolean)),
    );
    let cost_source: "fifo" | "fx_fallback" | "manual" | "mixed" = "manual";
    let estimated = false;
    if (acctIds.length && totals.ad_spend > 0) {
      const { data: cons } = await supabase
        .from("meta_spend_consumptions")
        .select("conversion_source")
        .in("ad_account_id", acctIds)
        .gte("created_at", fromStart)
        .lte("created_at", toEnd);
      const sources = new Set((cons ?? []).map((c: any) => c.conversion_source));
      if (sources.size === 1) cost_source = (Array.from(sources)[0] as any) ?? "manual";
      else if (sources.size > 1) cost_source = "mixed";
      estimated = sources.has("fx_fallback") || sources.has("mixed");
    }

    return { rows, totals, cost_source, estimated };
  });

function emptyTotals() {
  return {
    ad_spend: 0,
    manual_spend: 0,
    total_spend: 0,
    confirmed_orders: 0,
    delivered_orders: 0,
    delivered_revenue: 0,
    cogs: 0,
    operating_cost: 0,
    gross_profit: 0,
    net_profit: 0,
    roas: null as number | null,
    poas: null as number | null,
    profit_margin: null as number | null,
  };
}

export const getProductProfitRollup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from?: string; to?: string }) => InputSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProductProfitRow[]> => {
    const supabase = context.supabase;
    const { from, to } = dateRangeDefaults(data);
    const toEnd = `${to}T23:59:59.999Z`;
    const fromStart = `${from}T00:00:00.000Z`;

    // 1. Delivered orders for the brand in window with line items
    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select(`
        id, total, status, created_at,
        order_items(product_id, quantity, line_total, unit_cost_snapshot, cost_price, courier_cost_allocated, packaging_cost_allocated, refund_amount_allocated)
      `)
      .eq("brand_id", data.brandId)
      .eq("status", "delivered")
      .gte("created_at", fromStart)
      .lte("created_at", toEnd);
    if (oErr) throw oErr;

    type PAgg = {
      units_sold: number;
      delivered_revenue: number;
      cogs: number;
      operating_cost: number;
    };
    const productAgg = new Map<string, PAgg>();
    const productIds = new Set<string>();
    // Order-level tracking for ad spend allocation
    // orderId → { totalRev, items: [{product_id, line_total}] }
    const orderLines = new Map<string, { totalRev: number; items: { product_id: string; line_total: number }[] }>();

    for (const o of (orders ?? []) as any[]) {
      const items = o.order_items ?? [];
      const totalRev = items.reduce((s: number, it: any) => s + (Number(it.line_total) || 0), 0);
      orderLines.set(o.id, {
        totalRev,
        items: items
          .filter((it: any) => it.product_id)
          .map((it: any) => ({ product_id: it.product_id, line_total: Number(it.line_total) || 0 })),
      });
      for (const it of items) {
        if (!it.product_id) continue;
        productIds.add(it.product_id);
        const qty = Number(it.quantity) || 0;
        const unitCost = Number(it.unit_cost_snapshot ?? it.cost_price) || 0;
        const cur = productAgg.get(it.product_id) ?? { units_sold: 0, delivered_revenue: 0, cogs: 0, operating_cost: 0 };
        cur.units_sold += qty;
        cur.delivered_revenue += Number(it.line_total) || 0;
        cur.cogs += unitCost * qty;
        cur.operating_cost +=
          (Number(it.courier_cost_allocated) || 0) +
          (Number(it.packaging_cost_allocated) || 0) +
          (Number(it.refund_amount_allocated) || 0);
        productAgg.set(it.product_id, cur);
      }
    }

    // 2. Direct manual marketing spend per product
    const { data: manuals } = await supabase
      .from("mkt_manual_expenses")
      .select("product_id, amount")
      .eq("brand_id", data.brandId)
      .not("product_id", "is", null)
      .gte("date", from)
      .lte("date", to);
    const directSpend = new Map<string, number>();
    for (const m of manuals ?? []) {
      if (!m.product_id) continue;
      directSpend.set(m.product_id, (directSpend.get(m.product_id) ?? 0) + (Number(m.amount) || 0));
      productIds.add(m.product_id);
    }

    // 3. Allocated ad spend per product:
    //    For each attribution (campaign → order), allocate campaign ad spend to products
    //    proportional to that order's product line shares × (order_total / campaign_total_attributed_revenue).
    // Simpler approach: per campaign, compute total spend, then for each attributed delivered order,
    // distribute spend by order_revenue share, then per-product by line share.

    const orderIdList = Array.from(orderLines.keys());
    if (orderIdList.length) {
      const { data: attribs } = await supabase
        .from("mkt_order_attributions")
        .select("order_id, campaign_id")
        .in("order_id", orderIdList);

      // group attributions by campaign
      const campToOrders = new Map<string, string[]>();
      const orderToCamp = new Map<string, string>();
      for (const a of attribs ?? []) {
        if (!a.campaign_id || !a.order_id) continue;
        if (orderToCamp.has(a.order_id)) continue; // take first
        orderToCamp.set(a.order_id, a.campaign_id);
        const arr = campToOrders.get(a.campaign_id) ?? [];
        arr.push(a.order_id);
        campToOrders.set(a.campaign_id, arr);
      }

      const campIds = Array.from(campToOrders.keys());
      if (campIds.length) {
        // Fetch campaigns for FX conversion of USD spend → BDT
        const { data: campMeta } = await supabase
          .from("mkt_campaigns")
          .select("id, mkt_ad_accounts(currency, usd_to_bdt_rate)")
          .in("id", campIds);
        const { getBrandUsdBdt } = await import("./fx.server");
        const brandUsdBdt = await getBrandUsdBdt(supabase, data.brandId);
        const campFx = new Map<string, number>();
        for (const c of (campMeta ?? []) as any[]) {
          const cur = ((c.mkt_ad_accounts?.currency ?? "USD") as string).toUpperCase();
          const fx = cur === "BDT" ? 1 : (Number(c.mkt_ad_accounts?.usd_to_bdt_rate) || brandUsdBdt);
          campFx.set(c.id, fx);
        }
        const { data: ins } = await supabase
          .from("mkt_insights_daily")
          .select("campaign_id, spend, spend_bdt_fifo, conversion_source")
          .in("campaign_id", campIds)
          .gte("date", from)
          .lte("date", to);
        const adSpendByCamp = new Map<string, number>();
        for (const r of (ins ?? []) as any[]) {
          if (!r.campaign_id) continue;
          const fx = campFx.get(r.campaign_id) ?? brandUsdBdt;
          const fifo = Number(r.spend_bdt_fifo) || 0;
          const bdt = fifo > 0 && r.conversion_source === "fifo"
            ? fifo
            : (Number(r.spend) || 0) * fx;
          adSpendByCamp.set(r.campaign_id, (adSpendByCamp.get(r.campaign_id) ?? 0) + bdt);
        }

        const allocatedAd = new Map<string, number>();
        for (const [campaign_id, orderIds] of campToOrders.entries()) {
          const campSpend = adSpendByCamp.get(campaign_id) ?? 0;
          if (campSpend <= 0) continue;
          // total attributed revenue for this campaign within window
          let campRev = 0;
          for (const oid of orderIds) {
            campRev += orderLines.get(oid)?.totalRev ?? 0;
          }
          if (campRev <= 0) continue;
          for (const oid of orderIds) {
            const ol = orderLines.get(oid);
            if (!ol || ol.totalRev <= 0) continue;
            const orderSpendShare = (ol.totalRev / campRev) * campSpend;
            for (const it of ol.items) {
              const lineShare = it.line_total / ol.totalRev;
              const share = orderSpendShare * lineShare;
              allocatedAd.set(it.product_id, (allocatedAd.get(it.product_id) ?? 0) + share);
            }
          }
        }

        // merge into productIds set is implicit
        (allocatedAd as any)._byProduct = true;
        // attach via closure variable
        (globalThis as any).__noop = allocatedAd; // avoid lint unused
        // We'll use allocatedAd below
        var finalAllocatedAd = allocatedAd;
      } else {
        var finalAllocatedAd = new Map<string, number>();
      }
    } else {
      var finalAllocatedAd = new Map<string, number>();
    }

    // 4. Lookup product names
    const ids = Array.from(productIds);
    let productInfo = new Map<string, { name: string; sku: string | null }>();
    if (ids.length) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, title, sku")
        .in("id", ids);
      for (const p of prods ?? []) {
        productInfo.set(p.id, { name: (p as any).title, sku: (p as any).sku ?? null });
      }
    }

    const rows: ProductProfitRow[] = ids.map((pid) => {
      const agg = productAgg.get(pid) ?? { units_sold: 0, delivered_revenue: 0, cogs: 0, operating_cost: 0 };
      const direct = directSpend.get(pid) ?? 0;
      const alloc = finalAllocatedAd.get(pid) ?? 0;
      const total_marketing = direct + alloc;
      const gross_profit = agg.delivered_revenue - agg.cogs - agg.operating_cost;
      const net_profit = gross_profit - total_marketing;
      const info = productInfo.get(pid);
      return {
        product_id: pid,
        product_name: info?.name ?? "(unknown product)",
        sku: info?.sku ?? null,
        units_sold: agg.units_sold,
        delivered_revenue: agg.delivered_revenue,
        cogs: agg.cogs,
        operating_cost: agg.operating_cost,
        gross_profit,
        direct_marketing_spend: direct,
        allocated_ad_spend: alloc,
        total_marketing_spend: total_marketing,
        net_profit,
        roas: total_marketing > 0 ? agg.delivered_revenue / total_marketing : null,
        poas: total_marketing > 0 ? net_profit / total_marketing : null,
      };
    });

    rows.sort((a, b) => b.net_profit - a.net_profit);
    return rows;
  });