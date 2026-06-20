import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SkuPnlRow = {
  product_id: string | null;
  sku: string | null;
  title: string;
  image: string | null;
  delivered_qty: number;
  returned_qty: number;
  revenue: number;
  cogs: number;
  ad_spend: number;
  manual_expenses: number;
  returns: number;
  net_profit: number;
  margin_pct: number | null;
  roas: number | null;
};

function defaults(d: { from?: string; to?: string }) {
  const today = new Date();
  const to = d.to ?? today.toISOString().slice(0, 10);
  const from = d.from ?? new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export const getSkuPnl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from?: string; to?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ rows: SkuPnlRow[]; unallocated_ad_spend: number; unallocated_manual_expenses: number; from: string; to: string }> => {
    const supabase = context.supabase;
    const { from, to } = defaults(data);
    const toEnd = `${to}T23:59:59.999Z`;
    const fromStart = `${from}T00:00:00.000Z`;

    // 1) Order items in window — delivered + returned
    const { data: items, error: iErr } = await supabase
      .from("order_items")
      .select("product_id, quantity, line_total, unit_cost_snapshot, refund_amount_allocated, orders!inner(status, brand_id, created_at)")
      .eq("orders.brand_id", data.brandId)
      .in("orders.status", ["delivered", "returned"])
      .gte("orders.created_at", fromStart)
      .lte("orders.created_at", toEnd);
    if (iErr) throw iErr;

    type Agg = { delivered_qty: number; returned_qty: number; revenue: number; cogs: number; returns: number };
    const perProduct = new Map<string, Agg>();
    const ensure = (pid: string): Agg => {
      let a = perProduct.get(pid);
      if (!a) { a = { delivered_qty: 0, returned_qty: 0, revenue: 0, cogs: 0, returns: 0 }; perProduct.set(pid, a); }
      return a;
    };

    const productIds = new Set<string>();
    for (const r of (items ?? []) as any[]) {
      if (!r.product_id) continue;
      productIds.add(r.product_id);
      const a = ensure(r.product_id);
      const qty = Number(r.quantity) || 0;
      const lineTotal = Number(r.line_total) || 0;
      const status = r.orders?.status;
      if (status === "delivered") {
        a.delivered_qty += qty;
        a.revenue += lineTotal;
        const unitCost = r.unit_cost_snapshot != null ? Number(r.unit_cost_snapshot) : null;
        if (unitCost != null) a.cogs += unitCost * qty;
        else a.cogs += 0; // fill with WAC below
      } else if (status === "returned") {
        a.returned_qty += qty;
        a.returns += Number(r.refund_amount_allocated) || lineTotal;
      }
    }

    // 2) Product meta + WAC fallback for items without unit_cost_snapshot
    const { data: productsData } = productIds.size
      ? await supabase
          .from("products")
          .select("id, sku, title, image, weighted_avg_cost")
          .in("id", Array.from(productIds))
      : { data: [] as any[] };

    const productMeta = new Map<string, { sku: string | null; title: string; image: string | null; wac: number }>();
    for (const p of (productsData ?? []) as any[]) {
      productMeta.set(p.id, {
        sku: p.sku ?? null,
        title: p.title ?? "Untitled",
        image: p.image ?? null,
        wac: Number(p.weighted_avg_cost) || 0,
      });
    }

    // Fill missing COGS using WAC where unit_cost_snapshot was null
    // (recompute by re-iterating; we already added 0 for nulls)
    for (const r of (items ?? []) as any[]) {
      if (!r.product_id) continue;
      if (r.orders?.status !== "delivered") continue;
      if (r.unit_cost_snapshot != null) continue;
      const meta = productMeta.get(r.product_id);
      if (!meta) continue;
      const a = ensure(r.product_id);
      a.cogs += meta.wac * (Number(r.quantity) || 0);
    }

    // 3) Ad spend allocation per product via campaign weights
    // Get insights per campaign with currency/fx
    const { data: camps } = await supabase
      .from("mkt_campaigns")
      .select("id, mkt_ad_accounts(currency, usd_to_bdt_rate)")
      .eq("brand_id", data.brandId);
    const campFx = new Map<string, number>();
    for (const c of (camps ?? []) as any[]) {
      const cur = (c.mkt_ad_accounts?.currency ?? "USD").toUpperCase();
      const fx = cur === "BDT" ? 1 : (Number(c.mkt_ad_accounts?.usd_to_bdt_rate) || 110);
      campFx.set(c.id, fx);
    }
    const campIds = Array.from(campFx.keys());

    const { data: insights } = campIds.length
      ? await supabase
          .from("mkt_insights_daily")
          .select("campaign_id, spend")
          .in("campaign_id", campIds)
          .gte("date", from)
          .lte("date", to)
      : { data: [] as any[] };
    const campSpendBdt = new Map<string, number>();
    for (const r of (insights ?? []) as any[]) {
      const fx = campFx.get(r.campaign_id) ?? 110;
      campSpendBdt.set(r.campaign_id, (campSpendBdt.get(r.campaign_id) ?? 0) + (Number(r.spend) || 0) * fx);
    }

    const { data: links } = campIds.length
      ? await supabase
          .from("mkt_campaign_products")
          .select("campaign_id, product_id, weight")
          .in("campaign_id", campIds)
      : { data: [] as any[] };

    const linksByCamp = new Map<string, Array<{ product_id: string; weight: number }>>();
    for (const l of (links ?? []) as any[]) {
      const arr = linksByCamp.get(l.campaign_id) ?? [];
      arr.push({ product_id: l.product_id, weight: Number(l.weight) || 0 });
      linksByCamp.set(l.campaign_id, arr);
    }

    const adSpendByProduct = new Map<string, number>();
    let unallocated = 0;
    for (const [campId, spendBdt] of campSpendBdt) {
      if (spendBdt <= 0) continue;
      const ls = linksByCamp.get(campId) ?? [];
      const totalWeight = ls.reduce((s, x) => s + x.weight, 0);
      if (!ls.length || totalWeight <= 0) {
        unallocated += spendBdt;
        continue;
      }
      for (const l of ls) {
        const share = (l.weight / totalWeight) * spendBdt;
        adSpendByProduct.set(l.product_id, (adSpendByProduct.get(l.product_id) ?? 0) + share);
        productIds.add(l.product_id);
      }
    }

    // 3b) Manual expenses (BDT) — direct product_id, or allocated via linked campaign weights
    const { data: manExp } = await supabase
      .from("mkt_manual_expenses")
      .select("amount, currency, product_id, campaign_id")
      .eq("brand_id", data.brandId)
      .gte("date", from)
      .lte("date", to);
    const manualByProduct = new Map<string, number>();
    let unallocatedManual = 0;
    for (const e of (manExp ?? []) as any[]) {
      const cur = (e.currency ?? "BDT").toUpperCase();
      const fx = cur === "BDT" ? 1 : 110;
      const amt = (Number(e.amount) || 0) * fx;
      if (amt <= 0) continue;
      if (e.product_id) {
        manualByProduct.set(e.product_id, (manualByProduct.get(e.product_id) ?? 0) + amt);
        productIds.add(e.product_id);
      } else if (e.campaign_id) {
        const ls = linksByCamp.get(e.campaign_id) ?? [];
        const tw = ls.reduce((s, x) => s + x.weight, 0);
        if (ls.length && tw > 0) {
          for (const l of ls) {
            const share = (l.weight / tw) * amt;
            manualByProduct.set(l.product_id, (manualByProduct.get(l.product_id) ?? 0) + share);
            productIds.add(l.product_id);
          }
        } else {
          unallocatedManual += amt;
        }
      } else {
        unallocatedManual += amt;
      }
    }

    // Ensure meta for products that only appeared via ad allocations
    const missingMeta = Array.from(productIds).filter((id) => !productMeta.has(id));
    if (missingMeta.length) {
      const { data: extra } = await supabase
        .from("products")
        .select("id, sku, title, image, weighted_avg_cost")
        .in("id", missingMeta);
      for (const p of (extra ?? []) as any[]) {
        productMeta.set(p.id, { sku: p.sku ?? null, title: p.title ?? "Untitled", image: p.image ?? null, wac: Number(p.weighted_avg_cost) || 0 });
      }
    }

    // 4) Build rows
    const rows: SkuPnlRow[] = [];
    const allIds = new Set<string>([...perProduct.keys(), ...adSpendByProduct.keys(), ...manualByProduct.keys()]);
    for (const pid of allIds) {
      const a = perProduct.get(pid) ?? { delivered_qty: 0, returned_qty: 0, revenue: 0, cogs: 0, returns: 0 };
      const adSpend = adSpendByProduct.get(pid) ?? 0;
      const manualExp = manualByProduct.get(pid) ?? 0;
      const meta = productMeta.get(pid);
      const net = a.revenue - a.cogs - adSpend - manualExp - a.returns;
      rows.push({
        product_id: pid,
        sku: meta?.sku ?? null,
        title: meta?.title ?? "Unknown product",
        image: meta?.image ?? null,
        delivered_qty: a.delivered_qty,
        returned_qty: a.returned_qty,
        revenue: +a.revenue.toFixed(2),
        cogs: +a.cogs.toFixed(2),
        ad_spend: +adSpend.toFixed(2),
        manual_expenses: +manualExp.toFixed(2),
        returns: +a.returns.toFixed(2),
        net_profit: +net.toFixed(2),
        margin_pct: a.revenue > 0 ? +((net / a.revenue) * 100).toFixed(2) : null,
        roas: adSpend > 0 ? +(a.revenue / adSpend).toFixed(2) : null,
      });
    }
    rows.sort((a, b) => b.net_profit - a.net_profit);
    return { rows, unallocated_ad_spend: +unallocated.toFixed(2), unallocated_manual_expenses: +unallocatedManual.toFixed(2), from, to };
  });
