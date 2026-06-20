import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Schemas ----------

const RowInput = z.object({
  consignment_id: z.string().nullable().optional(),
  merchant_order_id: z.string().nullable().optional(),
  recipient_name: z.string().nullable().optional(),
  recipient_phone: z.string().nullable().optional(),
  invoice_date: z.string().nullable().optional(), // YYYY-MM-DD
  collected: z.number(),
  delivery_fee: z.number(),
  cod_fee: z.number(),
  other_fee: z.number(),
  discount: z.number(),
  total_fee: z.number(),
  payout: z.number(),
  store_name: z.string().nullable().optional(),
  raw: z.unknown().optional(),
  row_type: z.enum(["paid", "return", "partial"]).optional().default("paid"),
  return_fee: z.number().optional().default(0),
  partial_amount: z.number().optional().default(0),
});

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-11); // last 11 digits (BD mobile)
}

// ---------- Create run (parse + match preview) ----------

export const createPathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        brandId: z.string().uuid(),
        filename: z.string().nullable().optional(),
        rows: z.array(RowInput).min(1),
        tolerance: z.number().min(0).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Create draft run
    const totals = data.rows.reduce(
      (acc, r) => ({
        collected: acc.collected + r.collected,
        fee: acc.fee + r.total_fee,
        payout: acc.payout + r.payout,
      }),
      { collected: 0, fee: 0, payout: 0 },
    );

    const { data: run, error: runErr } = await supabase
      .from("erp_reconciliation_runs")
      .insert({
        brand_id: data.brandId,
        courier: "pathao",
        source_filename: data.filename ?? null,
        uploaded_by: userId,
        total_rows: data.rows.length,
        total_collected: totals.collected,
        total_fee: totals.fee,
        total_payout: totals.payout,
        status: "draft",
      })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);
    const runId = (run as { id: string }).id;

    // 2. Match each row
    // Pre-fetch helpers: consignment + merchant_order_id maps from shipments for this brand
    const consignmentIds = [...new Set(data.rows.map((r) => r.consignment_id).filter(Boolean) as string[])];
    const merchantIds = [...new Set(data.rows.map((r) => r.merchant_order_id).filter(Boolean) as string[])];

    const shipmentByConsignment = new Map<string, { order_id: string }>();
    const shipmentByMerchant = new Map<string, { order_id: string }>();

    if (consignmentIds.length) {
      const { data: ships } = await supabase
        .from("courier_shipments")
        .select("order_id, consignment_id")
        .eq("brand_id", data.brandId)
        .in("consignment_id", consignmentIds);
      (ships ?? []).forEach((s) => {
        if (s.consignment_id) shipmentByConsignment.set(s.consignment_id, { order_id: s.order_id });
      });
    }
    if (merchantIds.length) {
      const { data: ships } = await supabase
        .from("courier_shipments")
        .select("order_id, merchant_order_id")
        .eq("brand_id", data.brandId)
        .in("merchant_order_id", merchantIds);
      (ships ?? []).forEach((s) => {
        if (s.merchant_order_id) shipmentByMerchant.set(s.merchant_order_id, { order_id: s.order_id });
      });
    }

    // Build row inserts
    type RowInsert = {
      run_id: string;
      consignment_id: string | null;
      merchant_order_id: string | null;
      recipient_name: string | null;
      recipient_phone: string | null;
      invoice_date: string | null;
      collected: number;
      delivery_fee: number;
      cod_fee: number;
      other_fee: number;
      discount: number;
      total_fee: number;
      payout: number;
      store_name: string | null;
      raw: unknown;
      match_status: string;
      matched_order_id: string | null;
      matched_via: string | null;
      amount_diff: number | null;
      match_type: string;
      return_fee: number;
      partial_amount: number;
    };

    const rowInserts: RowInsert[] = [];

    for (const r of data.rows) {
      let matchedOrderId: string | null = null;
      let matchedVia: string | null = null;

      if (r.consignment_id && shipmentByConsignment.has(r.consignment_id)) {
        matchedOrderId = shipmentByConsignment.get(r.consignment_id)!.order_id;
        matchedVia = "consignment";
      } else if (r.merchant_order_id && shipmentByMerchant.has(r.merchant_order_id)) {
        matchedOrderId = shipmentByMerchant.get(r.merchant_order_id)!.order_id;
        matchedVia = "merchant_order_id";
      } else {
        // phone fallback
        const phone = normalizePhone(r.recipient_phone);
        if (phone) {
          const { data: ords } = await supabase
            .from("orders")
            .select("id, total, shipping_phone, status, created_at")
            .eq("brand_id", data.brandId)
            .ilike("shipping_phone", `%${phone}`)
            .order("created_at", { ascending: false })
            .limit(5);
          const best = (ords ?? []).find((o) => Math.abs(Number(o.total) - r.collected) <= 50);
          if (best) {
            matchedOrderId = best.id;
            matchedVia = "phone+amount";
          }
        }
      }

      let amountDiff: number | null = null;
      let status = "unmatched";
      if (matchedOrderId) {
        const { data: ord } = await supabase
          .from("orders")
          .select("total")
          .eq("id", matchedOrderId)
          .maybeSingle();
        if (ord) {
          amountDiff = r.collected - Number(ord.total);
          status =
            Math.abs(amountDiff) <= data.tolerance ? "matched" : "amount_mismatch";
        } else {
          status = "matched"; // already linked though we couldn't re-read
        }

        // Duplicate check: same order already applied in another run
        const { data: dupe } = await supabase
          .from("erp_reconciliation_rows")
          .select("id")
          .eq("matched_order_id", matchedOrderId)
          .not("applied_income_txn_id", "is", null)
          .limit(1);
        if (dupe && dupe.length > 0) status = "duplicate";
      }

      rowInserts.push({
        run_id: runId,
        consignment_id: r.consignment_id ?? null,
        merchant_order_id: r.merchant_order_id ?? null,
        recipient_name: r.recipient_name ?? null,
        recipient_phone: r.recipient_phone ?? null,
        invoice_date: r.invoice_date ?? null,
        collected: r.collected,
        delivery_fee: r.delivery_fee,
        cod_fee: r.cod_fee,
        other_fee: r.other_fee,
        discount: r.discount,
        total_fee: r.total_fee,
        payout: r.payout,
        store_name: r.store_name ?? null,
        raw: r.raw ?? null,
        match_status: status,
        matched_order_id: matchedOrderId,
        matched_via: matchedVia,
        amount_diff: amountDiff,
        match_type: r.row_type ?? "paid",
        return_fee: r.return_fee ?? 0,
        partial_amount: r.partial_amount ?? 0,
      });
    }

    const { error: rowErr } = await supabase
      .from("erp_reconciliation_rows")
      .insert(rowInserts as never);
    if (rowErr) throw new Error(rowErr.message);

    // Update counts on run
    const matched = rowInserts.filter((r) => r.match_status === "matched").length;
    const mismatched = rowInserts.filter((r) => r.match_status === "amount_mismatch").length;
    const unmatched = rowInserts.filter(
      (r) => r.match_status === "unmatched" || r.match_status === "duplicate",
    ).length;

    await supabase
      .from("erp_reconciliation_runs")
      .update({
        matched_count: matched,
        mismatched_count: mismatched,
        unmatched_count: unmatched,
      })
      .eq("id", runId);

    return { runId };
  });

