import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Inventory Reports — server functions
   ============================================================ */

/** Stock valuation: every product + variant with stock > 0, valued at WAC. */
export const getStockValuationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; includeZero?: boolean }) =>
    z.object({ brandId: z.string().uuid(), includeZero: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("products")
      .select(`
        id, title, sku, stock, reserved_stock, available_stock,
        weighted_avg_cost, total_cost_value, reorder_point,
        variants:product_variants ( id, sku, stock, reserved_stock, weighted_avg_cost )
      `)
      .eq("brand_id", data.brandId)
      .order("title");
    if (!data.includeZero) q = q.gt("stock", 0);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/** Stock movement report: filterable by date range, source, reason. */
export const getStockMovementReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from?: string; to?: string; source?: string; reason?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      from: z.string().optional(),
      to: z.string().optional(),
      source: z.string().optional(),
      reason: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("stock_movements")
      .select(`
        id, created_at, delta, stock_before, stock_after,
        reason, note, movement_source, unit_cost_bdt, total_cost_bdt,
        reference_type, reference_id,
        product:product_id ( id, title, sku ),
        variant:variant_id ( id, sku )
      `)
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);
    if (data.source && data.source !== "all") q = q.eq("movement_source", data.source);
    if (data.reason && data.reason !== "all") q = q.eq("reason", data.reason);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/** Low-stock report: products at or below reorder_point. */
export const getLowStockReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("products")
      .select(`
        id, title, sku, stock, reserved_stock, available_stock,
        reorder_point, reorder_qty, weighted_avg_cost
      `)
      .eq("brand_id", data.brandId)
      .gt("reorder_point", 0)
      .order("stock");
    if (error) throw error;
    return (rows ?? []).filter((r: any) => (r.stock ?? 0) <= (r.reorder_point ?? 0));
  });

/** Reorder suggestion queue: from cron-generated table. */
export const getReorderSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; status?: string }) =>
    z.object({ brandId: z.string().uuid(), status: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("reorder_suggestions")
      .select(`
        id, created_at, current_stock, reorder_point, suggested_qty,
        status, source, actioned_at,
        product:product_id ( id, title, sku, weighted_avg_cost ),
        variant:variant_id ( id, sku )
      `)
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const updateReorderSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "pending" | "processed" | "dismissed" }) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "processed", "dismissed"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reorder_suggestions")
      .update({
        status: data.status,
        actioned_at: data.status !== "pending" ? new Date().toISOString() : null,
        actioned_by: data.status !== "pending" ? context.userId : null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });