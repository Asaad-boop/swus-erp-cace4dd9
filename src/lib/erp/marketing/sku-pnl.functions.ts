import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSkuProfitMap } from "./canonical.server";

export type SkuPnlRow = {
  product_id: string | null;
  sku: string | null;
  title: string;
  image: string | null;
  // Revenue breakdown
  gross_revenue: number;
  sellable_returns: number;
  damaged_returns: number;
  net_revenue: number;
  // Courier deductions (Phase 2 — actual amount courier paid us)
  courier_fees: number;
  net_revenue_after_courier: number;
  // COGS breakdown
  gross_cogs: number;
  cogs_reversed: number;
  net_cogs: number;
  damaged_cogs_loss: number;
  // Profit
  gross_profit: number;
  // Phase 4a.1 — canonical cost-completeness flag
  cost_missing_units: number;
  total_ad_spend: number;
  influencer_spend: number;
  ugc_spend: number;
  other_marketing: number;
  total_marketing: number;
  // FIFO Meta cost-source breakdown
  meta_spend_usd: number;
  meta_spend_bdt_actual: number; // FIFO portion
  meta_spend_bdt_fallback: number; // FX-converted portion
  cost_source: "fifo" | "fx_fallback" | "manual" | "mixed";
  estimated_bdt_cost: boolean;
  net_profit: number;
  net_profit_after_courier: number;
  margin_pct: number | null;
  roas: number | null;
  // Units
  units_sold: number;
  units_returned_sellable: number;
  units_returned_damaged: number;
  net_units_sold: number;
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
    const { getBrandUsdBdt } = await import("./fx.server");
    const brandUsdBdt = await getBrandUsdBdt(context.supabase, data.brandId);
    const supabase = context.supabase;
    const { from, to } = defaults(data);
    const toEnd = `${to}T23:59:59.999Z`;
    const fromStart = `${from}T00:00:00.000Z`;

    // 1) Delivered order items in window
    // Phase 4a.1 — canonical per-product revenue + COGS. Deterministic
    // fallback chain (snapshot → variant WAC → product WAC → cost_price).
    // Same source as Campaigns / Rollup / Dashboard.
    const skuCanonical = await getSkuProfitMap(supabase, data.brandId, from, to);

    type Agg = {
      units_sold: number;
      gross_revenue: number;
      gross_cogs: number;
      courier_fees: number;
      cost_missing_units: number;
      units_returned_sellable: number;
      units_returned_damaged: number;
      sellable_returns: number;
      damaged_returns: number;
      cogs_reversed: number;
      damaged_cogs_loss: number;
    };
    const perProduct = new Map<string, Agg>();
    const ensure = (pid: string): Agg => {
      let a = perProduct.get(pid);
      if (!a) {
        a = {
          units_sold: 0, gross_revenue: 0, gross_cogs: 0,
          courier_fees: 0, cost_missing_units: 0,
          units_returned_sellable: 0, units_returned_damaged: 0,
          sellable_returns: 0, damaged_returns: 0,
          cogs_reversed: 0, damaged_cogs_loss: 0,
        };
        perProduct.set(pid, a);
      }
      return a;
    };

    const productIds = new Set<string>();
    for (const [pid, canon] of skuCanonical) {
      productIds.add(pid);
      const a = ensure(pid);
      a.units_sold = canon.delivered_units;
      a.gross_revenue = canon.delivered_revenue;
      a.gross_cogs = canon.cogs;
      a.courier_fees = canon.operating_cost; // courier + packaging + refund (was courier_fees alone before)
      a.cost_missing_units = canon.cost_missing_units;
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

    // (WAC fallback now handled by canonical get_sku_profit — deterministic
    // fallback chain runs in Postgres, so no post-hoc fill needed here.)

    // 2b) Returns from erp_return_cases — split by item_condition (sellable vs damaged/dispose)
    const { data: returns, error: rErr } = await supabase
      .from("erp_return_cases")
      .select("product_id, qty, refund_amount, item_condition, created_at")
      .eq("brand_id", data.brandId)
      .gte("created_at", fromStart)
      .lte("created_at", toEnd);
    if (rErr) throw rErr;

    for (const r of (returns ?? []) as any[]) {
      if (!r.product_id) continue;
      productIds.add(r.product_id);
      const a = ensure(r.product_id);
      const qty = Number(r.qty) || 0;
      const refund = Number(r.refund_amount) || 0;
      const cond = String(r.item_condition ?? "").toLowerCase();
      const isSellable = cond === "sellable";
      if (isSellable) {
        a.units_returned_sellable += qty;
        a.sellable_returns += refund;
      } else {
        a.units_returned_damaged += qty;
        a.damaged_returns += refund;
      }
    }

    // Make sure return-only products have meta loaded
    const returnOnly = Array.from(productIds).filter((id) => !productMeta.has(id));
    if (returnOnly.length) {
      const { data: extra } = await supabase
        .from("products")
        .select("id, sku, title, image, weighted_avg_cost")
        .in("id", returnOnly);
      for (const p of (extra ?? []) as any[]) {
        productMeta.set(p.id, { sku: p.sku ?? null, title: p.title ?? "Untitled", image: p.image ?? null, wac: Number(p.weighted_avg_cost) || 0 });
      }
    }

    // Now apply WAC to return COGS adjustments
    for (const [pid, a] of perProduct) {
      const wac = productMeta.get(pid)?.wac ?? 0;
      a.cogs_reversed = wac * a.units_returned_sellable;
      a.damaged_cogs_loss = wac * a.units_returned_damaged;
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
      const fx = cur === "BDT" ? 1 : (Number(c.mkt_ad_accounts?.usd_to_bdt_rate) || brandUsdBdt);
      campFx.set(c.id, fx);
    }
    const campIds = Array.from(campFx.keys());

    const { data: insights } = campIds.length
      ? await supabase
          .from("mkt_insights_daily")
          .select("campaign_id, spend, spend_bdt_fifo, conversion_source, estimated_bdt_cost")
          .in("campaign_id", campIds)
          .gte("date", from)
          .lte("date", to)
      : { data: [] as any[] };
    type CampSpend = {
      bdt: number;
      usd: number;
      fifo_bdt: number;
      fallback_bdt: number;
      fifo_rows: number;
      fallback_rows: number;
    };
    const campSpend = new Map<string, CampSpend>();
    for (const r of (insights ?? []) as any[]) {
      const fx = campFx.get(r.campaign_id) ?? brandUsdBdt;
      const usd = Number(r.spend) || 0;
      const fifo = Number(r.spend_bdt_fifo) || 0;
      const cur = campSpend.get(r.campaign_id) ?? { bdt: 0, usd: 0, fifo_bdt: 0, fallback_bdt: 0, fifo_rows: 0, fallback_rows: 0 };
      cur.usd += usd;
      if (fifo > 0 && r.conversion_source === "fifo") {
        cur.bdt += fifo;
        cur.fifo_bdt += fifo;
        cur.fifo_rows += 1;
      } else {
        const fb = usd * fx;
        cur.bdt += fb;
        cur.fallback_bdt += fb;
        cur.fallback_rows += 1;
      }
      campSpend.set(r.campaign_id, cur);
    }

    // Phase 4a — side-by-side drift check vs canonical get_meta_spend_bdt RPC.
    // Log-only; Phase 4a.1 will replace the local sum.
    try {
      let localBdt = 0;
      for (const v of campSpend.values()) localBdt += v.bdt;
      if (localBdt > 0) {
        const { data: rpcRows } = await supabase.rpc("get_meta_spend_bdt", {
          _brand_id: data.brandId, _from: from, _to: to,
        });
        const rpcSum = ((rpcRows ?? []) as any[]).reduce(
          (s, r) => s + (Number(r.spend_bdt) || 0), 0,
        );
        const drift = localBdt - rpcSum;
        if (Math.abs(drift) >= 0.5) {
          console.warn("[phase4a-drift] sku-pnl", {
            brand: data.brandId, from, to,
            local: +localBdt.toFixed(2),
            rpc: +rpcSum.toFixed(2),
            drift: +drift.toFixed(2),
          });
        }
      }
    } catch (e) {
      console.warn("[phase4a-drift] sku-pnl rpc failed", e);
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

    type ProdMeta = { bdt: number; usd: number; fifo_bdt: number; fallback_bdt: number };
    const adSpendByProduct = new Map<string, ProdMeta>();
    let unallocated = 0;
    for (const [campId, sp] of campSpend) {
      if (sp.bdt <= 0 && sp.usd <= 0) continue;
      const ls = linksByCamp.get(campId) ?? [];
      const totalWeight = ls.reduce((s, x) => s + x.weight, 0);
      if (!ls.length || totalWeight <= 0) {
        unallocated += sp.bdt;
        continue;
      }
      for (const l of ls) {
        const w = l.weight / totalWeight;
        const cur = adSpendByProduct.get(l.product_id) ?? { bdt: 0, usd: 0, fifo_bdt: 0, fallback_bdt: 0 };
        cur.bdt += w * sp.bdt;
        cur.usd += w * sp.usd;
        cur.fifo_bdt += w * sp.fifo_bdt;
        cur.fallback_bdt += w * sp.fallback_bdt;
        adSpendByProduct.set(l.product_id, cur);
        productIds.add(l.product_id);
      }
    }

    // 3b) Manual expenses (BDT) — broken out by category (influencer / content=ugc / other)
    const { data: manExp } = await supabase
      .from("mkt_manual_expenses")
      .select("amount, currency, product_id, campaign_id, category")
      .eq("brand_id", data.brandId)
      .gte("date", from)
      .lte("date", to);
    type ManualAgg = { influencer: number; ugc: number; other: number };
    const manualByProduct = new Map<string, ManualAgg>();
    const ensureManual = (pid: string): ManualAgg => {
      let m = manualByProduct.get(pid);
      if (!m) { m = { influencer: 0, ugc: 0, other: 0 }; manualByProduct.set(pid, m); }
      return m;
    };
    const bucketFor = (cat: string | null): keyof ManualAgg => {
      const c = (cat ?? "").toLowerCase();
      if (c === "influencer") return "influencer";
      if (c === "content" || c === "ugc") return "ugc";
      return "other";
    };
    let unallocatedManual = 0;
    for (const e of (manExp ?? []) as any[]) {
      const cur = (e.currency ?? "BDT").toUpperCase();
      // Use brand's real USD→BDT rate; skip row silently if none configured
      // (hardcoded fallbacks hide bad data — Phase 4a rule).
      const fx = cur === "BDT" ? 1 : brandUsdBdt;
      if (cur !== "BDT" && fx <= 0) continue;
      const amt = (Number(e.amount) || 0) * fx;
      if (amt <= 0) continue;
      // Skip meta_ads here — already counted via mkt_insights_daily
      if ((e.category ?? "").toString().toLowerCase() === "meta_ads") continue;
      const bucket = bucketFor(e.category);
      if (e.product_id) {
        ensureManual(e.product_id)[bucket] += amt;
        productIds.add(e.product_id);
      } else if (e.campaign_id) {
        const ls = linksByCamp.get(e.campaign_id) ?? [];
        const tw = ls.reduce((s, x) => s + x.weight, 0);
        if (ls.length && tw > 0) {
          for (const l of ls) {
            const share = (l.weight / tw) * amt;
            ensureManual(l.product_id)[bucket] += share;
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
      const a = perProduct.get(pid) ?? {
        units_sold: 0, gross_revenue: 0, gross_cogs: 0,
        courier_fees: 0, cost_missing_units: 0,
        units_returned_sellable: 0, units_returned_damaged: 0,
        sellable_returns: 0, damaged_returns: 0,
        cogs_reversed: 0, damaged_cogs_loss: 0,
      };
      const adInfo = adSpendByProduct.get(pid) ?? { bdt: 0, usd: 0, fifo_bdt: 0, fallback_bdt: 0 };
      const adSpend = adInfo.bdt;
      const m = manualByProduct.get(pid) ?? { influencer: 0, ugc: 0, other: 0 };
      const meta = productMeta.get(pid);
      const net_revenue = a.gross_revenue - a.sellable_returns - a.damaged_returns;
      const net_revenue_after_courier = net_revenue - a.courier_fees;
      const net_cogs = a.gross_cogs - a.cogs_reversed;
      const gross_profit = net_revenue - net_cogs;
      const total_marketing = adSpend + m.influencer + m.ugc + m.other;
      const net = gross_profit - total_marketing;
      const net_profit_after_courier = net - a.courier_fees;
      const cost_source: SkuPnlRow["cost_source"] =
        adSpend <= 0
          ? "manual"
          : adInfo.fifo_bdt > 0 && adInfo.fallback_bdt > 0
            ? "mixed"
            : adInfo.fifo_bdt > 0
              ? "fifo"
              : "fx_fallback";
      const estimated_bdt_cost = cost_source !== "fifo" && adSpend > 0;
      rows.push({
        product_id: pid,
        sku: meta?.sku ?? null,
        title: meta?.title ?? "Unknown product",
        image: meta?.image ?? null,
        gross_revenue: +a.gross_revenue.toFixed(2),
        sellable_returns: +a.sellable_returns.toFixed(2),
        damaged_returns: +a.damaged_returns.toFixed(2),
        net_revenue: +net_revenue.toFixed(2),
        courier_fees: +a.courier_fees.toFixed(2),
        net_revenue_after_courier: +net_revenue_after_courier.toFixed(2),
        gross_cogs: +a.gross_cogs.toFixed(2),
        cogs_reversed: +a.cogs_reversed.toFixed(2),
        net_cogs: +net_cogs.toFixed(2),
        damaged_cogs_loss: +a.damaged_cogs_loss.toFixed(2),
        gross_profit: +gross_profit.toFixed(2),
        cost_missing_units: a.cost_missing_units,
        total_ad_spend: +adSpend.toFixed(2),
        influencer_spend: +m.influencer.toFixed(2),
        ugc_spend: +m.ugc.toFixed(2),
        other_marketing: +m.other.toFixed(2),
        total_marketing: +total_marketing.toFixed(2),
        meta_spend_usd: +adInfo.usd.toFixed(2),
        meta_spend_bdt_actual: +adInfo.fifo_bdt.toFixed(2),
        meta_spend_bdt_fallback: +adInfo.fallback_bdt.toFixed(2),
        cost_source,
        estimated_bdt_cost,
        net_profit: +net.toFixed(2),
        net_profit_after_courier: +net_profit_after_courier.toFixed(2),
        margin_pct: net_revenue > 0 ? +((net / net_revenue) * 100).toFixed(2) : null,
        roas: total_marketing > 0 ? +(net_revenue / total_marketing).toFixed(2) : null,
        units_sold: a.units_sold,
        units_returned_sellable: a.units_returned_sellable,
        units_returned_damaged: a.units_returned_damaged,
        net_units_sold: a.units_sold - a.units_returned_sellable - a.units_returned_damaged,
      });
    }
    rows.sort((a, b) => b.net_profit - a.net_profit);
    return { rows, unallocated_ad_spend: +unallocated.toFixed(2), unallocated_manual_expenses: +unallocatedManual.toFixed(2), from, to };
  });