// ---------- Get run with rows ----------

export const getPathaoReconciliationRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: run, error: runErr } = await supabase
      .from("erp_reconciliation_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run) throw new Error("Run not found");

    const { data: rows, error: rowErr } = await supabase
      .from("erp_reconciliation_rows")
      .select("*, orders:matched_order_id(id, status, total, shipping_name, shipping_phone, payment_status)")
      .eq("run_id", data.runId)
      .order("created_at", { ascending: true });
    if (rowErr) throw new Error(rowErr.message);

    return { run, rows: rows ?? [] };
  });

// ---------- List runs ----------

export const listPathaoReconciliationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: runs, error } = await supabase
      .from("erp_reconciliation_runs")
      .select("*")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return runs ?? [];
  });

// ---------- Apply run ----------

export const applyPathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        runId: z.string().uuid(),
        walletAccountId: z.string().uuid(),
        feeCategoryId: z.string().uuid().nullable().optional(),
        includeMismatch: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: run, error: runErr } = await supabase
      .from("erp_reconciliation_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run) throw new Error("Run not found");
    if (run.status === "applied") throw new Error("Already applied");
    if (!run.brand_id) throw new Error("Run has no brand assigned");
    const brandId = run.brand_id;

    const allowedStatuses = data.includeMismatch
      ? ["matched", "amount_mismatch"]
      : ["matched"];

    const { data: rows, error: rowErr } = await supabase
      .from("erp_reconciliation_rows")
      .select("*")
      .eq("run_id", data.runId)
      .in("match_status", allowedStatuses)
      .is("applied_income_txn_id", null);
    if (rowErr) throw new Error(rowErr.message);

    let applied = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const r of rows ?? []) {
      if (!r.matched_order_id) continue;
      try {
        const txnDate = r.invoice_date ?? new Date().toISOString().slice(0, 10);
        const description = `Pathao reconciliation · ${r.consignment_id ?? r.merchant_order_id ?? ""}`;

        const matchType = (r as { match_type?: string }).match_type ?? "paid";
        const returnFee = Number((r as { return_fee?: number }).return_fee ?? 0);
        const partialAmount = Number((r as { partial_amount?: number }).partial_amount ?? 0);

        // Income (collected). For "return" rows, no income (no COD collected).
        let incomeId: string | null = null;
        const incomeAmount = matchType === "return" ? 0 : (matchType === "partial" && partialAmount > 0 ? partialAmount : Number(r.collected));
        if (incomeAmount > 0) {
          const { data: inc, error: incErr } = await supabase
            .from("erp_transactions")
            .insert({
              brand_id: brandId,
              txn_type: "income",
              account_id: data.walletAccountId,
              amount: incomeAmount,
              transaction_date: txnDate,
              reference_type: "order",
              reference_id: r.matched_order_id,
              description: `${description} · ${matchType === "partial" ? "partial collected" : "collected"}`,
              created_by: userId,
            })
            .select("id")
            .single();
          if (incErr) throw incErr;
          incomeId = (inc as { id: string }).id;
        }

        // Expense (total fee + return fee if applicable)
        let expenseId: string | null = null;
        const expenseAmount = Number(r.total_fee) + (matchType === "return" ? returnFee : 0);
        if (expenseAmount > 0) {
          const { data: exp, error: expErr } = await supabase
            .from("erp_transactions")
            .insert({
              brand_id: brandId,
              txn_type: "expense",
              account_id: data.walletAccountId,
              category_id: data.feeCategoryId ?? null,
              amount: expenseAmount,
              transaction_date: txnDate,
              reference_type: "order",
              reference_id: r.matched_order_id,
              description: `${description} · ${matchType === "return" ? "return + courier charges" : "courier charges"}`,
              created_by: userId,
            })
            .select("id")
            .single();
          if (expErr) throw expErr;
          expenseId = (exp as { id: string }).id;
        }

        // Update order — branch by match_type
        const orderUpdate: Record<string, unknown> = {
          reconciliation_status: "reconciled",
        };
        if (matchType === "return") {
          orderUpdate.status = "returned";
        } else if (matchType === "partial") {
          orderUpdate.status = "partial_delivered";
          orderUpdate.payment_status = "partial";
          orderUpdate.delivered_at = new Date(txnDate).toISOString();
        } else {
          orderUpdate.status = "delivered";
          orderUpdate.payment_status = "paid";
          orderUpdate.delivered_at = new Date(txnDate).toISOString();
        }
        const { error: oErr } = await supabase
          .from("orders")
          .update(orderUpdate as never)
          .eq("id", r.matched_order_id);
        if (oErr) throw oErr;

        // Update shipment delivery fee if linked
        if (r.consignment_id) {
          const shipStatus = matchType === "return" ? "Returned" : matchType === "partial" ? "Partial Delivered" : "Delivered";
          await supabase
            .from("courier_shipments")
            .update({ delivery_fee: r.total_fee, status: shipStatus })
            .eq("consignment_id", r.consignment_id)
            .eq("brand_id", brandId);
        }

        // Mark row applied
        await supabase
          .from("erp_reconciliation_rows")
          .update({
            applied_income_txn_id: incomeId,
            applied_expense_txn_id: expenseId,
          } as never)
          .eq("id", r.id);

        applied++;
      } catch (e) {
        failed++;
        errors.push(`Row ${r.consignment_id ?? r.id}: ${(e as Error).message}`);
      }
    }

    await supabase
      .from("erp_reconciliation_runs")
      .update({
        status: failed === 0 ? "applied" : "partial",
        applied_at: new Date().toISOString(),
        notes: errors.length ? errors.slice(0, 10).join("\n") : null,
      })
      .eq("id", data.runId);

    return { applied, failed, errors: errors.slice(0, 10) };
  });

