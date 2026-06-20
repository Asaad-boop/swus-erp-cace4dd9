import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Returns & Exchanges — server functions
   ============================================================ */

const Uuid = z.string().uuid();

/* ----------------- LIST ----------------- */

export const listReturnCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; status?: string; from?: string; to?: string; q?: string }) =>
    z.object({
      brandIds: z.array(Uuid).optional(),
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      q: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("erp_return_cases")
      .select(`id, case_number, brand_id, order_id, product_id, sku, return_type, item_condition, qty,
               refund_amount, return_status, qc_condition, stock_updated, courier_tracking_id, courier_name,
               created_at, created_by,
               order:order_id ( id, shipping_name, shipping_phone ),
               product:product_id ( id, title, sku, image )`)
      .order("created_at", { ascending: false }).limit(500);
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    if (data.status && data.status !== "all") q = q.eq("return_status", data.status);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listExchangeCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[]; status?: string; from?: string; to?: string }) =>
    z.object({
      brandIds: z.array(Uuid).optional(),
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("erp_exchange_cases")
      .select(`id, case_number, brand_id, original_order_id, original_product_id, exchange_type,
               exchange_type_detail, exchange_status, replacement_product_id, replacement_qty,
               new_order_id, refund_amount, exchange_charge_collected, created_at, created_by,
               order:original_order_id ( id, shipping_name, shipping_phone ),
               product:original_product_id ( id, title, sku, image ),
               replacement:replacement_product_id ( id, title, sku )`)
      .order("created_at", { ascending: false }).limit(500);
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    if (data.status && data.status !== "all") q = q.eq("exchange_status", data.status);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ----------------- DETAIL ----------------- */

export const getCaseDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    // Try return first
    const { data: ret } = await sb.from("erp_return_cases")
      .select(`*, order:order_id ( id, shipping_name, shipping_phone, shipping_address, total ),
               product:product_id ( id, title, sku, image, weighted_avg_cost ),
               item:order_item_id ( id, quantity, unit_price, line_total, unit_cost_snapshot, variant_id )`)
      .eq("id", data.caseId).maybeSingle();
    if (ret) {
      const { data: tl } = await sb.from("erp_return_timeline")
        .select("*").eq("case_id", data.caseId).eq("case_type", "return")
        .order("created_at", { ascending: true });
      return { type: "return" as const, case: ret, timeline: tl ?? [] };
    }
    const { data: exc } = await sb.from("erp_exchange_cases")
      .select(`*, order:original_order_id ( id, shipping_name, shipping_phone, shipping_address ),
               product:original_product_id ( id, title, sku, image ),
               replacement:replacement_product_id ( id, title, sku, price ),
               new_order:new_order_id ( id, status )`)
      .eq("id", data.caseId).maybeSingle();
    if (!exc) throw new Error("Case not found");
    const { data: tl } = await sb.from("erp_return_timeline")
      .select("*").eq("case_id", data.caseId).eq("case_type", "exchange")
      .order("created_at", { ascending: true });
    return { type: "exchange" as const, case: exc, timeline: tl ?? [] };
  });

/* ----------------- UPDATE STATUS ----------------- */

export const updateReturnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string; status: string; note?: string; isExchange?: boolean }) =>
    z.object({ caseId: Uuid, status: z.string(), note: z.string().optional(), isExchange: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const table = data.isExchange ? "erp_exchange_cases" : "erp_return_cases";
    const statusCol = data.isExchange ? "exchange_status" : "return_status";
    const patch: any = { [statusCol]: data.status };
    if (data.status === "closed" || data.status === "completed") patch.resolved_at = new Date().toISOString();
    const { error } = await sb.from(table).update(patch).eq("id", data.caseId);
    if (error) throw error;
    if (data.note) {
      await sb.from("erp_return_timeline").insert({
        case_id: data.caseId, case_type: data.isExchange ? "exchange" : "return",
        status: data.status, note: data.note, created_by: context.userId,
      });
    }
    return { ok: true };
  });

/* ----------------- QC ----------------- */

