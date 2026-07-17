import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCampaignProfitMap, type CampaignProfitAgg } from "./canonical.server";

/**
 * Consolidated data for the Meta Reports page (tabs A-G).
 * Filters are applied date/brand at query-time; UI filters (cost source,
 * ad account, campaign, paid-from, estimated-only) operate client-side.
 */

export type MetaReportData = {
  from: string;
  to: string;
  purchases: any[]; // Tab A + G + D + KPI
  wallets: any[];   // Tab B + KPI
  spendByDateAccount: Array<{
    date: string;
    ad_account_id: string;
    ad_account_name: string;
    brand_id: string | null;
    spend_usd: number;
    spend_bdt_fifo: number;
    spend_bdt_fallback: number;
    spend_bdt: number;
    cost_source: "fifo" | "fx_fallback" | "mixed" | "manual";
    estimated: boolean;
  }>; // Tab C
  campaignRows: Array<{
    campaign_id: string;
    campaign_name: string;
    adset_id: string | null;
    adset_name: string | null;
    ad_id: string | null;
    ad_name: string | null;
    ad_account_id: string;
    ad_account_name: string;
    brand_id: string | null;
    spend_usd: number;
    spend_bdt_fifo: number;
    spend_bdt_fallback: number;
    spend_bdt: number;
    cost_source: "fifo" | "fx_fallback" | "mixed" | "manual";
    estimated: boolean;
    meta_purchases: number;
    meta_purchase_value_usd: number;
    confirmed_orders: number;
    delivered_orders: number;
    delivered_revenue_bdt: number;
    confirmed_revenue_bdt: number;
    true_roas: number | null;
    poas: number | null;
    cost_missing_units: number;
  }>; // Tab F
  brandRows: Array<{
    brand_id: string | null;
    brand_name: string;
    spend_usd: number;
    spend_bdt: number;
    spend_bdt_fifo: number;
    spend_bdt_fallback: number;
    cost_source: "fifo" | "fx_fallback" | "mixed" | "manual";
    estimated: boolean;
    orders: number;
    revenue_bdt: number;
    delivered_revenue_bdt: number;
    gross_profit_bdt: number;
    net_profit_bdt: number;
    roas: number | null;
    poas: number | null;
    cost_missing_units: number;
  }>; // Tab E
  filters: {
    adAccounts: Array<{ id: string; name: string; brand_id: string | null }>;
    paidFromAccounts: Array<{ id: string; name: string }>;
    campaigns: Array<{ id: string; name: string }>;
    brands: Array<{ id: string; name: string }>;
  };
  kpis: {
    total_spend_usd: number;
    actual_spend_bdt: number;
    estimated_spend_bdt: number;
    fifo_coverage_pct: number;
    remaining_wallet_usd: number;
    avg_effective_rate: number | null;
    total_fees: number;
    net_marketing_cost_bdt: number;
  };
};

function classifySource(fifo: number, fallback: number): "fifo" | "fx_fallback" | "mixed" | "manual" {
  if (fifo <= 0 && fallback <= 0) return "manual";
  if (fifo > 0 && fallback > 0) return "mixed";
  if (fifo > 0) return "fifo";
  return "fx_fallback";
}

