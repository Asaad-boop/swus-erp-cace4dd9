import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Dashboard summary — Today's strip, 7-day trend, top campaigns, budget pacing. */

export type DashboardSummary = {
  today: {
    date_bd: string;
    spend_usd: number;
    spend_bdt: number;
    spend_bdt_fifo: number;
    spend_bdt_fallback: number;
    cost_source: "fifo" | "fx_fallback" | "mixed" | "manual";
    estimated_bdt_cost: boolean;
    meta_orders: number; // Meta-reported purchases
    meta_revenue_usd: number;
    meta_revenue_bdt: number;
    meta_roas: number | null;
    attributed_orders: number; // Orders attributed to any Meta campaign (today)
    confirmed_orders: number;
    confirmed_revenue_bdt: number;
    delivered_orders: number;
    delivered_revenue_bdt: number;
    confirmed_roas: number | null;
    delivered_roas: number | null;
    cpo_bdt: number | null; // spend / confirmed_orders
  };
  trend7d: Array<{
    date: string;
    spend_bdt: number;
    confirmed_revenue_bdt: number;
    delivered_revenue_bdt: number;
  }>;
  topCampaigns: Array<{
    campaign_id: string;
    name: string;
    spend_bdt: number;
    delivered_revenue_bdt: number;
    confirmed_revenue_bdt: number;
    true_roas: number | null;
  }>;
  budgetPacing: Array<{
    campaign_id: string;
    name: string;
    daily_budget_bdt: number;
    daily_budget_usd: number;
    spent_today_bdt: number;
    spent_today_usd: number;
    pct: number;
    status: "ok" | "warn" | "over";
    lifetime_budget_bdt: number | null;
    lifetime_budget_usd: number | null;
    spent_this_month_bdt: number;
    spent_this_month_usd: number;
    pct_lifetime: number | null;
    projected_monthly_bdt: number;
    projected_monthly_usd: number;
  }>;
};

// BD timezone helpers (UTC+6, no DST)
const BD_OFFSET_MS = 6 * 3600 * 1000;
function bdDateStr(d: Date): string {
  return new Date(d.getTime() + BD_OFFSET_MS).toISOString().slice(0, 10);
}
function bdDayUtcRange(dateStr: string): { startUtc: string; endUtc: string } {
  // Bangladesh midnight = 18:00 UTC previous day
  const start = new Date(`${dateStr}T00:00:00.000Z`).getTime() - BD_OFFSET_MS;
  const end = start + 24 * 3600 * 1000;
  return {
    startUtc: new Date(start).toISOString(),
    endUtc: new Date(end).toISOString(),
  };
}

