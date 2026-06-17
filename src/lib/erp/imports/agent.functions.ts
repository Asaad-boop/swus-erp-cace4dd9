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
        shipped_at, total_weight_kg,
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
      context.supabase.from("imp_payments").select("id, payment_date, amount_bdt, payment_type, reference, notes, carton_id, agent_confirmed_at, agent_proof_url, agent_proof_note").eq("po_id", data.poId).order("payment_date", { ascending: false }),
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

/** Cargo agent: mark PO as arrived in BD with shipping date and total weight */
export const markPoArrivedBd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poId: string; shipped_at: string; total_weight_kg: number; per_kg_rate_bdt: number }) =>
    z.object({
      poId: z.string().uuid(),
      shipped_at: z.string().min(1),
      total_weight_kg: z.number().positive().max(100000),
      per_kg_rate_bdt: z.number().positive().max(100000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    const { data: po, error: pErr } = await context.supabase
      .from("imp_purchase_orders")
      .select("id, status, cargo_agent_id, product_subtotal_bdt, local_courier_total_bdt, paid_bdt")
      .eq("id", data.poId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!po || (po as any).cargo_agent_id !== agent.id) throw new Error("PO not found");
    const allowedFrom = ["ordered", "at_china_warehouse", "in_transit"];
    if (!allowedFrom.includes((po as any).status)) {
      throw new Error(`Ei status (${(po as any).status}) theke arrived_bd kora jabe na`);
    }

    const shippingTotal = +(data.total_weight_kg * data.per_kg_rate_bdt).toFixed(2);

    // Fetch cartons for split
    const { data: cartons, error: cErr } = await context.supabase
      .from("imp_cartons")
      .select("id, weight_kg, expected_quantity, supplier_cost_bdt, local_courier_bdt")
      .eq("po_id", data.poId);
    if (cErr) throw cErr;

    const list = cartons ?? [];
    if (list.length > 0) {
      const totalWeight = list.reduce((s: number, c: any) => s + Number(c.weight_kg ?? 0), 0);
      const totalQty = list.reduce((s: number, c: any) => s + Number(c.expected_quantity ?? 0), 0);
      const mode: "weight" | "qty" | "equal" =
        totalWeight > 0 ? "weight" : totalQty > 0 ? "qty" : "equal";

      let allocated = 0;
      const updates = list.map((c: any, idx: number) => {
        let share = 0;
        if (mode === "weight") share = Number(c.weight_kg ?? 0) / totalWeight;
        else if (mode === "qty") share = Number(c.expected_quantity ?? 0) / totalQty;
        else share = 1 / list.length;
        let shipping = +(shippingTotal * share).toFixed(2);
        // last carton absorbs rounding
        if (idx === list.length - 1) shipping = +(shippingTotal - allocated).toFixed(2);
        allocated += shipping;
        const supplier = Number(c.supplier_cost_bdt ?? 0);
        const local = Number(c.local_courier_bdt ?? 0);
        const landed = +(supplier + shipping + local).toFixed(2);
        return { id: c.id, shipping_charge_bdt: shipping, total_landed_bdt: landed };
      });

      for (const u of updates) {
        const { error: uErr } = await context.supabase
          .from("imp_cartons")
          .update({ shipping_charge_bdt: u.shipping_charge_bdt, total_landed_bdt: u.total_landed_bdt })
          .eq("id", u.id);
        if (uErr) throw uErr;
      }
    }

    const grandTotal = +(Number((po as any).product_subtotal_bdt ?? 0) + shippingTotal + Number((po as any).local_courier_total_bdt ?? 0)).toFixed(2);
    const due = +(grandTotal - Number((po as any).paid_bdt ?? 0)).toFixed(2);

    const { error } = await context.supabase
      .from("imp_purchase_orders")
      .update({
        status: "arrived_bd" as any,
        shipped_at: data.shipped_at,
        total_weight_kg: data.total_weight_kg,
        shipping_rate_per_kg_bdt: data.per_kg_rate_bdt,
        shipping_total_bdt: shippingTotal,
        grand_total_bdt: grandTotal,
        due_bdt: due,
      })
      .eq("id", data.poId);
    if (error) throw error;
    return { ok: true, shipping_total_bdt: shippingTotal };
  });

/** Cargo agent: confirm a payment with proof; releases linked cartons */
export const confirmAgentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string; proof_url?: string; note?: string }) =>
    z.object({
      paymentId: z.string().uuid(),
      proof_url: z.string().max(1000).optional(),
      note: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    const { data: pay, error: pErr } = await context.supabase
      .from("imp_payments")
      .select("id, po_id, carton_id, imp_purchase_orders!inner(cargo_agent_id)")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!pay || (pay as any).imp_purchase_orders?.cargo_agent_id !== agent.id) {
      throw new Error("Payment not found");
    }
    const nowIso = new Date().toISOString();
    const { error: upErr } = await context.supabase
      .from("imp_payments")
      .update({
        agent_confirmed_at: nowIso,
        agent_confirmed_by: context.userId,
        agent_proof_url: data.proof_url ?? null,
        agent_proof_note: data.note ?? null,
      })
      .eq("id", data.paymentId);
    if (upErr) throw upErr;

    // Release linked cartons
    if ((pay as any).carton_id) {
      await context.supabase
        .from("imp_cartons")
        .update({ released_at: nowIso, status: "released" as any })
        .eq("id", (pay as any).carton_id);
    } else {
      // Release all release-requested but not-yet-released cartons of this PO
      await context.supabase
        .from("imp_cartons")
        .update({ released_at: nowIso, status: "released" as any })
        .eq("po_id", (pay as any).po_id)
        .not("release_requested_at", "is", null)
        .is("released_at", null);
    }
    return { ok: true };
  });