export const getMetaReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; from: string; to: string }) =>
    z.object({
      brandIds: z.array(z.string().uuid()).optional(),
      from: z.string(),
      to: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<MetaReportData> => {
    const supabase = context.supabase;
    const { from, to } = data;
    const brandIds = data.brandIds ?? [];

    // Brand FX (per first selected brand, fallback global latest)
    const fxQ = supabase
      .from("erp_fx_rates")
      .select("rate, brand_id")
      .eq("from_ccy", "USD").eq("to_ccy", "BDT")
      .order("rate_date", { ascending: false }).limit(50);
    const { data: fxRows } = await fxQ;
    const fxByBrand = new Map<string, number>();
    let globalFx = 0;
    for (const r of fxRows ?? []) {
      const rate = Number(r.rate) || 0;
      if (!rate) continue;
      if (r.brand_id && !fxByBrand.has(r.brand_id)) fxByBrand.set(r.brand_id, rate);
      if (!globalFx) globalFx = rate;
    }

    // Ad accounts (with FX), brands, paid-from accounts, campaigns/adsets/ads
    const accQ = brandIds.length
      ? supabase.from("mkt_ad_accounts").select("id, name, brand_id, currency, usd_to_bdt_rate").in("brand_id", brandIds)
      : supabase.from("mkt_ad_accounts").select("id, name, brand_id, currency, usd_to_bdt_rate");
    const brQ = supabase.from("brands").select("id, name").eq("is_active", true);
    const payQ = supabase.from("erp_accounts").select("id, name, account_type").eq("is_active", true);
    const campQ = brandIds.length
      ? supabase.from("mkt_campaigns").select("id, name, account_id, brand_id").in("brand_id", brandIds)
      : supabase.from("mkt_campaigns").select("id, name, account_id, brand_id");

    const [accRes, brRes, payRes, campRes] = await Promise.all([accQ, brQ, payQ, campQ]);
    const adAccounts = (accRes.data ?? []) as any[];
    const brands = (brRes.data ?? []) as any[];
    const paidFromAccounts = (payRes.data ?? []) as any[];
    const campaigns = (campRes.data ?? []) as any[];

    const accMap = new Map(adAccounts.map((a) => [a.id, a]));
    const brandNameMap = new Map(brands.map((b) => [b.id, b.name]));
    const campMap = new Map(campaigns.map((c) => [c.id, c]));
    const fxFor = (accId: string): { fx: number; isBdt: boolean } => {
      const a: any = accMap.get(accId);
      const cur = (a?.currency ?? "USD").toUpperCase();
      if (cur === "BDT") return { fx: 1, isBdt: true };
      const rate = Number(a?.usd_to_bdt_rate) || (a?.brand_id ? fxByBrand.get(a.brand_id) : 0) || globalFx;
      return { fx: rate || 0, isBdt: false };
    };

    // Insights in window
    const accIds = adAccounts.map((a) => a.id);
    const { data: insights } = accIds.length
      ? await supabase
          .from("mkt_insights_daily")
          .select("date, account_id, campaign_id, adset_id, ad_id, spend, meta_purchases, meta_purchase_value, spend_bdt_fifo, conversion_source, estimated_bdt_cost")
          .in("account_id", accIds)
          .gte("date", from).lte("date", to)
      : { data: [] as any[] };

    // Adset/Ad names
    const adsetIds = Array.from(new Set((insights ?? []).map((r: any) => r.adset_id).filter(Boolean)));
    const adIds = Array.from(new Set((insights ?? []).map((r: any) => r.ad_id).filter(Boolean)));
    const [adsetRes, adRes] = await Promise.all([
      adsetIds.length ? supabase.from("mkt_adsets").select("id, name").in("id", adsetIds) : Promise.resolve({ data: [] }),
      adIds.length ? supabase.from("mkt_ads").select("id, name").in("id", adIds) : Promise.resolve({ data: [] }),
    ]);
    const adsetMap = new Map((adsetRes.data ?? []).map((a: any) => [a.id, a.name]));
    const adMap = new Map((adRes.data ?? []).map((a: any) => [a.id, a.name]));

    // ── Tab C: spend by date×account ──
    const spendKey = (date: string, accId: string) => `${date}|${accId}`;
    const dateAccMap = new Map<string, { fifo: number; fallback: number; usd: number }>();
    // ── Tab F: per ad row ──
    const adRowMap = new Map<string, { fifo: number; fallback: number; usd: number; mp: number; mpv: number; accId: string; campId: string | null; adsetId: string | null; adId: string | null }>();
    for (const r of (insights ?? []) as any[]) {
      const { fx, isBdt } = fxFor(r.account_id);
      const usd = Number(r.spend) || 0;
      const fifo = Number(r.spend_bdt_fifo) || 0;
      const useFifo = fifo > 0 && r.conversion_source === "fifo";
      const fb = useFifo ? 0 : (isBdt ? usd : usd * fx);
      const ff = useFifo ? fifo : 0;
      const dk = spendKey(r.date, r.account_id);
      const dc = dateAccMap.get(dk) ?? { fifo: 0, fallback: 0, usd: 0 };
      dc.fifo += ff; dc.fallback += fb; dc.usd += usd;
      dateAccMap.set(dk, dc);

      const rk = `${r.account_id}|${r.campaign_id ?? "-"}|${r.adset_id ?? "-"}|${r.ad_id ?? "-"}`;
      const ar = adRowMap.get(rk) ?? { fifo: 0, fallback: 0, usd: 0, mp: 0, mpv: 0, accId: r.account_id, campId: r.campaign_id, adsetId: r.adset_id, adId: r.ad_id };
      ar.fifo += ff; ar.fallback += fb; ar.usd += usd;
      ar.mp += Number(r.meta_purchases) || 0; ar.mpv += Number(r.meta_purchase_value) || 0;
      adRowMap.set(rk, ar);
    }

    const spendByDateAccount: MetaReportData["spendByDateAccount"] = [];
    for (const [k, v] of dateAccMap) {
      const [date, accId] = k.split("|");
      const a: any = accMap.get(accId);
      spendByDateAccount.push({
        date, ad_account_id: accId,
        ad_account_name: a?.name ?? "—", brand_id: a?.brand_id ?? null,
        spend_usd: +v.usd.toFixed(2),
        spend_bdt_fifo: +v.fifo.toFixed(2),
        spend_bdt_fallback: +v.fallback.toFixed(2),
        spend_bdt: +(v.fifo + v.fallback).toFixed(2),
        cost_source: classifySource(v.fifo, v.fallback),
        estimated: v.fallback > 0,
      });
    }
    spendByDateAccount.sort((a, b) => b.date.localeCompare(a.date) || a.ad_account_name.localeCompare(b.ad_account_name));

    // Attributions (revenue, orders) per campaign in window
    const campIds = campaigns.map((c) => c.id);
    const fromIso = `${from}T00:00:00.000Z`;
    const toIso = `${to}T23:59:59.999Z`;
    const { data: attribs } = campIds.length
      ? await supabase
          .from("mkt_order_attributions")
          .select("campaign_id, orders!inner(id, status, total, created_at, brand_id, order_items(quantity, unit_cost_snapshot, cost_price, courier_cost_allocated, packaging_cost_allocated, refund_amount_allocated))")
          .in("campaign_id", campIds)
          .gte("orders.created_at", fromIso)
          .lte("orders.created_at", toIso)
      : { data: [] as any[] };

    type CAgg = { confirmed: number; delivered: number; rev_confirmed: number; rev_delivered: number; cogs: number; opex: number };
    const cAgg = new Map<string, CAgg>();
    for (const r of (attribs ?? []) as any[]) {
      if (!r.campaign_id || !r.orders) continue;
      const o = r.orders;
      const cur = cAgg.get(r.campaign_id) ?? { confirmed: 0, delivered: 0, rev_confirmed: 0, rev_delivered: 0, cogs: 0, opex: 0 };
      const st = o.status as string;
      const total = Number(o.total) || 0;
      if (st !== "cancelled" && st !== "returned") { cur.confirmed += 1; cur.rev_confirmed += total; }
      cAgg.set(r.campaign_id, cur);
    }

    // Phase 4a.1 — canonical delivered orders / revenue / COGS / opex per campaign,
    // merged across all selected brands. Confirmed_* stays attribution-derived.
    const scopedBrands = brandIds.length ? brandIds : Array.from(new Set(campaigns.map((c: any) => c.brand_id).filter(Boolean))) as string[];
    const canonicalMap = new Map<string, CampaignProfitAgg>();
    if (scopedBrands.length) {
      const perBrand = await Promise.all(
        scopedBrands.map((bid) => getCampaignProfitMap(supabase, bid, from, to)),
      );
      for (const m of perBrand) for (const [k, v] of m) canonicalMap.set(k, v);
    }
    for (const c of campaigns as any[]) {
      const canon = canonicalMap.get(c.id);
      if (!canon) continue;
      const cur = cAgg.get(c.id) ?? { confirmed: 0, delivered: 0, rev_confirmed: 0, rev_delivered: 0, cogs: 0, opex: 0 };
      cur.delivered = canon.delivered_orders;
      cur.rev_delivered = canon.delivered_revenue;
      cur.cogs = canon.cogs;
      cur.opex = canon.operating_cost;
      cAgg.set(c.id, cur);
    }

    // Tab F rows (one per ad/adset/campaign combo)
    const campaignRows: MetaReportData["campaignRows"] = [];
    for (const ar of adRowMap.values()) {
      const a: any = accMap.get(ar.accId);
      const c: any = ar.campId ? campMap.get(ar.campId) : null;
      const agg = ar.campId ? cAgg.get(ar.campId) : undefined;
      // attribute revenue proportionally by spend share within campaign (approx)
      // For simplicity expose campaign-level totals on each row; UI can group.
      const bdt = ar.fifo + ar.fallback;
      const true_roas = bdt > 0 && agg ? agg.rev_delivered / bdt : null;
      const profit = agg ? (agg.rev_delivered - agg.cogs - agg.opex - bdt) : null;
      const poas = bdt > 0 && profit != null ? profit / bdt : null;
      campaignRows.push({
        campaign_id: ar.campId ?? "—",
        campaign_name: c?.name ?? "—",
        adset_id: ar.adsetId, adset_name: ar.adsetId ? adsetMap.get(ar.adsetId) ?? null : null,
        ad_id: ar.adId, ad_name: ar.adId ? adMap.get(ar.adId) ?? null : null,
        ad_account_id: ar.accId, ad_account_name: a?.name ?? "—",
        brand_id: a?.brand_id ?? null,
        spend_usd: +ar.usd.toFixed(2),
        spend_bdt_fifo: +ar.fifo.toFixed(2),
        spend_bdt_fallback: +ar.fallback.toFixed(2),
        spend_bdt: +bdt.toFixed(2),
        cost_source: classifySource(ar.fifo, ar.fallback),
        estimated: ar.fallback > 0,
        meta_purchases: ar.mp,
        meta_purchase_value_usd: +ar.mpv.toFixed(2),
        confirmed_orders: agg?.confirmed ?? 0,
        delivered_orders: agg?.delivered ?? 0,
        delivered_revenue_bdt: +(agg?.rev_delivered ?? 0).toFixed(2),
        confirmed_revenue_bdt: +(agg?.rev_confirmed ?? 0).toFixed(2),
        true_roas, poas,
        cost_missing_units: ar.campId ? (canonicalMap.get(ar.campId)?.cost_missing_units ?? 0) : 0,
      });
    }
    campaignRows.sort((a, b) => b.spend_bdt - a.spend_bdt);

    // Tab E: brand rollup
    type BAgg = { fifo: number; fallback: number; usd: number; orders: number; rev: number; del_rev: number; cogs: number; opex: number; cost_missing_units: number };
    const bAgg = new Map<string, BAgg>();
    const bEnsure = (bid: string | null) => {
      const k = bid ?? "—";
      let v = bAgg.get(k);
      if (!v) { v = { fifo: 0, fallback: 0, usd: 0, orders: 0, rev: 0, del_rev: 0, cogs: 0, opex: 0, cost_missing_units: 0 }; bAgg.set(k, v); }
      return v;
    };
    for (const r of spendByDateAccount) {
      const v = bEnsure(r.brand_id);
      v.fifo += r.spend_bdt_fifo; v.fallback += r.spend_bdt_fallback; v.usd += r.spend_usd;
    }
    for (const c of campaigns as any[]) {
      const agg = cAgg.get(c.id);
      if (!agg) continue;
      const v = bEnsure(c.brand_id);
      v.orders += agg.confirmed;
      v.rev += agg.rev_confirmed;
      v.del_rev += agg.rev_delivered;
      v.cogs += agg.cogs;
      v.opex += agg.opex;
      const canon = canonicalMap.get(c.id);
      if (canon) v.cost_missing_units += canon.cost_missing_units;
    }
    const brandRows: MetaReportData["brandRows"] = [];
    for (const [k, v] of bAgg) {
      const bdt = v.fifo + v.fallback;
      const profit = v.del_rev - v.cogs - v.opex - bdt;
      brandRows.push({
        brand_id: k === "—" ? null : k,
        brand_name: brandNameMap.get(k) ?? "Unassigned",
        spend_usd: +v.usd.toFixed(2),
        spend_bdt: +bdt.toFixed(2),
        spend_bdt_fifo: +v.fifo.toFixed(2),
        spend_bdt_fallback: +v.fallback.toFixed(2),
        cost_source: classifySource(v.fifo, v.fallback),
        estimated: v.fallback > 0,
        orders: v.orders,
        revenue_bdt: +v.rev.toFixed(2),
        delivered_revenue_bdt: +v.del_rev.toFixed(2),
        gross_profit_bdt: +(v.del_rev - v.cogs).toFixed(2),
        net_profit_bdt: +profit.toFixed(2),
        roas: bdt > 0 ? +(v.del_rev / bdt).toFixed(2) : null,
        poas: bdt > 0 ? +(profit / bdt).toFixed(2) : null,
        cost_missing_units: v.cost_missing_units,
      });
    }
    brandRows.sort((a, b) => b.spend_bdt - a.spend_bdt);

    // Dollar purchases (Tabs A, D, G)
    let pQ = supabase
      .from("meta_dollar_purchases")
      .select(`
        id, purchase_date, status, usd_amount, usd_rate, fee_bdt, bdt_amount, total_bdt, effective_rate,
        payment_method, reference, supplier_name,
        brand_id, ad_account_id, paid_from_account_id,
        brands:brand_id (id, name),
        mkt_ad_accounts:ad_account_id (id, name),
        erp_accounts:paid_from_account_id (id, name, account_type)
      `)
      .gte("purchase_date", from)
      .lte("purchase_date", to)
      .order("purchase_date", { ascending: false });
    if (brandIds.length) pQ = pQ.in("brand_id", brandIds);
    const { data: purchases } = await pQ;

    // Wallet summary (Tab B + KPI)
    let wQ = supabase.from("v_meta_ad_wallet_summary").select("*");
    if (brandIds.length) wQ = wQ.in("brand_id", brandIds);
    const { data: wallets } = await wQ;

    // KPIs
    const total_spend_usd = spendByDateAccount.reduce((s, r) => s + r.spend_usd, 0);
    const actual_spend_bdt = spendByDateAccount.reduce((s, r) => s + r.spend_bdt_fifo, 0);
    const estimated_spend_bdt = spendByDateAccount.reduce((s, r) => s + r.spend_bdt_fallback, 0);
    const totalBdt = actual_spend_bdt + estimated_spend_bdt;
    const fifo_coverage_pct = totalBdt > 0 ? (actual_spend_bdt / totalBdt) * 100 : 0;
    const remaining_wallet_usd = (wallets ?? []).reduce((s: number, w: any) => s + (Number(w.remaining_usd) || 0), 0);
    const ratesArr = (wallets ?? []).map((w: any) => Number(w.avg_effective_rate)).filter((r) => r > 0);
    const avg_effective_rate = ratesArr.length ? ratesArr.reduce((s, r) => s + r, 0) / ratesArr.length : null;
    const total_fees = (purchases ?? []).filter((p: any) => p.status === "confirmed").reduce((s: number, p: any) => s + (Number(p.fee_bdt) || 0), 0);

    return {
      from, to,
      purchases: (purchases ?? []) as any[],
      wallets: (wallets ?? []) as any[],
      spendByDateAccount,
      campaignRows,
      brandRows,
      filters: {
        adAccounts: adAccounts.map((a) => ({ id: a.id, name: a.name, brand_id: a.brand_id })),
        paidFromAccounts: paidFromAccounts.map((a) => ({ id: a.id, name: a.name })),
        campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
        brands: brands.map((b) => ({ id: b.id, name: b.name })),
      },
      kpis: {
        total_spend_usd: +total_spend_usd.toFixed(2),
        actual_spend_bdt: +actual_spend_bdt.toFixed(2),
        estimated_spend_bdt: +estimated_spend_bdt.toFixed(2),
        fifo_coverage_pct: +fifo_coverage_pct.toFixed(1),
        remaining_wallet_usd: +remaining_wallet_usd.toFixed(2),
        avg_effective_rate: avg_effective_rate != null ? +avg_effective_rate.toFixed(4) : null,
        total_fees: +total_fees.toFixed(2),
        net_marketing_cost_bdt: +totalBdt.toFixed(2),
      },
    };
  });