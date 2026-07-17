import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCampaignProfitMap } from "./canonical.server";

/**
 * Pulse dashboard aggregator (Phase 2).
 *
 * Single call → 4 strips:
 *  1. today       — spend/rev/orders/real-ROAS/CPO (BD today)
 *  2. reality     — Meta-reported vs Confirmed vs Delivered ROAS (BD today)
 *  3. movers      — top-3 + bottom-3 campaigns this week by true ROAS
 *  4. rollup      — today / week / month totals with net profit
 *
 * All money numbers are canonical:
 *   spend_bdt        ← RPC get_meta_spend_bdt
 *   delivered_*      ← RPC get_campaign_profit
 */

export type PulseRollupPeriod = {
  label: "today" | "week" | "month";
  from: string;
  to: string;
  spend_bdt: number;
  delivered_revenue_bdt: number;
  cogs_bdt: number;
  operating_cost_bdt: number;
  gross_profit_bdt: number; // delivered − cogs − opex (pre-ad-spend)
  net_profit_bdt: number; // gross − ad-spend
  delivered_orders: number;
  cost_missing_units: number;
};

export type PulseMover = {
  campaign_id: string;
  name: string;
  status: string;
  spend_bdt: number;
  delivered_revenue_bdt: number;
  gross_profit_bdt: number;
  net_profit_bdt: number;
  true_roas: number | null;
  delivered_orders: number;
  cost_missing_units: number;
  sparkline_spend_bdt: number[]; // 7 daily points
};

export type PulseData = {
  today: {
    date_bd: string;
    spend_bdt: number;
    spend_usd: number;
    delivered_revenue_bdt: number;
    confirmed_revenue_bdt: number;
    meta_revenue_bdt: number;
    delivered_orders: number;
    confirmed_orders: number;
    meta_orders: number;
    delivered_roas: number | null;
    confirmed_roas: number | null;
    meta_roas: number | null;
    cpo_bdt: number | null;
    cost_missing_units: number;
  };
  rollup: {
    today: PulseRollupPeriod;
    week: PulseRollupPeriod;
    month: PulseRollupPeriod;
  };
  movers: {
    top: PulseMover[];
    bottom: PulseMover[];
    window: { from: string; to: string };
  };
};

