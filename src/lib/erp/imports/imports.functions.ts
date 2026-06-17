import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================================================
   Helpers
   ============================================================ */

async function assertAnyRole(
  supabase: any,
  userId: string,
  roles: Array<"admin" | "accountant" | "operations" | "warehouse_staff">,
) {
  const results = await Promise.all(
    roles.map((r) => supabase.rpc("has_role", { _user_id: userId, _role: r })),
  );
  if (!results.some((r: any) => r.data === true)) {
    throw new Error("Not authorized");
  }
}

/* ============================================================
   READ-side server functions
   ============================================================ */

export const listPurchaseOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; status?: string; q?: string; from?: string; to?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      status: z.string().optional(),
      q: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_purchase_orders")
      .select(`
        id, po_number, brand_id, supplier_id, order_date,
        currency, fx_rate,
        product_subtotal_bdt, shipping_total_bdt, local_courier_total_bdt,
        grand_total_bdt, paid_bdt, due_bdt, status, notes, created_at,
        supplier:supplier_id ( id, name )
      `)
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status as any);
    if (data.from) q = q.gte("order_date", data.from);
    if (data.to) q = q.lte("order_date", data.to);
    if (data.q) q = q.or(`po_number.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getPurchaseOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string }) =>
    z.object({ poId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [poRes, itemsRes, cartonsRes, paymentsRes, historyRes] = await Promise.all([
      context.supabase.from("imp_purchase_orders").select(`
        id, po_number, brand_id, supplier_id, order_date,
        currency, fx_rate,
        product_subtotal_bdt, shipping_total_bdt, local_courier_total_bdt,
        grand_total_bdt, paid_bdt, due_bdt, status, notes, created_at,
        supplier:supplier_id ( id, name, phone, source_link, address, currency )
      `).eq("id", data.poId).maybeSingle(),
      context.supabase.from("imp_po_items").select(`
        id, product_id, variant_id, sku_snapshot, name_snapshot, image_snapshot,
        quantity, unit_cost_foreign, unit_cost_bdt, subtotal_bdt
      `).eq("po_id", data.poId).order("created_at"),
      context.supabase.from("imp_cartons").select(`
        id, carton_number, barcode, expected_quantity,
        supplier_cost_bdt, shipping_charge_bdt, local_courier_bdt, total_landed_bdt,
        weight_kg, status, warehouse_id, received_at, released_at, qc_at, posted_at, notes,
        items:imp_carton_items ( id, po_item_id, product_id, variant_id, sku_snapshot,
          quantity_expected, quantity_ok, quantity_damaged, quantity_missing )
      `).eq("po_id", data.poId).order("carton_number"),
      context.supabase.from("imp_payments").select(`
        id, carton_id, payment_type, amount_bdt, wallet_id, payment_date, reference,
        notes, journal_entry_id, is_reversed, created_at,
        wallet:wallet_id ( id, name )
      `).eq("po_id", data.poId).order("payment_date", { ascending: false }),
      context.supabase.from("imp_status_history").select(`
        id, entity_type, entity_id, previous_status, new_status, action, notes, created_at, changed_by
      `).or(`and(entity_type.eq.po,entity_id.eq.${data.poId})`)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (poRes.error) throw poRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (cartonsRes.error) throw cartonsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    return {
      po: poRes.data,
      items: itemsRes.data ?? [],
      cartons: cartonsRes.data ?? [],
      payments: paymentsRes.data ?? [],
      history: historyRes.data ?? [],
    };
  });

export const listImportSuppliers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("erp_suppliers")
      .select(`
        id, name, phone, address, source_link, country, currency,
        payment_terms_days, credit_limit_bdt, supplier_type, is_active,
        current_due, opening_balance, notes
      `)
      .eq("brand_id", data.brandId)
      .in("supplier_type", ["import", "both"])
      .order("name");
    if (error) throw error;
    return rows ?? [];
  });

export const listWarehouses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("warehouses")
      .select("id, name, code, is_default, is_active")
      .eq("brand_id", data.brandId)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw error;
    return rows ?? [];
  });

export const getImportsDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; from?: string; to?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_purchase_orders")
      .select(`id, status, grand_total_bdt, paid_bdt, due_bdt,
               product_subtotal_bdt, shipping_total_bdt, local_courier_total_bdt,
               supplier:supplier_id ( id, name )`)
      .eq("brand_id", data.brandId);
    if (data.from) q = q.gte("order_date", data.from);
    if (data.to) q = q.lte("order_date", data.to);
    const { data: pos, error } = await q;
    if (error) throw error;

    const poIds = (pos ?? []).map((p: any) => p.id);
    let cartons: any[] = [];
    if (poIds.length > 0) {
      const { data: cRows, error: cErr } = await context.supabase
        .from("imp_cartons")
        .select("id, po_id, status, expected_quantity")
        .in("po_id", poIds);
      if (cErr) throw cErr;
      cartons = cRows ?? [];
    }
    return { pos: pos ?? [], cartons };
  });

/* ============================================================
   WRITE-side server functions (call RPCs)
   ============================================================ */

/* --- Suppliers (import) --- */

export const upsertImportSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    brandId: string;
    name: string;
    phone?: string;
    address?: string;
    source_link?: string;
    country?: string;
    currency?: string;
    payment_terms_days?: number;
    credit_limit_bdt?: number;
    supplier_type?: "import" | "local" | "both";
    is_active?: boolean;
    notes?: string;
  }) =>
    z.object({
      id: z.string().uuid().optional(),
      brandId: z.string().uuid(),
      name: z.string().min(1).max(120),
      phone: z.string().optional(),
      address: z.string().optional(),
      source_link: z.string().optional(),
      country: z.string().max(8).optional(),
      currency: z.string().max(8).optional(),
      payment_terms_days: z.number().int().nonnegative().optional(),
      credit_limit_bdt: z.number().nonnegative().optional(),
      supplier_type: z.enum(["import", "local", "both"]).optional(),
      is_active: z.boolean().optional(),
      notes: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const payload: any = {
      brand_id: data.brandId,
      name: data.name,
      phone: data.phone ?? null,
      address: data.address ?? null,
      source_link: data.source_link ?? null,
      country: data.country ?? "CN",
      currency: data.currency ?? "CNY",
      payment_terms_days: data.payment_terms_days ?? 0,
      credit_limit_bdt: data.credit_limit_bdt ?? 0,
      supplier_type: data.supplier_type ?? "import",
      is_active: data.is_active ?? true,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("erp_suppliers").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    } else {
      const { data: row, error } = await context.supabase.from("erp_suppliers").insert(payload).select("id").single();
      if (error) throw error;
      return { id: row.id };
    }
  });

/* --- PO create --- */

const poItemSchema = z.object({
  product_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  sku_snapshot: z.string().optional(),
  name_snapshot: z.string().min(1),
  image_snapshot: z.string().optional(),
  quantity: z.number().int().positive(),
  unit_cost_foreign: z.number().nonnegative(),
});

const cartonAllocSchema = z.object({
  item_index: z.number().int().nonnegative(),
  quantity: z.number().int().nonnegative(),
});

const cartonSchema = z.object({
  carton_number: z.number().int().positive(),
  weight_kg: z.number().nonnegative().optional(),
  allocations: z.array(cartonAllocSchema),
});

const initialPaymentSchema = z.object({
  amount_bdt: z.number().positive(),
  wallet_id: z.string().uuid(),
  payment_date: z.string(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  idempotency_key: z.string().min(8),
  payment_type: z.enum(["supplier_advance", "supplier_payment"]).optional(),
});

const supplierInlineSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().optional(),
  source_link: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  payment_terms_days: z.number().int().nonnegative().optional(),
  credit_limit_bdt: z.number().nonnegative().optional(),
  supplier_type: z.enum(["import", "local", "both"]).optional(),
});

export const createImportPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brand_id: z.string().uuid(),
      order_date: z.string(),
      currency: z.string().default("CNY"),
      fx_rate: z.number().positive(),
      notes: z.string().optional(),
      supplier: supplierInlineSchema.optional(),
      items: z.array(poItemSchema).min(1),
      cartons: z.array(cartonSchema).min(1),
      initial_payment: initialPaymentSchema.optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_create_po", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- Product picker + quick create (for New PO page) --- */

export const listProductsForPicker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; search?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      search: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("products")
      .select("id,title,slug,image,sku,stock,cost_price")
      .eq("brand_id", data.brandId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`title.ilike.%${s}%,sku.ilike.%${s}%,slug.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const quickCreateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; title: string; sku?: string; image?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      title: z.string().min(1).max(160),
      sku: z.string().max(64).optional(),
      image: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_quick_create_product", {
      _brand: data.brandId,
      _title: data.title,
      _sku: data.sku ?? undefined,
      _image: data.image ?? undefined,
    });
    if (error) throw error;
    return out as { id: string; title: string; slug: string };
  });