export const completeQC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string; condition: "sellable" | "damaged" | "missing"; notes?: string }) =>
    z.object({ caseId: Uuid, condition: z.enum(["sellable", "damaged", "missing"]), notes: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: c, error: cErr } = await sb.from("erp_return_cases")
      .select("id, brand_id, product_id, variant_id, qty, stock_updated, return_status, product:product_id(weighted_avg_cost)")
      .eq("id", data.caseId).maybeSingle();
    if (cErr) throw cErr;
    if (!c) throw new Error("Return case not found");

    const now = new Date().toISOString();
    const nextStatus = data.condition === "sellable" ? "restocked" : "qc_done";

    if (data.condition === "sellable" && !c.stock_updated) {
      const wac = Number(c.product?.weighted_avg_cost ?? 0);
      const { error: rpcErr } = await sb.rpc("adjust_stock_v2", {
        _product_id: c.product_id,
        _variant_id: c.variant_id,
        _delta: Number(c.qty),
        _reason: "return_restock",
        _source: "return",
        _unit_cost: wac,
        _reference_type: "erp_return_case",
        _reference_id: c.id,
        _idempotency_key: `return_restock_${c.id}`,
        _note: "Restocked from return QC",
      });
      if (rpcErr) throw rpcErr;
    }

    const { error: uErr } = await sb.from("erp_return_cases").update({
      qc_condition: data.condition,
      qc_notes: data.notes ?? null,
      qc_done_by: context.userId,
      qc_done_at: now,
      stock_updated: data.condition === "sellable" ? true : c.stock_updated,
      return_status: nextStatus,
    }).eq("id", data.caseId);
    if (uErr) throw uErr;

    await sb.from("erp_return_timeline").insert({
      case_id: c.id, case_type: "return", status: nextStatus,
      note: `QC: ${data.condition}${data.notes ? " — " + data.notes : ""}`,
      created_by: context.userId,
    });

    return { ok: true, restocked: data.condition === "sellable" };
  });

/* ----------------- EXCHANGE ORDER ----------------- */

export const createExchangeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: exc, error: eErr } = await sb.from("erp_exchange_cases")
      .select(`id, brand_id, original_order_id, replacement_product_id, replacement_variant_id,
               replacement_qty, exchange_charge_collected, new_order_id,
               order:original_order_id ( shipping_name, shipping_phone, shipping_address ),
               replacement:replacement_product_id ( id, title, price, sku )`)
      .eq("id", data.caseId).maybeSingle();
    if (eErr) throw eErr;
    if (!exc) throw new Error("Exchange case not found");
    if (exc.new_order_id) throw new Error("Exchange order already created");
    if (!exc.replacement_product_id) throw new Error("No replacement product on case");

    const charge = Number(exc.exchange_charge_collected ?? 0);
    const qty = Number(exc.replacement_qty ?? 1);
    const price = Number(exc.replacement?.price ?? 0);

    const { data: order, error: oErr } = await sb.from("orders").insert({
      brand_id: exc.brand_id,
      shipping_name: exc.order?.shipping_name ?? null,
      shipping_phone: exc.order?.shipping_phone ?? null,
      shipping_address: exc.order?.shipping_address ?? null,
      subtotal: price * qty,
      total: charge,
      shipping_fee: 0,
      payment_method: "cod",
      source: "manual",
      status: "new",
      notes: `Exchange for order ${exc.original_order_id}`,
    }).select("id").single();
    if (oErr) throw oErr;

    await sb.from("order_items").insert({
      order_id: order.id,
      product_id: exc.replacement_product_id,
      variant_id: exc.replacement_variant_id ?? null,
      quantity: qty,
      unit_price: price,
      line_total: price * qty,
    });

    await sb.from("erp_exchange_cases").update({
      new_order_id: order.id,
      exchange_status: "new_order_created",
    }).eq("id", exc.id);

    await sb.from("erp_return_timeline").insert({
      case_id: exc.id, case_type: "exchange", status: "new_order_created",
      note: `Exchange order #${String(order.id).slice(0, 8)} created`,
      created_by: context.userId,
    });

    return { ok: true, orderId: order.id, orderNumber: String(order.id).slice(0, 8) };
  });

/* ----------------- ORDER -> CASES (for order detail mini list) ----------------- */

export const listCasesForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: Uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [{ data: rets }, { data: excs }] = await Promise.all([
      sb.from("erp_return_cases")
        .select("id, case_number, return_status, refund_amount, qty, created_at")
        .eq("order_id", data.orderId).order("created_at", { ascending: false }),
      sb.from("erp_exchange_cases")
        .select("id, case_number, exchange_status, exchange_charge_collected, replacement_qty, created_at")
        .eq("original_order_id", data.orderId).order("created_at", { ascending: false }),
    ]);
    return {
      returns: rets ?? [],
      exchanges: excs ?? [],
    };
  });