// ---------- Revert run ----------

export const revertPathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: rows, error: rowErr } = await supabase
      .from("erp_reconciliation_rows")
      .select("id, applied_income_txn_id, applied_expense_txn_id")
      .eq("run_id", data.runId);
    if (rowErr) throw new Error(rowErr.message);

    const txnIds = (rows ?? [])
      .flatMap((r) => [r.applied_income_txn_id, r.applied_expense_txn_id])
      .filter(Boolean) as string[];

    if (txnIds.length) {
      await supabase.from("erp_transactions").delete().in("id", txnIds);
    }

    await supabase
      .from("erp_reconciliation_rows")
      .update({ applied_income_txn_id: null, applied_expense_txn_id: null })
      .eq("run_id", data.runId);

    await supabase
      .from("erp_reconciliation_runs")
      .update({ status: "reverted", reverted_at: new Date().toISOString() })
      .eq("id", data.runId);

    return { ok: true, reverted: txnIds.length };
  });

// ---------- Delete draft run ----------

export const deletePathaoReconciliationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: run } = await supabase
      .from("erp_reconciliation_runs")
      .select("status")
      .eq("id", data.runId)
      .maybeSingle();
    if (run && run.status === "applied") throw new Error("Cannot delete an applied run. Revert first.");
    const { error } = await supabase.from("erp_reconciliation_runs").delete().eq("id", data.runId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Manual match a row ----------

export const manualMatchReconciliationRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rowId: z.string().uuid(),
        orderId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("erp_reconciliation_rows")
      .select("collected, run_id")
      .eq("id", data.rowId)
      .maybeSingle();
    if (!row) throw new Error("Row not found");

    let status = "unmatched";
    let amountDiff: number | null = null;
    if (data.orderId) {
      const { data: ord } = await supabase
        .from("orders")
        .select("total")
        .eq("id", data.orderId)
        .maybeSingle();
      if (ord) {
        amountDiff = Number(row.collected) - Number(ord.total);
        status = Math.abs(amountDiff) <= 1 ? "matched" : "amount_mismatch";
      }
    }

    const { error } = await supabase
      .from("erp_reconciliation_rows")
      .update({
        matched_order_id: data.orderId,
        matched_via: data.orderId ? "manual" : null,
        match_status: status,
        amount_diff: amountDiff,
      })
      .eq("id", data.rowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Search orders for manual matching ----------

export const searchOrdersForMatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ brandId: z.string().uuid(), q: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const term = data.q.trim();
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, status, total, shipping_name, shipping_phone, created_at")
      .eq("brand_id", data.brandId)
      .or(`shipping_phone.ilike.%${term}%,shipping_name.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return orders ?? [];
  });