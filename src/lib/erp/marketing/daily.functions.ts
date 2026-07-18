import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Daily Performance — day-by-day Real vs Meta comparison.
 *
 * Sources (canonical, no new RPCs):
 *  - get_meta_spend_bdt(brand, from, to)    → daily spend_bdt (FIFO + fallback)
 *  - mkt_delivered_line_costs(brand, from, to) → per-line delivered rows w/ day
 *    (aggregated here for orders + revenue by day)
 *  - mkt_insights_daily                    → meta_purchase_value / meta_purchases
 *    (native currency; converted to BDT via same-day spend_bdt_fifo/spend ratio)
 *
 * One RPC call per brand per source → O(brands × 3) DB round-trips regardless
 * of range length (day-loop avoided).
 */

const Input = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type DailyRow = {
  day: string;
  spend_bdt: number;
  delivered_orders: number;
  delivered_revenue_bdt: number;
  real_roas: number | null;
  meta_revenue_bdt: number | null;
  meta_orders: number;
  meta_roas: number | null;
  drift_pct: number | null; // (meta - real) / real * 100
  fx_estimated: boolean;    // true if we used latest fx (not same-day ratio)
  cost_missing: boolean;    // true if any line in the day is missing cost
};

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  for (let t = start; t <= end; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export const getDailyPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { brandIds, from, to } = data;
    const days = eachDay(from, to);

    // Latest USD→BDT fx fallback (when a day has meta revenue but zero spend)
    const fxRes = await context.supabase
      .from("erp_fx_rates")
      .select("rate")
      .eq("from_ccy", "USD")
      .eq("to_ccy", "BDT")
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fxFallback = Number(fxRes.data?.rate) || 122;

    // Fan out per brand, 3 queries in parallel per brand
    const perBrand = await Promise.all(
      brandIds.map(async (bid) => {
        const [spend, lines, insights] = await Promise.all([
          context.supabase.rpc("get_meta_spend_bdt", {
            _brand_id: bid,
            _from: from,
            _to: to,
          }),
          context.supabase.rpc("mkt_delivered_line_costs", {
            _brand_id: bid,
            _from: from,
            _to: to,
          }),
          context.supabase
            .from("mkt_insights_daily")
            .select("date, spend, spend_bdt_fifo, meta_purchase_value, meta_purchases")
            .eq("brand_id", bid)
            .gte("date", from)
            .lte("date", to),
        ]);
        if (spend.error) throw spend.error;
        if (lines.error) throw lines.error;
        if (insights.error) throw insights.error;
        return {
          spend: (spend.data ?? []) as any[],
          lines: (lines.data ?? []) as any[],
          insights: (insights.data ?? []) as any[],
        };
      }),
    );

    // Aggregate per-day across brands
    type Bucket = {
      spend_bdt: number;
      orderIds: Set<string>;
      revenue_bdt: number;
      meta_rev_bdt: number;
      meta_orders: number;
      // per-day cross-brand fx: sum(native_rev * ratio) — ratio = bdt_fifo/native
      // computed inline; when native=0 we fall back to fxFallback and mark estimated
      fx_estimated: boolean;
      cost_missing: boolean;
    };
    const buckets = new Map<string, Bucket>();
    for (const d of days) {
      buckets.set(d, {
        spend_bdt: 0,
        orderIds: new Set<string>(),
        revenue_bdt: 0,
        meta_rev_bdt: 0,
        meta_orders: 0,
        fx_estimated: false,
        cost_missing: false,
      });
    }

    for (const b of perBrand) {
      for (const r of b.spend) {
        const key = String(r.day).slice(0, 10);
        const bk = buckets.get(key);
        if (!bk) continue;
        bk.spend_bdt += Number(r.spend_bdt) || 0;
      }
      for (const l of b.lines) {
        const key = String(l.day).slice(0, 10);
        const bk = buckets.get(key);
        if (!bk) continue;
        if (l.order_id) bk.orderIds.add(l.order_id);
        bk.revenue_bdt += Number(l.line_total) || 0;
        if (l.cost_missing) bk.cost_missing = true;
      }
      for (const ins of b.insights) {
        const key = String(ins.date).slice(0, 10);
        const bk = buckets.get(key);
        if (!bk) continue;
        const rev = Number(ins.meta_purchase_value) || 0;
        const nativeSpend = Number(ins.spend) || 0;
        const bdtSpend = Number(ins.spend_bdt_fifo) || 0;
        if (rev > 0) {
          if (nativeSpend > 0 && bdtSpend > 0) {
            bk.meta_rev_bdt += rev * (bdtSpend / nativeSpend);
          } else {
            // no native/bdt spend to derive rate — assume revenue is already BDT
            // if the account is BDT-native; otherwise apply fx fallback.
            // Heuristic: if rev is small (<10000) assume USD, else assume BDT.
            bk.meta_rev_bdt += rev < 10000 ? rev * fxFallback : rev;
            bk.fx_estimated = true;
          }
        }
        bk.meta_orders += Number(ins.meta_purchases) || 0;
      }
    }

    const rows: DailyRow[] = days
      .slice()
      .reverse()
      .map((day) => {
        const b = buckets.get(day)!;
        const orders = b.orderIds.size;
        const realRoas = b.spend_bdt > 0 ? b.revenue_bdt / b.spend_bdt : null;
        const metaRev = b.meta_rev_bdt > 0 ? b.meta_rev_bdt : null;
        const metaRoas = metaRev != null && b.spend_bdt > 0 ? metaRev / b.spend_bdt : null;
        const drift =
          metaRev != null && b.revenue_bdt > 0
            ? ((metaRev - b.revenue_bdt) / b.revenue_bdt) * 100
            : null;
        return {
          day,
          spend_bdt: b.spend_bdt,
          delivered_orders: orders,
          delivered_revenue_bdt: b.revenue_bdt,
          real_roas: realRoas,
          meta_revenue_bdt: metaRev,
          meta_orders: b.meta_orders,
          meta_roas: metaRoas,
          drift_pct: drift,
          fx_estimated: b.fx_estimated,
          cost_missing: b.cost_missing,
        };
      });

    // Totals row (for footer)
    const totals = rows.reduce(
      (acc, r) => {
        acc.spend_bdt += r.spend_bdt;
        acc.delivered_orders += r.delivered_orders;
        acc.delivered_revenue_bdt += r.delivered_revenue_bdt;
        acc.meta_revenue_bdt += r.meta_revenue_bdt ?? 0;
        acc.meta_orders += r.meta_orders;
        return acc;
      },
      {
        spend_bdt: 0,
        delivered_orders: 0,
        delivered_revenue_bdt: 0,
        meta_revenue_bdt: 0,
        meta_orders: 0,
      },
    );

    return { rows, totals, fxFallback };
  });