const BD_OFFSET_MS = 6 * 3600 * 1000;
const bdDateStr = (d: Date) =>
  new Date(d.getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
const bdDayUtcRange = (dateStr: string) => {
  const start = new Date(`${dateStr}T00:00:00.000Z`).getTime() - BD_OFFSET_MS;
  return {
    startUtc: new Date(start).toISOString(),
    endUtc: new Date(start + 24 * 3600 * 1000).toISOString(),
  };
};

async function sumSpendBdt(
  supabase: any,
  brandIds: string[],
  from: string,
  to: string,
): Promise<number> {
  let total = 0;
  for (const bid of brandIds) {
    const { data, error } = await supabase.rpc("get_meta_spend_bdt", {
      _brand_id: bid,
      _from: from,
      _to: to,
    });
    if (error) continue;
    for (const r of (data ?? []) as any[]) total += Number(r.spend_bdt) || 0;
  }
  return total;
}

async function sumCampaignProfit(
  supabase: any,
  brandIds: string[],
  from: string,
  to: string,
) {
  let delivered_revenue = 0,
    cogs = 0,
    operating_cost = 0,
    gross_profit = 0,
    delivered_orders = 0,
    cost_missing_units = 0;
  for (const bid of brandIds) {
    const m = await getCampaignProfitMap(supabase, bid, from, to).catch(
      () => new Map(),
    );
    for (const v of m.values()) {
      delivered_revenue += v.delivered_revenue;
      cogs += v.cogs;
      operating_cost += v.operating_cost;
      gross_profit += v.gross_profit;
      delivered_orders += v.delivered_orders;
      cost_missing_units += v.cost_missing_units;
    }
  }
  return {
    delivered_revenue,
    cogs,
    operating_cost,
    gross_profit,
    delivered_orders,
    cost_missing_units,
  };
}

async function buildPeriod(
  supabase: any,
  brandIds: string[],
  label: PulseRollupPeriod["label"],
  from: string,
  to: string,
): Promise<PulseRollupPeriod> {
  const [spend, profit] = await Promise.all([
    sumSpendBdt(supabase, brandIds, from, to),
    sumCampaignProfit(supabase, brandIds, from, to),
  ]);
  return {
    label,
    from,
    to,
    spend_bdt: spend,
    delivered_revenue_bdt: profit.delivered_revenue,
    cogs_bdt: profit.cogs,
    operating_cost_bdt: profit.operating_cost,
    gross_profit_bdt: profit.gross_profit,
    net_profit_bdt: profit.gross_profit - spend,
    delivered_orders: profit.delivered_orders,
    cost_missing_units: profit.cost_missing_units,
  };
}

export const getMarketingPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) =>
    z
      .object({ brandIds: z.array(z.string().uuid()).min(1) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PulseData> => {
    const supabase = context.supabase;
    const { brandIds } = data;
    const now = new Date();
    const todayBD = bdDateStr(now);
    const weekFrom = bdDateStr(new Date(now.getTime() - 6 * 24 * 3600 * 1000));
    const monthFrom = todayBD.slice(0, 7) + "-01";

    // ── Rollup (3 periods in parallel) ──
    const [todayP, weekP, monthP] = await Promise.all([
      buildPeriod(supabase, brandIds, "today", todayBD, todayBD),
      buildPeriod(supabase, brandIds, "week", weekFrom, todayBD),
      buildPeriod(supabase, brandIds, "month", monthFrom, todayBD),
    ]);

    // ── Today strip extras: FX + Meta-reported + confirmed orders ──
    const { data: accounts } = await supabase
      .from("mkt_ad_accounts")
      .select("id, currency, usd_to_bdt_rate, brand_id")
      .in("brand_id", brandIds);
    const { getBrandUsdBdtMap } = await import("./fx.server");
    const fxByBrand = await getBrandUsdBdtMap(supabase, brandIds);
    const brandUsdBdt = (() => {
      for (const id of brandIds) {
        const r = fxByBrand.get(id) ?? 0;
        if (r > 0) return r;
      }
      return 0;
    })();
    const accFx = new Map<string, number>();
    for (const a of accounts ?? []) {
      const cur = (a.currency ?? "USD").toUpperCase();
      const rate =
        Number(a.usd_to_bdt_rate) ||
        (fxByBrand.get((a as any).brand_id) ?? brandUsdBdt);
      accFx.set(a.id, cur === "BDT" ? 1 : rate);
    }

    const { data: insightsToday } = await supabase
      .from("mkt_insights_daily")
      .select("account_id, spend, meta_purchases, meta_purchase_value")
      .in("brand_id", brandIds)
      .eq("date", todayBD);
    let spendUsdToday = 0;
    let metaOrdersToday = 0;
    let metaRevBdtToday = 0;
    for (const r of (insightsToday ?? []) as any[]) {
      const fx = accFx.get(r.account_id) ?? 1;
      spendUsdToday += Number(r.spend) || 0;
      metaOrdersToday += Number(r.meta_purchases) || 0;
      metaRevBdtToday += (Number(r.meta_purchase_value) || 0) * fx;
    }

    const { startUtc, endUtc } = bdDayUtcRange(todayBD);
    const { data: attrToday } = await supabase
      .from("mkt_order_attributions")
      .select("orders!inner(id, status, total, brand_id, created_at)")
      .in("orders.brand_id", brandIds)
      .gte("orders.created_at", startUtc)
      .lt("orders.created_at", endUtc);
    let confirmedOrders = 0;
    let confirmedRev = 0;
    for (const r of (attrToday ?? []) as any[]) {
      if (!r.orders) continue;
      const s = r.orders.status as string;
      if (s !== "cancelled" && s !== "returned") {
        confirmedOrders += 1;
        confirmedRev += Number(r.orders.total) || 0;
      }
    }

    const spendBdtToday = todayP.spend_bdt;
    const today: PulseData["today"] = {
      date_bd: todayBD,
      spend_bdt: spendBdtToday,
      spend_usd: spendUsdToday,
      delivered_revenue_bdt: todayP.delivered_revenue_bdt,
      confirmed_revenue_bdt: confirmedRev,
      meta_revenue_bdt: metaRevBdtToday,
      delivered_orders: todayP.delivered_orders,
      confirmed_orders: confirmedOrders,
      meta_orders: metaOrdersToday,
      delivered_roas: spendBdtToday > 0 ? todayP.delivered_revenue_bdt / spendBdtToday : null,
      confirmed_roas: spendBdtToday > 0 ? confirmedRev / spendBdtToday : null,
      meta_roas: spendBdtToday > 0 ? metaRevBdtToday / spendBdtToday : null,
      cpo_bdt: confirmedOrders > 0 ? spendBdtToday / confirmedOrders : null,
      cost_missing_units: todayP.cost_missing_units,
    };

    // ── Top movers (this week) ──
    // Per-campaign delivered aggregate
    const perCamp = new Map<
      string,
      { delivered_revenue: number; gross_profit: number; delivered_orders: number; cost_missing_units: number }
    >();
    for (const bid of brandIds) {
      const m = await getCampaignProfitMap(supabase, bid, weekFrom, todayBD).catch(
        () => new Map(),
      );
      for (const [cid, v] of m) {
        const cur = perCamp.get(cid) ?? {
          delivered_revenue: 0,
          gross_profit: 0,
          delivered_orders: 0,
          cost_missing_units: 0,
        };
        cur.delivered_revenue += v.delivered_revenue;
        cur.gross_profit += v.gross_profit;
        cur.delivered_orders += v.delivered_orders;
        cur.cost_missing_units += v.cost_missing_units;
        perCamp.set(cid, cur);
      }
    }

    // Per-campaign spend + sparkline from insights_daily (last 7 BD days)
    const { data: weekInsights } = await supabase
      .from("mkt_insights_daily")
      .select("date, account_id, campaign_id, spend, spend_bdt_fifo, conversion_source")
      .in("brand_id", brandIds)
      .gte("date", weekFrom)
      .lte("date", todayBD);
    const dayIndex = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = bdDateStr(new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000));
      dayIndex.set(d, i);
    }
    const spendPerCamp = new Map<string, number>();
    const sparkPerCamp = new Map<string, number[]>();
    for (const r of (weekInsights ?? []) as any[]) {
      if (!r.campaign_id) continue;
      const fx = accFx.get(r.account_id) ?? 1;
      const fifo = Number(r.spend_bdt_fifo) || 0;
      const useFifo = fifo > 0 && r.conversion_source === "fifo";
      const bdt = useFifo ? fifo : (Number(r.spend) || 0) * fx;
      spendPerCamp.set(r.campaign_id, (spendPerCamp.get(r.campaign_id) ?? 0) + bdt);
      const arr = sparkPerCamp.get(r.campaign_id) ?? Array(7).fill(0);
      const idx = dayIndex.get(r.date);
      if (idx != null) arr[idx] += bdt;
      sparkPerCamp.set(r.campaign_id, arr);
    }

    // Merge campaigns that had spend but no delivered rows
    for (const cid of spendPerCamp.keys())
      if (!perCamp.has(cid))
        perCamp.set(cid, {
          delivered_revenue: 0,
          gross_profit: 0,
          delivered_orders: 0,
          cost_missing_units: 0,
        });

    const campIds = Array.from(perCamp.keys());
    const { data: campRows } = campIds.length
      ? await supabase
          .from("mkt_campaigns")
          .select("id, name, effective_status, status")
          .in("id", campIds)
      : { data: [] as any[] };
    const campMeta = new Map<string, { name: string; status: string }>();
    for (const c of (campRows ?? []) as any[])
      campMeta.set(c.id, {
        name: c.name ?? "—",
        status: (c.effective_status ?? c.status ?? "").toUpperCase(),
      });

    const movers: PulseMover[] = campIds.map((cid) => {
      const a = perCamp.get(cid)!;
      const spend = spendPerCamp.get(cid) ?? 0;
      const meta = campMeta.get(cid) ?? { name: "—", status: "" };
      return {
        campaign_id: cid,
        name: meta.name,
        status: meta.status,
        spend_bdt: spend,
        delivered_revenue_bdt: a.delivered_revenue,
        gross_profit_bdt: a.gross_profit,
        net_profit_bdt: a.gross_profit - spend,
        true_roas: spend > 0 ? a.delivered_revenue / spend : null,
        delivered_orders: a.delivered_orders,
        cost_missing_units: a.cost_missing_units,
        sparkline_spend_bdt: sparkPerCamp.get(cid) ?? Array(7).fill(0),
      };
    });

    // Only rank campaigns that actually spent this week
    const spent = movers.filter((m) => m.spend_bdt > 0);
    const top = [...spent]
      .sort((a, b) => (b.true_roas ?? -1) - (a.true_roas ?? -1))
      .slice(0, 3);
    const bottom = [...spent]
      .sort((a, b) => (a.true_roas ?? Infinity) - (b.true_roas ?? Infinity))
      .slice(0, 3);

    return {
      today,
      rollup: { today: todayP, week: weekP, month: monthP },
      movers: { top, bottom, window: { from: weekFrom, to: todayBD } },
    };
  });