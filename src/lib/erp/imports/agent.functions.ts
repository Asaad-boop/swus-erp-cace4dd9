import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Resolve the linked cargo agent id for the signed-in user. */
async function resolveAgentId(supabase: any, userId: string) {
  const { data: roleOk } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "cargo_agent",
  });
  if (!roleOk) throw new Error("Not a cargo agent");
  const { data, error } = await supabase
    .from("imp_cargo_agents")
    .select("id, brand_id, name, phone, address, default_shipping_rate_per_kg_bdt, default_currency, default_fx_rate")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No cargo agent profile linked to this account");
  return data;
}

/* ============= READ ============= */

export const getAgentMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => resolveAgentId(context.supabase, context.userId));

export const getAgentDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) =>
    z.object({ from: z.string().optional(), to: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    let q = context.supabase
      .from("imp_purchase_orders")
      .select("id, status, grand_total_bdt, paid_bdt, due_bdt, shipping_total_bdt, order_date")
      .eq("cargo_agent_id", agent.id);
    if (data.from) q = q.gte("order_date", data.from);
    if (data.to) q = q.lte("order_date", data.to);
    const { data: pos, error } = await q;
    if (error) throw error;

    const poIds = (pos ?? []).map((p: any) => p.id);
    let cartons: any[] = [];
    if (poIds.length) {
      const { data: c, error: cErr } = await context.supabase
        .from("imp_cartons")
        .select("id, po_id, status, weight_kg, expected_quantity, release_requested_at")
        .in("po_id", poIds);
      if (cErr) throw cErr;
      cartons = c ?? [];
    }
    return { agent, pos: pos ?? [], cartons };
  });

export const listAgentPurchaseOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; q?: string }) =>
    z.object({ status: z.string().optional(), q: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    let q = context.supabase
      .from("imp_purchase_orders")
      .select(`
        id, po_number, order_date, status, currency, fx_rate,
        product_subtotal_bdt, shipping_total_bdt, grand_total_bdt,
        paid_bdt, due_bdt, created_at,
        supplier:supplier_id ( id, name )
      `)
      .eq("cargo_agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status as any);
    if (data.q) q = q.ilike("po_number", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getAgentPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string }) => z.object({ poId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    const { data: po, error } = await context.supabase
      .from("imp_purchase_orders")
      .select(`
        id, po_number, brand_id, order_date, status, currency, fx_rate,
        product_subtotal_bdt, shipping_total_bdt, local_courier_total_bdt,
        grand_total_bdt, paid_bdt, due_bdt, notes, created_at,
        supplier:supplier_id ( id, name, phone )
      `)
      .eq("id", data.poId)
      .eq("cargo_agent_id", agent.id)
      .maybeSingle();
    if (error) throw error;
    if (!po) throw new Error("PO not found");

    const [itemsRes, cartonsRes, paymentsRes] = await Promise.all([
      context.supabase.from("imp_po_items").select("id, sku_snapshot, name_snapshot, image_snapshot, quantity, unit_cost_foreign, unit_cost_bdt, subtotal_bdt").eq("po_id", data.poId).order("created_at"),
      context.supabase.from("imp_cartons").select("id, carton_number, barcode, expected_quantity, weight_kg, status, supplier_cost_bdt, shipping_charge_bdt, total_landed_bdt, release_requested_at, release_request_note, released_at").eq("po_id", data.poId).order("carton_number"),
      context.supabase.from("imp_payments").select("id, paid_on, amount_bdt, method, payee_type, notes").eq("po_id", data.poId).order("paid_on", { ascending: false }),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (cartonsRes.error) throw cartonsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;

    return { po, items: itemsRes.data ?? [], cartons: cartonsRes.data ?? [], payments: paymentsRes.data ?? [] };
  });

/* ============= WRITE (release request) ============= */

export const requestCartonRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cartonId: string; note?: string }) =>
    z.object({ cartonId: z.string().uuid(), note: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    // verify carton belongs to agent's PO
    const { data: carton, error: cErr } = await context.supabase
      .from("imp_cartons")
      .select("id, po_id, imp_purchase_orders!inner(cargo_agent_id)")
      .eq("id", data.cartonId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!carton || (carton as any).imp_purchase_orders?.cargo_agent_id !== agent.id) {
      throw new Error("Carton not found");
    }
    const { error } = await context.supabase
      .from("imp_cartons")
      .update({
        release_requested_at: new Date().toISOString(),
        release_requested_by: context.userId,
        release_request_note: data.note ?? null,
      })
      .eq("id", data.cartonId);
    if (error) throw error;
    return { ok: true };
  });