/* ============= Daily rate (cargo agent) ============= */

export const submitTodayRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    shipping_rate_per_kg_bdt: number;
    fx_rate: number;
    currency?: string;
    note?: string;
    rate_date?: string;
  }) =>
    z.object({
      shipping_rate_per_kg_bdt: z.number().positive(),
      fx_rate: z.number().positive(),
      currency: z.string().min(1).max(8).optional(),
      note: z.string().max(500).optional(),
      rate_date: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    const today = data.rate_date ?? new Date().toISOString().slice(0, 10);
    const payload = {
      agent_id: agent.id,
      rate_date: today,
      shipping_rate_per_kg_bdt: data.shipping_rate_per_kg_bdt,
      currency: data.currency ?? agent.default_currency ?? "CNY",
      fx_rate: data.fx_rate,
      note: data.note ?? null,
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("imp_cargo_agent_rates")
      .upsert(payload, { onConflict: "agent_id,rate_date" })
      .select("id, rate_date, shipping_rate_per_kg_bdt, currency, fx_rate, note, updated_at")
      .single();
    if (error) throw error;
    return row;
  });

export const listMyRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(365).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("imp_cargo_agent_rates")
      .select("id, rate_date, shipping_rate_per_kg_bdt, currency, fx_rate, note, updated_at")
      .eq("agent_id", agent.id)
      .order("rate_date", { ascending: false })
      .limit(data.limit ?? 60);
    if (error) throw error;
    return rows ?? [];
  });

/* ============= Cargo Agent Balance / Wallet ============= */

async function assertFinanceStaff(supabase: any, userId: string) {
  const roles = ["admin", "operations", "accountant"] as const;
  const results = await Promise.all(
    roles.map((r) => supabase.rpc("has_role", { _user_id: userId, _role: r })),
  );
  if (!results.some((r: any) => r.data === true)) throw new Error("Not authorized");
}

/** Cargo agent: own balance + ledger */
export const getMyAgentBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const agent = await resolveAgentId(context.supabase, context.userId);
    const { data: bal, error: bErr } = await context.supabase.rpc("get_cargo_agent_balance", { _agent_id: agent.id });
    if (bErr) throw bErr;
    const { data: rows, error } = await context.supabase
      .from("imp_cargo_agent_ledger")
      .select("id, entry_date, direction, entry_type, amount_bdt, reference, note, po_id, created_at")
      .eq("agent_id", agent.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { agent_id: agent.id, balance_bdt: Number(bal ?? 0), entries: rows ?? [] };
  });

/** Admin/finance: list any agent's ledger + balance */
export const getAgentLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; limit?: number }) =>
    z.object({
      agentId: z.string().uuid(),
      limit: z.number().int().min(1).max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceStaff(context.supabase, context.userId);
    const { data: bal, error: bErr } = await context.supabase.rpc("get_cargo_agent_balance", { _agent_id: data.agentId });
    if (bErr) throw bErr;
    const { data: rows, error } = await context.supabase
      .from("imp_cargo_agent_ledger")
      .select("id, entry_date, direction, entry_type, amount_bdt, reference, note, po_id, created_at, created_by")
      .eq("agent_id", data.agentId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (error) throw error;
    return { agent_id: data.agentId, balance_bdt: Number(bal ?? 0), entries: rows ?? [] };
  });

/** Admin/finance: add a ledger entry (deposit / payment / adjustment / refund) */
export const addAgentLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    agentId: string;
    direction: "credit" | "debit";
    entry_type?: "deposit" | "payment" | "adjustment" | "refund" | "opening_balance";
    amount_bdt: number;
    entry_date?: string;
    reference?: string;
    note?: string;
    po_id?: string;
  }) =>
    z.object({
      agentId: z.string().uuid(),
      direction: z.enum(["credit", "debit"]),
      entry_type: z.enum(["deposit", "payment", "adjustment", "refund", "opening_balance"]).optional(),
      amount_bdt: z.number().positive(),
      entry_date: z.string().optional(),
      reference: z.string().max(200).optional(),
      note: z.string().max(1000).optional(),
      po_id: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinanceStaff(context.supabase, context.userId);
    // Look up agent's brand_id for context
    const { data: agent, error: aErr } = await context.supabase
      .from("imp_cargo_agents")
      .select("id, brand_id")
      .eq("id", data.agentId)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!agent) throw new Error("Agent not found");

    const defaultType = data.direction === "credit" ? "deposit" : "payment";
    const { data: row, error } = await context.supabase
      .from("imp_cargo_agent_ledger")
      .insert({
        agent_id: data.agentId,
        brand_id: agent.brand_id,
        direction: data.direction,
        entry_type: data.entry_type ?? defaultType,
        amount_bdt: data.amount_bdt,
        entry_date: data.entry_date ?? new Date().toISOString().slice(0, 10),
        reference: data.reference ?? null,
        note: data.note ?? null,
        po_id: data.po_id ?? null,
        created_by: context.userId,
      })
      .select("id, entry_date, direction, entry_type, amount_bdt, reference, note, po_id, created_at")
      .single();
    if (error) throw error;
    return row;
  });

/** Admin/finance: delete a ledger entry */
export const deleteAgentLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinanceStaff(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("imp_cargo_agent_ledger")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });