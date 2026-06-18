import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Local Purchase Orders — server functions
   ============================================================ */

/** Generate next PO number: LPO-YYMM-NNNN (per brand per month). */
async function nextPoNumber(supabase: any, brandId: string): Promise<string> {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `LPO-${yymm}-`;
  const { data, error } = await supabase
    .from("local_purchase_orders")
    .select("po_number")
    .eq("brand_id", brandId)
    .like("po_number", `${prefix}%`)
    .order("po_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  let next = 1;
  if (data && data.length > 0) {
    const last = data[0].po_number as string;
    const tail = parseInt(last.slice(prefix.length), 10);
    if (Number.isFinite(tail)) next = tail + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/* ---------- READ ---------- */

export const listLocalPos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; status?: string; q?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      status: z.string().optional(),
      q: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("local_purchase_orders")
      .select(`
        id, po_number, brand_id, supplier_id, status,
        order_date, expected_date, received_date,
        subtotal, discount, tax, shipping_cost, total,
        amount_paid, balance_due, bill_id, notes, created_at,
        supplier:supplier_id ( id, name )
      `)
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.q) q = q.ilike("po_number", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getLocalPoDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string }) => z.object({ poId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [poRes, itemsRes, receiptsRes] = await Promise.all([
      context.supabase.from("local_purchase_orders").select(`
        id, po_number, brand_id, supplier_id, status,
        order_date, expected_date, received_date,
        subtotal, discount, tax, shipping_cost, total,
        amount_paid, balance_due, bill_id, notes, created_at,
        supplier:supplier_id ( id, name, phone, address, currency )
      `).eq("id", data.poId).maybeSingle(),
      context.supabase.from("local_po_items").select(`
        id, product_id, variant_id, description,
        ordered_qty, received_qty, pending_qty,
        unit_cost, total_cost,
        product:product_id ( id, title, sku, image_url )
      `).eq("po_id", data.poId).order("created_at"),
      context.supabase.from("local_po_receipts").select(`
        id, received_date, notes, created_at,
        items:local_po_receipt_items ( id, po_item_id, product_id, variant_id, received_qty, unit_cost )
      `).eq("po_id", data.poId).order("received_date", { ascending: false }),
    ]);
    if (poRes.error) throw poRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (receiptsRes.error) throw receiptsRes.error;
    if (!poRes.data) throw new Error("PO not found");
    return { po: poRes.data, items: itemsRes.data ?? [], receipts: receiptsRes.data ?? [] };
  });

/* ---------- CREATE ---------- */

const itemInput = z.object({
  product_id: z.string().uuid().nullable().optional(),
  variant_id: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  ordered_qty: z.number().int().positive(),
  unit_cost: z.number().nonnegative(),
});

export const createLocalPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brand_id: z.string().uuid(),
      supplier_id: z.string().uuid(),
      order_date: z.string(),
      expected_date: z.string().optional().nullable(),
      discount: z.number().nonnegative().default(0),
      tax: z.number().nonnegative().default(0),
      shipping_cost: z.number().nonnegative().default(0),
      notes: z.string().optional(),
      items: z.array(itemInput).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const subtotal = data.items.reduce((s, it) => s + it.ordered_qty * it.unit_cost, 0);
    const total = subtotal - data.discount + data.tax + data.shipping_cost;
    const po_number = await nextPoNumber(supabase, data.brand_id);

    const { data: po, error: poErr } = await supabase
      .from("local_purchase_orders")
      .insert({
        brand_id: data.brand_id,
        supplier_id: data.supplier_id,
        po_number,
        status: "draft",
        order_date: data.order_date,
        expected_date: data.expected_date || null,
        subtotal,
        discount: data.discount,
        tax: data.tax,
        shipping_cost: data.shipping_cost,
        total,
        notes: data.notes || null,
        created_by: userId,
      })
      .select("id, po_number")
      .single();
    if (poErr) throw poErr;

    const itemRows = data.items.map((it) => ({
      po_id: po.id,
      product_id: it.product_id || null,
      variant_id: it.variant_id || null,
      description: it.description || null,
      ordered_qty: it.ordered_qty,
      unit_cost: it.unit_cost,
    }));
    const { error: itErr } = await supabase.from("local_po_items").insert(itemRows);
    if (itErr) throw itErr;

    return { po_id: po.id, po_number: po.po_number };
  });

/* ---------- STATUS ---------- */

