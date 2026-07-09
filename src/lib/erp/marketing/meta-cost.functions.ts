import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Meta Spend — single source of truth.
 *
 * All callers (dashboard, campaigns, finance/P&L, SKU rollup, reports) should
 * read spend through these fns. They wrap the `get_meta_spend_bdt` RPC and the
 * `v_meta_spend_reconciliation` view — never re-implement the FIFO-vs-flat-FX
 * fallback locally. If the RPC lies, fix the RPC.
 */

const RangeInput = z.object({
  brandId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type MetaSpendDayRow = {
  brand_id: string;
  day: string;
  spend_usd: number;
  spend_bdt: number;          // authoritative BDT (FIFO + fallback merged)
  spend_bdt_fifo: number;     // FIFO portion only
  spend_bdt_fallback: number; // FX-fallback portion
  is_estimated: boolean;
};

export type MetaSpendTotal = {
  spend_usd: number;
  spend_bdt: number;
  spend_bdt_fifo: number;
  spend_bdt_fallback: number;
  fifo_share_pct: number | null; // null when spend_bdt = 0
  is_estimated: boolean;
  days: MetaSpendDayRow[];
};

/** Authoritative spend read. Use this everywhere. */
export const getMetaSpendBdt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from: string; to: string }) => RangeInput.parse(d))
  .handler(async ({ data, context }): Promise<MetaSpendTotal> => {
    const { data: rows, error } = await context.supabase.rpc("get_meta_spend_bdt", {
      _brand_id: data.brandId,
      _from: data.from,
      _to: data.to,
    });
    if (error) throw error;

    const days = ((rows ?? []) as any[]).map((r) => ({
      brand_id: r.brand_id,
      day: r.day,
      spend_usd: Number(r.spend_usd) || 0,
      spend_bdt: Number(r.spend_bdt) || 0,
      spend_bdt_fifo: Number(r.spend_bdt_fifo) || 0,
      spend_bdt_fallback: Number(r.spend_bdt_fallback) || 0,
      is_estimated: !!r.is_estimated,
    })) as MetaSpendDayRow[];

    const spend_usd = days.reduce((s, d) => s + d.spend_usd, 0);
    const spend_bdt = days.reduce((s, d) => s + d.spend_bdt, 0);
    const spend_bdt_fifo = days.reduce((s, d) => s + d.spend_bdt_fifo, 0);
    const spend_bdt_fallback = days.reduce((s, d) => s + d.spend_bdt_fallback, 0);

    return {
      spend_usd,
      spend_bdt,
      spend_bdt_fifo,
      spend_bdt_fallback,
      fifo_share_pct: spend_bdt > 0 ? +((spend_bdt_fifo / spend_bdt) * 100).toFixed(2) : null,
      is_estimated: days.some((d) => d.is_estimated),
      days,
    };
  });

export type MetaSpendReconciliationRow = {
  date: string;
  spend_usd: number;
  spend_bdt_fifo: number;
  spend_bdt_flat_fx: number;
  gap_bdt: number;
  gap_pct: number | null;
  insight_rows: number;
  unenriched_rows: number;
  fallback_rows: number;
  flat_fx_rate_used: number;
};

/** Diagnostic: per-day FIFO vs flat-FX comparison for the range. */
export const getMetaSpendReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from: string; to: string }) => RangeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("v_meta_spend_reconciliation" as any)
      .select("*")
      .eq("brand_id", data.brandId)
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date", { ascending: true });
    if (error) throw error;

    const days = ((rows ?? []) as any[]).map((r) => ({
      date: r.date,
      spend_usd: Number(r.spend_usd) || 0,
      spend_bdt_fifo: Number(r.spend_bdt_fifo) || 0,
      spend_bdt_flat_fx: Number(r.spend_bdt_flat_fx) || 0,
      gap_bdt: Number(r.gap_bdt) || 0,
      gap_pct: r.gap_pct == null ? null : Number(r.gap_pct),
      insight_rows: Number(r.insight_rows) || 0,
      unenriched_rows: Number(r.unenriched_rows) || 0,
      fallback_rows: Number(r.fallback_rows) || 0,
      flat_fx_rate_used: Number(r.flat_fx_rate_used) || 0,
    })) as MetaSpendReconciliationRow[];

    const total_usd     = days.reduce((s, d) => s + d.spend_usd, 0);
    const total_fifo    = days.reduce((s, d) => s + d.spend_bdt_fifo, 0);
    const total_flat_fx = days.reduce((s, d) => s + d.spend_bdt_flat_fx, 0);
    const total_gap     = total_fifo - total_flat_fx;

    return {
      summary: {
        total_usd,
        total_fifo_bdt: total_fifo,
        total_flat_fx_bdt: total_flat_fx,
        total_gap_bdt: total_gap,
        gap_pct: total_flat_fx > 0 ? +((total_gap / total_flat_fx) * 100).toFixed(2) : null,
        insight_rows:    days.reduce((s, d) => s + d.insight_rows, 0),
        unenriched_rows: days.reduce((s, d) => s + d.unenriched_rows, 0),
        fallback_rows:   days.reduce((s, d) => s + d.fallback_rows, 0),
        flat_fx_rate_used: days[0]?.flat_fx_rate_used ?? 0,
      },
      days,
    };
  });