/* --- carton stage update --- */

export const updateCartonStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { carton_id: string; new_stage: string; notes?: string }) =>
    z.object({
      carton_id: z.string().uuid(),
      new_stage: z.enum(["ordered", "at_china_warehouse", "in_transit", "cancelled"]),
      notes: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);
    const { error } = await context.supabase.rpc("imp_update_carton_stage", {
      _carton: data.carton_id,
      _new_stage: data.new_stage,
      _notes: data.notes ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  });

/* --- mark arrived in BD --- */

export const markArrivedInBd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      po_id: z.string().uuid(),
      total_weight_kg: z.number().positive(),
      rate_per_kg_bdt: z.number().positive(),
      shipping_payment: z.object({
        amount: z.number().positive(),
        wallet_id: z.string().uuid(),
        payment_date: z.string(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        idempotency_key: z.string().min(8),
      }).optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_mark_arrived", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- release carton --- */

export const releaseCarton = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      release_without_payment: z.boolean().optional(),
      payment: z.object({
        amount: z.number().positive(),
        wallet_id: z.string().uuid(),
        payment_date: z.string(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        idempotency_key: z.string().min(8),
      }).optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "accountant", "warehouse_staff"]);
    const { data: out, error } = await context.supabase.rpc("imp_release_carton", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- post to inventory (QC) --- */

const qcRow = z.object({
  carton_item_id: z.string().uuid(),
  quantity_ok: z.number().int().nonnegative(),
  quantity_damaged: z.number().int().nonnegative(),
  quantity_missing: z.number().int().nonnegative(),
});

const optPay = z.object({
  amount: z.number().positive(),
  wallet_id: z.string().uuid(),
  payment_date: z.string(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  idempotency_key: z.string().min(8),
}).optional();

export const postCartonToInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      carton_id: z.string().uuid(),
      warehouse_id: z.string().uuid().optional(),
      qc: z.array(qcRow).min(1),
      local_courier_payment: optPay,
      supplier_due_payment: optPay,
      due_override_reason: z.string().optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "operations", "warehouse_staff"]);
    const { data: out, error } = await context.supabase.rpc("imp_post_to_inventory", { _payload: data });
    if (error) throw error;
    return out;
  });

/* --- standalone payment --- */

export const recordImportPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brand_id: z.string().uuid(),
      po_id: z.string().uuid(),
      carton_id: z.string().uuid().optional(),
      payment_type: z.enum([
        "supplier_advance", "supplier_payment", "shipping",
        "carton_release", "supplier_balance", "local_courier", "adjustment",
      ]),
      amount_bdt: z.number().positive(),
      wallet_id: z.string().uuid(),
      payment_date: z.string(),
      reference: z.string().optional(),
      notes: z.string().optional(),
      idempotency_key: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.supabase, context.userId, ["admin", "accountant"]);
    const { data: out, error } = await context.supabase.rpc("imp_record_payment_rpc", { _payload: data });
    if (error) throw error;
    return out;
  });