export const updateLocalPoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string; status: "draft" | "sent" | "cancelled" }) =>
    z.object({
      poId: z.string().uuid(),
      status: z.enum(["draft", "sent", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("local_purchase_orders")
      .update({ status: data.status })
      .eq("id", data.poId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- RECEIVE ---------- */

export const receiveLocalPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      received_date: z.string(),
      notes: z.string().optional(),
      items: z.array(z.object({
        po_item_id: z.string().uuid(),
        received_qty: z.number().int().positive(),
        unit_cost: z.number().nonnegative().optional(),
      })).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: po, error: poErr } = await supabase
      .from("local_purchase_orders")
      .select("id, brand_id, status")
      .eq("id", data.po_id)
      .maybeSingle();
    if (poErr) throw poErr;
    if (!po) throw new Error("PO not found");
    if (po.status === "cancelled") throw new Error("Cannot receive a cancelled PO");

    const itemIds = data.items.map((i: any) => i.po_item_id);
    const { data: poItems, error: itErr } = await supabase
      .from("local_po_items")
      .select("id, product_id, variant_id, ordered_qty, received_qty, unit_cost")
      .in("id", itemIds);
    if (itErr) throw itErr;
    const itemMap = new Map<string, any>((poItems ?? []).map((r: any) => [r.id, r]));

    // Validate received_qty doesn't exceed pending
    for (const inp of data.items) {
      const row = itemMap.get(inp.po_item_id);
      if (!row) throw new Error(`Item ${inp.po_item_id} not on this PO`);
      const pending = (row.ordered_qty || 0) - (row.received_qty || 0);
      if (inp.received_qty > pending) {
        throw new Error(`Cannot receive ${inp.received_qty}; only ${pending} pending`);
      }
    }

    // Create receipt
    const { data: receipt, error: rErr } = await supabase
      .from("local_po_receipts")
      .insert({
        po_id: po.id,
        brand_id: po.brand_id,
        received_date: data.received_date,
        notes: data.notes || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (rErr) throw rErr;

    // Receipt items + stock movements
    const receiptItemRows: any[] = [];
    for (const inp of data.items) {
      const row = itemMap.get(inp.po_item_id);
      const cost = inp.unit_cost ?? Number(row.unit_cost) ?? 0;
      receiptItemRows.push({
        receipt_id: receipt.id,
        po_item_id: row.id,
        product_id: row.product_id,
        variant_id: row.variant_id,
        received_qty: inp.received_qty,
        unit_cost: cost,
      });

      if (row.product_id) {
        const { error: adjErr } = await supabase.rpc("adjust_stock_v2", {
          _product_id: row.product_id,
          _variant_id: row.variant_id,
          _delta: inp.received_qty,
          _reason: "purchase_order",
          _note: `Local PO receipt`,
          _unit_cost: cost > 0 ? cost : null,
          _source: "local_po",
          _reference_type: "local_po_receipt",
          _reference_id: receipt.id,
        });
        if (adjErr) throw adjErr;
      }

      // Update received_qty on the po_item
      const newReceived = (row.received_qty || 0) + inp.received_qty;
      const { error: updErr } = await supabase
        .from("local_po_items")
        .update({ received_qty: newReceived })
        .eq("id", row.id);
      if (updErr) throw updErr;
    }

    const { error: riErr } = await supabase.from("local_po_receipt_items").insert(receiptItemRows);
    if (riErr) throw riErr;

    // Recompute PO status by fetching all items
    const { data: allItems } = await supabase
      .from("local_po_items")
      .select("ordered_qty, received_qty")
      .eq("po_id", po.id);
    const totalOrdered = (allItems ?? []).reduce((s: number, r: any) => s + (r.ordered_qty || 0), 0);
    const totalReceived = (allItems ?? []).reduce((s: number, r: any) => s + (r.received_qty || 0), 0);
    let newStatus: string = po.status;
    if (totalReceived >= totalOrdered) newStatus = "received";
    else if (totalReceived > 0) newStatus = "partial";

    const updatePatch: any = { status: newStatus };
    if (newStatus === "received") updatePatch.received_date = data.received_date;
    await supabase.from("local_purchase_orders").update(updatePatch).eq("id", po.id);

    return { receipt_id: receipt.id, status: newStatus };
  });

/* ---------- BILL (Finance link) ---------- */

export const createBillFromLocalPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string; bill_date?: string; due_date?: string }) =>
    z.object({
      poId: z.string().uuid(),
      bill_date: z.string().optional(),
      due_date: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: po, error: poErr } = await supabase
      .from("local_purchase_orders")
      .select("id, brand_id, supplier_id, po_number, total, bill_id")
      .eq("id", data.poId)
      .maybeSingle();
    if (poErr) throw poErr;
    if (!po) throw new Error("PO not found");
    if (po.bill_id) throw new Error("Bill already created for this PO");

    const bill_no = `BILL-${po.po_number}`;
    const { data: bill, error: bErr } = await supabase
      .from("erp_bills")
      .insert({
        brand_id: po.brand_id,
        supplier_id: po.supplier_id,
        bill_no,
        bill_date: data.bill_date || new Date().toISOString().slice(0, 10),
        due_date: data.due_date || null,
        amount: po.total,
        paid_amount: 0,
        status: "open",
        description: `Auto-created from ${po.po_number}`,
        source_type: "local_po",
        source_id: po.id,
        created_by: userId,
      })
      .select("id")
      .single();
    if (bErr) throw bErr;

    const { error: linkErr } = await supabase
      .from("local_purchase_orders")
      .update({ bill_id: bill.id })
      .eq("id", po.id);
    if (linkErr) throw linkErr;

    return { bill_id: bill.id, bill_no };
  });

/* ---------- SUPPLIERS LIST ---------- */

export const listLocalSuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("erp_suppliers")
      .select("id, name, phone, currency, supplier_type, current_due")
      .eq("brand_id", data.brandId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return rows ?? [];
  });