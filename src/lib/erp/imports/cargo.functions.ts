import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============ READ ============ */

export const listCargoAgentsWithBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) =>
    z.object({ brandIds: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: agents, error: aErr } = await context.supabase
      .from("imp_cargo_agents")
      .select("id, brand_id, name, contact_person, phone, address, notes, is_active, created_at, brand:brand_id(id,name,slug)")
      .in("brand_id", data.brandIds)
      .order("name");
    if (aErr) throw aErr;

    const { data: bal, error: bErr } = await context.supabase
      .from("imp_cargo_balances")
      .select("*")
      .in("brand_id", data.brandIds);
    if (bErr) throw bErr;

    const byAgent = new Map<string, any>();
    (bal ?? []).forEach((b: any) => byAgent.set(b.cargo_agent_id, b));
    return (agents ?? []).map((a: any) => ({
      ...a,
      balance: byAgent.get(a.id) ?? { current_balance: 0, total_advance: 0, total_deducted: 0, entry_count: 0 },
    }));
  });

export const getCargoLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; from?: string; to?: string }) =>
    z.object({ agentId: z.string().uuid(), from: z.string().optional(), to: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_cargo_ledger")
      .select("*, account:payment_account_id(id,name,wallet_type), creator:created_by(id)")
      .eq("cargo_agent_id", data.agentId)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (data.from) q = q.gte("entry_date", data.from);
    if (data.to) q = q.lte("entry_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    let running = 0;
    const enriched = (rows ?? []).map((r: any) => {
      running += Number(r.credit_bdt || 0) - Number(r.debit_bdt || 0);
      return { ...r, running_balance: running };
    });
    return enriched.reverse(); // newest first
  });

export const listCargoBills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[]; agentId?: string }) =>
    z.object({ brandIds: z.array(z.string().uuid()).min(1), agentId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("imp_cargo_bills")
      .select("*, agent:cargo_agent_id(id,name), account:payment_account_id(id,name), po:po_id(id,po_number)")
      .in("brand_id", data.brandIds)
      .order("bill_date", { ascending: false })
      .limit(500);
    if (data.agentId) q = q.eq("cargo_agent_id", data.agentId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getCargoDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds: string[] }) =>
    z.object({ brandIds: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("imp_cargo_balances")
      .select("cargo_agent_id, current_balance, agent:cargo_agent_id(id,name,brand_id)")
      .in("brand_id", data.brandIds);
    if (error) throw error;
    let advance = 0, payable = 0;
    (rows ?? []).forEach((r: any) => {
      const b = Number(r.current_balance || 0);
      if (b > 0) advance += b;
      else if (b < 0) payable += -b;
    });
    const top = [...(rows ?? [])]
      .sort((a: any, b: any) => Math.abs(Number(b.current_balance)) - Math.abs(Number(a.current_balance)))
      .slice(0, 5);
    return { total_advance: advance, total_payable: payable, net: advance - payable, top };
  });

/* ============ WRITE (RPC wrappers) ============ */

export const cargoAdvanceDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brandId: z.string().uuid(),
      cargoAgentId: z.string().uuid(),
      paymentAccountId: z.string().uuid(),
      amount: z.number().positive(),
      paymentDate: z.string().optional(),
      reference: z.string().optional(),
      note: z.string().optional(),
      attachmentUrl: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("cargo_advance_deposit", {
      p_brand_id: data.brandId,
      p_cargo_agent_id: data.cargoAgentId,
      p_payment_account_id: data.paymentAccountId,
      p_amount: data.amount,
      p_payment_date: data.paymentDate ?? null,
      p_reference: data.reference ?? null,
      p_note: data.note ?? null,
      p_attachment_url: data.attachmentUrl ?? null,
    });
    if (error) throw error;
    return res;
  });

export const createCargoBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brandId: z.string().uuid(),
      cargoAgentId: z.string().uuid(),
      billNumber: z.string().optional(),
      billDate: z.string().optional(),
      shipmentRef: z.string().optional(),
      poId: z.string().uuid().nullable().optional(),
      weightKg: z.number().nonnegative().optional(),
      shippingCharge: z.number().nonnegative().default(0),
      customsCharge: z.number().nonnegative().default(0),
      serviceCharge: z.number().nonnegative().default(0),
      localDeliveryCharge: z.number().nonnegative().default(0),
      otherCharge: z.number().nonnegative().default(0),
      paymentSource: z.enum(["cargo_balance", "account", "partial", "unpaid"]),
      amountFromBalance: z.number().nonnegative().default(0),
      amountFromAccount: z.number().nonnegative().default(0),
      paymentAccountId: z.string().uuid().nullable().optional(),
      note: z.string().optional(),
      attachmentUrl: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("cargo_bill_create", {
      p_brand_id: data.brandId,
      p_cargo_agent_id: data.cargoAgentId,
      p_bill_number: data.billNumber ?? null,
      p_bill_date: data.billDate ?? null,
      p_shipment_ref: data.shipmentRef ?? null,
      p_po_id: data.poId ?? null,
      p_weight_kg: data.weightKg ?? 0,
      p_shipping_charge: data.shippingCharge,
      p_customs_charge: data.customsCharge,
      p_service_charge: data.serviceCharge,
      p_local_delivery_charge: data.localDeliveryCharge,
      p_other_charge: data.otherCharge,
      p_payment_source: data.paymentSource,
      p_amount_from_balance: data.amountFromBalance,
      p_amount_from_account: data.amountFromAccount,
      p_payment_account_id: data.paymentAccountId ?? null,
      p_note: data.note ?? null,
      p_attachment_url: data.attachmentUrl ?? null,
    });
    if (error) throw error;
    return res;
  });

export const cargoPoPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brandId: z.string().uuid(),
      poId: z.string().uuid(),
      cargoAgentId: z.string().uuid(),
      amountFromBalance: z.number().nonnegative().default(0),
      amountFromAccount: z.number().nonnegative().default(0),
      paymentAccountId: z.string().uuid().nullable().optional(),
      paymentDate: z.string().optional(),
      reference: z.string().optional(),
      note: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("cargo_po_payment", {
      p_brand_id: data.brandId,
      p_po_id: data.poId,
      p_cargo_agent_id: data.cargoAgentId,
      p_amount_from_balance: data.amountFromBalance,
      p_amount_from_account: data.amountFromAccount,
      p_payment_account_id: data.paymentAccountId ?? null,
      p_payment_date: data.paymentDate ?? null,
      p_reference: data.reference ?? null,
      p_note: data.note ?? null,
    });
    if (error) throw error;
    return res;
  });

export const cargoManualAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      brandId: z.string().uuid(),
      cargoAgentId: z.string().uuid(),
      signedAmount: z.number(),
      note: z.string().optional(),
      attachmentUrl: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("cargo_manual_adjustment", {
      p_brand_id: data.brandId,
      p_cargo_agent_id: data.cargoAgentId,
      p_signed_amount: data.signedAmount,
      p_note: data.note ?? null,
      p_attachment_url: data.attachmentUrl ?? null,
    });
    if (error) throw error;
    return res;
  });

export const listBrandAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("erp_accounts")
      .select("id, name, wallet_type, current_balance, is_active")
      .eq("brand_id", data.brandId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return rows ?? [];
  });