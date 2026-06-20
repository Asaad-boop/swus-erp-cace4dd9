import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Pending COD queue ----------
// Orders delivered/partial_delivered, reconciliation_status=pending

export const getPendingCodQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brandId: z.string().uuid(),
        courier: z.string().nullable().optional(),
        dateFrom: z.string().nullable().optional(),
        dateTo: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("orders")
      .select(
        "id, order_number, shipping_name, shipping_phone, total, status, payment_status, delivered_at, created_at, courier_provider, courier_consignment_id",
      )
      .eq("brand_id", data.brandId)
      .in("status", ["delivered", "partial_delivered"])
      .eq("reconciliation_status", "pending")
      .order("delivered_at", { ascending: true, nullsFirst: false })
      .limit(500);

    if (data.courier) q = q.eq("courier_provider", data.courier);
    if (data.dateFrom) q = q.gte("delivered_at", data.dateFrom);
    if (data.dateTo) q = q.lte("delivered_at", data.dateTo);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const now = Date.now();
    const orders = (rows ?? []).map((o) => {
      const deliveredAt = o.delivered_at ? new Date(o.delivered_at).getTime() : null;
      const daysPending = deliveredAt ? Math.floor((now - deliveredAt) / 86400000) : null;
      return { ...o, days_pending: daysPending };
    });

    const totalAmount = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);

    return { orders, totalCount: orders.length, totalAmount };
  });

// ---------- Outstanding (> 14 days) ----------

export const getOutstandingCod = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ brandId: z.string().uuid(), thresholdDays: z.number().int().min(1).default(14) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const cutoff = new Date(Date.now() - data.thresholdDays * 86400000).toISOString();

    const { data: rows, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, shipping_name, shipping_phone, total, delivered_at, courier_provider, courier_consignment_id",
      )
      .eq("brand_id", data.brandId)
      .in("status", ["delivered", "partial_delivered"])
      .eq("reconciliation_status", "pending")
      .lt("delivered_at", cutoff)
      .order("delivered_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const now = Date.now();
    const orders = (rows ?? []).map((o) => ({
      ...o,
      days_overdue: o.delivered_at
        ? Math.floor((now - new Date(o.delivered_at).getTime()) / 86400000) - data.thresholdDays
        : 0,
    }));
    const totalAmount = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
    return { orders, totalCount: orders.length, totalAmount };
  });

// ---------- Bulk waive ----------

export const waiveOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orderIds: z.array(z.string().uuid()).min(1), reason: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("orders")
      .update({ reconciliation_status: "waived" } as never)
      .in("id", data.orderIds);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.orderIds.length };
  });

// ---------- Dashboard KPIs + 30-day series ----------

export const getReconciliationDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString();
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();

    // Pending COD totals
    const { data: pending } = await supabase
      .from("orders")
      .select("id, total")
      .eq("brand_id", data.brandId)
      .in("status", ["delivered", "partial_delivered"])
      .eq("reconciliation_status", "pending");
    const pendingTotal = (pending ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);

    // Reconciled this month
    const { data: reconciled } = await supabase
      .from("orders")
      .select("id, total, delivered_at")
      .eq("brand_id", data.brandId)
      .eq("reconciliation_status", "reconciled")
      .gte("delivered_at", monthStart);
    const reconciledTotal = (reconciled ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);

    // Outstanding (> 14 days)
    const { data: outstanding } = await supabase
      .from("orders")
      .select("id, total")
      .eq("brand_id", data.brandId)
      .in("status", ["delivered", "partial_delivered"])
      .eq("reconciliation_status", "pending")
      .lt("delivered_at", cutoff14);
    const outstandingTotal = (outstanding ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);

    // Return fees (last 30 days) — sum of return_fee from reconciliation_rows
    const { data: returnRows } = await supabase
      .from("erp_reconciliation_rows")
      .select("return_fee, created_at, run_id")
      .eq("match_type", "return")
      .gte("created_at", cutoff30);
    const returnFeesTotal = (returnRows ?? []).reduce(
      (s, r) => s + Number((r as { return_fee?: number }).return_fee ?? 0),
      0,
    );

    // Net COD received (this month) = reconciledTotal - returnFees
    const netCod = reconciledTotal - returnFeesTotal;

    // Daily series (last 30 days): collected vs expected
    const { data: dailyRows } = await supabase
      .from("orders")
      .select("total, delivered_at, reconciliation_status")
      .eq("brand_id", data.brandId)
      .in("status", ["delivered", "partial_delivered"])
      .gte("delivered_at", cutoff30);

    const dayBuckets = new Map<string, { date: string; expected: number; collected: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dayBuckets.set(d, { date: d, expected: 0, collected: 0 });
    }
    for (const r of dailyRows ?? []) {
      if (!r.delivered_at) continue;
      const k = String(r.delivered_at).slice(0, 10);
      const b = dayBuckets.get(k);
      if (!b) continue;
      const amt = Number(r.total ?? 0);
      b.expected += amt;
      if (r.reconciliation_status === "reconciled") b.collected += amt;
    }

    return {
      kpis: {
        pendingTotal,
        pendingCount: (pending ?? []).length,
        reconciledTotal,
        outstandingTotal,
        outstandingCount: (outstanding ?? []).length,
        returnFeesTotal,
        netCod,
      },
      dailySeries: Array.from(dayBuckets.values()),
    };
  });