// ---- Quick-add dollar purchase (defaults from first ad account for brand) ----

const QuickAdd = z.object({
  brandIds: z.array(z.string().uuid()).min(1),
  usdAmount: z.number().positive(),
  usdRate: z.number().positive(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adAccountId: z.string().uuid().optional(),
  paidFromAccountId: z.string().uuid().optional(),
  note: z.string().optional(),
  confirm: z.boolean().default(true),
});

export const quickAddDollarPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuickAdd.parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { assertDollarPurchaseAccess } = await import("./dollar-purchase.server");
    await assertDollarPurchaseAccess(db, context.userId);

    // Resolve defaults
    let adAccountId = data.adAccountId ?? null;
    let paidFromAccountId = data.paidFromAccountId ?? null;
    let brandId: string | null = data.brandIds.length === 1 ? data.brandIds[0] : null;

    if (!adAccountId) {
      const { data: links } = await db
        .from("mkt_ad_account_brands")
        .select("ad_account_id")
        .in("brand_id", data.brandIds);
      const linkedIds = Array.from(new Set((links ?? []).map((r: any) => r.ad_account_id)));
      const { data: acc } = await db
        .from("mkt_ad_accounts")
        .select("id")
        .in("id", linkedIds.length ? linkedIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!acc?.id) throw new Error("Kono active ad account nei ei brand-e");
      adAccountId = acc.id;
    }
    if (!paidFromAccountId) {
      // Prefer a brand-scoped active cash account, else shared
      const { data: acc } = await db
        .from("erp_accounts")
        .select("id, brand_id")
        .eq("is_active", true)
        .or(
          `brand_id.in.(${data.brandIds.map((b) => `"${b}"`).join(",")}),brand_id.is.null`,
        )
        .order("brand_id", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!acc?.id) throw new Error("Kono paid-from account nei");
      paidFromAccountId = acc.id;
    }

    const { data: row, error } = await db
      .from("meta_dollar_purchases")
      .insert({
        brand_id: brandId,
        ad_account_id: adAccountId,
        paid_from_account_id: paidFromAccountId,
        purchase_date: data.purchaseDate,
        usd_amount: data.usdAmount,
        usd_rate: data.usdRate,
        fee_bdt: 0,
        note: data.note ?? "quick-add from daily-performance",
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (data.confirm) {
      const { error: cErr } = await db.rpc("confirm_meta_dollar_purchase", {
        _purchase_id: row.id,
      });
      if (cErr) throw cErr;
    }
    return { id: row.id, confirmed: data.confirm };
  });