export const getDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<DashboardSummary> => {
    const supabase = context.supabase;
    const brandId = data.brandId;

    const now = new Date();
    const todayBD = bdDateStr(now);
    const sevenAgoBD = bdDateStr(new Date(now.getTime() - 6 * 24 * 3600 * 1000));

    // Brand-level USD→BDT fallback rate, pulled live from erp_fx_rates.
    // No hardcoded fallback — when no rate exists yet, conversion uses 0
    // until the user adds one in Finance → FX.
    const { data: fxRow } = await supabase
      .from("erp_fx_rates")
      .select("rate")
      .eq("brand_id", brandId)
      .eq("from_ccy", "USD")
      .eq("to_ccy", "BDT")
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const brandUsdBdt = Number(fxRow?.rate) || 0;

    // 1. Active accounts → FX map
    const { data: accounts } = await supabase
      .from("mkt_ad_accounts")
      .select("id, currency, usd_to_bdt_rate")
      .eq("brand_id", brandId);
    const accFx = new Map<string, number>();
    for (const a of accounts ?? []) {
      const cur = (a.currency ?? "USD").toUpperCase();
      const rate = Number(a.usd_to_bdt_rate) || brandUsdBdt;
      accFx.set(a.id, cur === "BDT" ? 1 : rate);
    }

    // 2. Insights (last 7 days incl today) — for trend + today's spend
    const { data: insights } = await supabase
      .from("mkt_insights_daily")
      .select(
        "date, account_id, campaign_id, spend, meta_purchases, meta_purchase_value, spend_bdt_fifo, conversion_source, estimated_bdt_cost",
      )
      .eq("brand_id", brandId)
      .gte("date", sevenAgoBD)
      .lte("date", todayBD);

    // 3. Campaigns (for names + daily_budget)
    const { data: campaigns } = await supabase
      .from("mkt_campaigns")
      .select(
        "id, name, account_id, daily_budget, lifetime_budget, effective_status, status, mkt_ad_accounts(currency, usd_to_bdt_rate)",
      )
      .eq("brand_id", brandId);
    const campMap = new Map<string, any>(
      (campaigns ?? []).map((c: any) => [c.id, c]),
    );

    // Adset-level budgets (ABO). When a campaign uses adset-level budgeting,
    // campaign.daily_budget/lifetime_budget are null — sum the active adsets'
    // budgets so pacing still shows a number.
    const campIdList = (campaigns ?? []).map((c: any) => c.id);
    const adsetBudgetMap = new Map<
      string,
      { daily: number; lifetime: number }
    >();
    if (campIdList.length) {
      const { data: adsets } = await supabase
        .from("mkt_adsets")
        .select("campaign_id, daily_budget, lifetime_budget, effective_status, status")
        .in("campaign_id", campIdList);
      for (const a of (adsets ?? []) as any[]) {
        const st = (a.effective_status ?? a.status ?? "").toUpperCase();
        if (st !== "ACTIVE") continue;
        const cur = adsetBudgetMap.get(a.campaign_id) ?? { daily: 0, lifetime: 0 };
        cur.daily += Number(a.daily_budget) || 0;
        cur.lifetime += Number(a.lifetime_budget) || 0;
        adsetBudgetMap.set(a.campaign_id, cur);
      }
    }

    // 4. Today's attributed orders — join mkt_order_attributions + orders
    const { startUtc, endUtc } = bdDayUtcRange(todayBD);
    const { data: attrToday } = await supabase
      .from("mkt_order_attributions")
      .select("campaign_id, orders!inner(id, status, total, created_at, brand_id)")
      .eq("orders.brand_id", brandId)
      .gte("orders.created_at", startUtc)
      .lt("orders.created_at", endUtc);

    // 5. Attributed orders for last 7 days — for trend revenue lines + top5
    const { data: attr7d } = await supabase
      .from("mkt_order_attributions")
      .select("campaign_id, orders!inner(status, total, created_at, brand_id)")
      .eq("orders.brand_id", brandId)
      .gte("orders.created_at", bdDayUtcRange(sevenAgoBD).startUtc)
      .lt("orders.created_at", endUtc);

    // ── Build TODAY ──
    let spendUsdToday = 0;
    let spendBdtToday = 0;
    let spendBdtTodayFifo = 0;
    let spendBdtTodayFallback = 0;
    let metaOrdersToday = 0;
    let metaRevUsdToday = 0;
    let metaRevBdtToday = 0;
    for (const r of insights ?? []) {
      if (r.date !== todayBD) continue;
      const fx = accFx.get(r.account_id) ?? 1;
      const spend = Number(r.spend) || 0;
      const mrev = Number(r.meta_purchase_value) || 0;
      const fifo = Number((r as any).spend_bdt_fifo) || 0;
      const useFifo = fifo > 0 && (r as any).conversion_source === "fifo";
      const bdt = useFifo ? fifo : spend * fx;
      spendUsdToday += spend;
      spendBdtToday += bdt;
      if (useFifo) spendBdtTodayFifo += bdt;
      else spendBdtTodayFallback += bdt;
      metaOrdersToday += Number(r.meta_purchases) || 0;
      metaRevUsdToday += mrev;
      metaRevBdtToday += mrev * fx;
    }

    let attributedToday = 0;
    let confirmedOrdersToday = 0;
    let confirmedRevToday = 0;
    let deliveredOrdersToday = 0;
    let deliveredRevToday = 0;
    for (const r of (attrToday ?? []) as any[]) {
      if (!r.orders) continue;
      attributedToday += 1;
      const status = r.orders.status as string;
      const total = Number(r.orders.total) || 0;
      if (status !== "cancelled" && status !== "returned") {
        confirmedOrdersToday += 1;
        confirmedRevToday += total;
      }
      if (status === "delivered" || status === "completed") {
        deliveredOrdersToday += 1;
        deliveredRevToday += total;
      }
    }

    const today = {
      date_bd: todayBD,
      spend_usd: spendUsdToday,
      spend_bdt: spendBdtToday,
      spend_bdt_fifo: spendBdtTodayFifo,
      spend_bdt_fallback: spendBdtTodayFallback,
      cost_source: (spendBdtToday <= 0
        ? "manual"
        : spendBdtTodayFifo > 0 && spendBdtTodayFallback > 0
          ? "mixed"
          : spendBdtTodayFifo > 0
            ? "fifo"
            : "fx_fallback") as "fifo" | "fx_fallback" | "mixed" | "manual",
      estimated_bdt_cost: spendBdtTodayFallback > 0,
      meta_orders: metaOrdersToday,
      meta_revenue_usd: metaRevUsdToday,
      meta_revenue_bdt: metaRevBdtToday,
      meta_roas: spendBdtToday > 0 ? metaRevBdtToday / spendBdtToday : null,
      attributed_orders: attributedToday,
      confirmed_orders: confirmedOrdersToday,
      confirmed_revenue_bdt: confirmedRevToday,
      delivered_orders: deliveredOrdersToday,
      delivered_revenue_bdt: deliveredRevToday,
      confirmed_roas: spendBdtToday > 0 ? confirmedRevToday / spendBdtToday : null,
      delivered_roas: spendBdtToday > 0 ? deliveredRevToday / spendBdtToday : null,
      cpo_bdt: confirmedOrdersToday > 0 ? spendBdtToday / confirmedOrdersToday : null,
    };

    // ── Build 7-day TREND ──
    const trendMap = new Map<
      string,
      { spend_bdt: number; confirmed_revenue_bdt: number; delivered_revenue_bdt: number }
    >();
    // seed dates
    for (let i = 0; i < 7; i++) {
      const d = bdDateStr(new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000));
      trendMap.set(d, { spend_bdt: 0, confirmed_revenue_bdt: 0, delivered_revenue_bdt: 0 });
    }
    for (const r of insights ?? []) {
      const fx = accFx.get(r.account_id) ?? 1;
      const cur = trendMap.get(r.date);
      if (!cur) continue;
      const fifo = Number((r as any).spend_bdt_fifo) || 0;
      const useFifo = fifo > 0 && (r as any).conversion_source === "fifo";
      cur.spend_bdt += useFifo ? fifo : (Number(r.spend) || 0) * fx;
    }
    for (const r of (attr7d ?? []) as any[]) {
      if (!r.orders) continue;
      const dBD = bdDateStr(new Date(r.orders.created_at));
      const cur = trendMap.get(dBD);
      if (!cur) continue;
      const total = Number(r.orders.total) || 0;
      const status = r.orders.status as string;
      if (status !== "cancelled" && status !== "returned") cur.confirmed_revenue_bdt += total;
      if (status === "delivered" || status === "completed") cur.delivered_revenue_bdt += total;
    }
    const trend7d = Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v }));

    // ── Top 5 campaigns by true ROAS (last 7d) ──
    const campAgg = new Map<
      string,
      { spend_bdt: number; confirmed: number; delivered: number }
    >();
    for (const r of insights ?? []) {
      if (!r.campaign_id) continue;
      const fx = accFx.get(r.account_id) ?? 1;
      const cur = campAgg.get(r.campaign_id) ?? { spend_bdt: 0, confirmed: 0, delivered: 0 };
      const fifo = Number((r as any).spend_bdt_fifo) || 0;
      const useFifo = fifo > 0 && (r as any).conversion_source === "fifo";
      cur.spend_bdt += useFifo ? fifo : (Number(r.spend) || 0) * fx;
      campAgg.set(r.campaign_id, cur);
    }
    for (const r of (attr7d ?? []) as any[]) {
      if (!r.campaign_id || !r.orders) continue;
      const cur = campAgg.get(r.campaign_id) ?? { spend_bdt: 0, confirmed: 0, delivered: 0 };
      const total = Number(r.orders.total) || 0;
      const status = r.orders.status as string;
      if (status !== "cancelled" && status !== "returned") cur.confirmed += total;
      if (status === "delivered" || status === "completed") cur.delivered += total;
      campAgg.set(r.campaign_id, cur);
    }
    const topCampaigns = Array.from(campAgg.entries())
      .filter(([, v]) => v.spend_bdt > 0)
      .map(([id, v]) => {
        const c = campMap.get(id);
        return {
          campaign_id: id,
          name: c?.name ?? "—",
          spend_bdt: v.spend_bdt,
          delivered_revenue_bdt: v.delivered,
          confirmed_revenue_bdt: v.confirmed,
          true_roas: v.spend_bdt > 0 ? v.delivered / v.spend_bdt : null,
        };
      })
      .sort((a, b) => (b.true_roas ?? -1) - (a.true_roas ?? -1))
      .slice(0, 5);

    // ── Budget pacing (today) ──
    const spendTodayByCampaign = new Map<string, number>();
    for (const r of insights ?? []) {
      if (r.date !== todayBD || !r.campaign_id) continue;
      const fx = accFx.get(r.account_id) ?? 1;
      spendTodayByCampaign.set(
        r.campaign_id,
        (spendTodayByCampaign.get(r.campaign_id) ?? 0) + (Number(r.spend) || 0) * fx,
      );
    }
    // Month-to-date spend per campaign (for lifetime budget pacing)
    const monthStartBD = todayBD.slice(0, 7) + "-01";
    const { data: monthInsights } = await supabase
      .from("mkt_insights_daily")
      .select("account_id, campaign_id, spend")
      .eq("brand_id", brandId)
      .gte("date", monthStartBD)
      .lte("date", todayBD);
    const spendMonthByCampaign = new Map<string, number>();
    for (const r of monthInsights ?? []) {
      if (!r.campaign_id) continue;
      const fx = accFx.get(r.account_id) ?? 1;
      spendMonthByCampaign.set(
        r.campaign_id,
        (spendMonthByCampaign.get(r.campaign_id) ?? 0) + (Number(r.spend) || 0) * fx,
      );
    }
    const daysInMonth = new Date(
      Number(todayBD.slice(0, 4)),
      Number(todayBD.slice(5, 7)),
      0,
    ).getDate();
    const dayOfMonth = Number(todayBD.slice(8, 10));
    const budgetPacing: DashboardSummary["budgetPacing"] = [];
    for (const c of (campaigns ?? []) as any[]) {
      const status = (c.effective_status ?? c.status ?? "").toUpperCase();
      if (status !== "ACTIVE") continue;
      const adsetBud = adsetBudgetMap.get(c.id) ?? { daily: 0, lifetime: 0 };
      const campDaily = c.daily_budget != null ? Number(c.daily_budget) : 0;
      // Fall back to summed adset budget (ABO) when campaign-level budget is unset
      const rawBudget = campDaily > 0 ? campDaily : adsetBud.daily;
      if (!(rawBudget > 0)) continue;
      const acc = c.mkt_ad_accounts ?? {};
      const cur = (acc.currency ?? "USD").toUpperCase();
      const fx = cur === "BDT" ? 1 : Number(acc.usd_to_bdt_rate) || brandUsdBdt;
      // Effective USD rate for converting BDT-side totals back to USD display.
      const usdRate = cur === "USD" ? fx : Number(acc.usd_to_bdt_rate) || brandUsdBdt;
      // Budgets in DB are already in major units (USD or BDT) — sync divides /100 at ingest.
      const budgetBdt = rawBudget * fx;
      const budgetUsd = cur === "USD" ? rawBudget : rawBudget / usdRate;
      const spent = spendTodayByCampaign.get(c.id) ?? 0;
      const pct = budgetBdt > 0 ? (spent / budgetBdt) * 100 : 0;
      const status_ = pct >= 90 ? "over" : pct >= 70 ? "warn" : "ok";
      // Lifetime budget (optional)
      const campLifetime = c.lifetime_budget != null ? Number(c.lifetime_budget) : 0;
      const rawLifetime = campLifetime > 0 ? campLifetime : adsetBud.lifetime;
      const lifetimeBdt = rawLifetime > 0 ? rawLifetime * fx : null;
      const lifetimeUsd =
        rawLifetime > 0 ? (cur === "USD" ? rawLifetime : rawLifetime / usdRate) : null;
      const spentMonth = spendMonthByCampaign.get(c.id) ?? 0;
      const pctLifetime = lifetimeBdt && lifetimeBdt > 0 ? (spentMonth / lifetimeBdt) * 100 : null;
      // Projected month = month-to-date pace × days_in_month
      const projectedMonthly = dayOfMonth > 0 ? (spentMonth / dayOfMonth) * daysInMonth : 0;
      budgetPacing.push({
        campaign_id: c.id,
        name: c.name,
        daily_budget_bdt: budgetBdt,
        daily_budget_usd: budgetUsd,
        spent_today_bdt: spent,
        spent_today_usd: spent / usdRate,
        pct,
        status: status_ as "ok" | "warn" | "over",
        lifetime_budget_bdt: lifetimeBdt,
        lifetime_budget_usd: lifetimeUsd,
        spent_this_month_bdt: spentMonth,
        spent_this_month_usd: spentMonth / usdRate,
        pct_lifetime: pctLifetime,
        projected_monthly_bdt: projectedMonthly,
        projected_monthly_usd: projectedMonthly / usdRate,
      });
    }
    budgetPacing.sort((a, b) => b.pct - a.pct);

    return { today, trend7d, topCampaigns, budgetPacing };
  });