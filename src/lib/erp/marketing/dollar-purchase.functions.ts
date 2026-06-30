import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertFinance(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }, { data: fin }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "finance" }),
  ]);
  if (!admin && !ops && !fin) throw new Error("Not authorized");
}

const purchaseSchema = z.object({
  brandId: z.string().uuid().nullable().optional(),
  adAccountId: z.string().uuid(),
  paidFromAccountId: z.string().uuid(),
  purchaseDate: z.string().min(8),
  usdAmount: z.number().positive(),
  usdRate: z.number().positive(),
  feeBdt: z.number().min(0).default(0),
  paymentMethod: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  supplierName: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  attachmentUrl: z.string().optional().nullable(),
});

export const listDollarPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brandIds?: string[]; adAccountId?: string; paidFrom?: string;
    status?: string; from?: string; to?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("meta_dollar_purchases")
      .select(`
        id, purchase_date, brand_id, ad_account_id, paid_from_account_id,
        usd_amount, usd_rate, fee_bdt, bdt_amount, total_bdt, effective_rate,
        status, payment_method, reference, supplier_name, note, attachment_url,
        confirmed_at, cancelled_at, created_at,
        brands:brand_id ( id, name ),
        mkt_ad_accounts:ad_account_id ( id, name, external_id ),
        erp_accounts:paid_from_account_id ( id, name, account_type )
      `)
      .order("purchase_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    if (data.adAccountId) q = q.eq("ad_account_id", data.adAccountId);
    if (data.paidFrom) q = q.eq("paid_from_account_id", data.paidFrom);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("purchase_date", data.from);
    if (data.to) q = q.lte("purchase_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listDollarPurchaseFormOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[] }) => d)
  .handler(async ({ data, context }) => {
    let accQ = context.supabase
      .from("erp_accounts")
      .select("id, name, account_type, current_balance, brand_id, is_active")
      .eq("is_active", true)
      .order("name");
    // Include shared accounts (brand_id IS NULL) alongside brand-scoped ones
    if (data.brandIds?.length) {
      const ids = data.brandIds.map((b) => `"${b}"`).join(",");
      accQ = accQ.or(`brand_id.in.(${ids}),brand_id.is.null`);
    }
    let adQ = context.supabase
      .from("mkt_ad_accounts")
      .select("id, name, external_id, brand_id, currency, usd_to_bdt_rate")
      .order("name");
    if (data.brandIds?.length) {
      const ids = data.brandIds.map((b) => `"${b}"`).join(",");
      adQ = adQ.or(`brand_id.in.(${ids}),brand_id.is.null`);
    }
    const [{ data: accounts }, { data: adAccounts }, { data: brands }, { data: fx }] = await Promise.all([
      accQ,
      adQ,
      context.supabase.from("brands").select("id, name").eq("is_active", true).order("name"),
      context.supabase
        .from("erp_fx_rates")
        .select("rate, rate_date")
        .eq("from_ccy", "USD")
        .eq("to_ccy", "BDT")
        .order("rate_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      accounts: accounts ?? [],
      adAccounts: adAccounts ?? [],
      brands: brands ?? [],
      latestUsdRate: fx?.rate ?? null,
    };
  });

export const createDollarPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof purchaseSchema>) => purchaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("meta_dollar_purchases")
      .insert({
        brand_id: data.brandId ?? null,
        ad_account_id: data.adAccountId,
        paid_from_account_id: data.paidFromAccountId,
        purchase_date: data.purchaseDate,
        usd_amount: data.usdAmount,
        usd_rate: data.usdRate,
        fee_bdt: data.feeBdt ?? 0,
        payment_method: data.paymentMethod ?? null,
        reference: data.reference ?? null,
        supplier_name: data.supplierName ?? null,
        note: data.note ?? null,
        attachment_url: data.attachmentUrl ?? null,
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateDollarPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof purchaseSchema> & { id: string }) =>
    z.object({ id: z.string().uuid() }).and(purchaseSchema).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { data: existing, error: eErr } = await context.supabase
      .from("meta_dollar_purchases")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!existing) throw new Error("Purchase not found");
    if (existing.status !== "draft") {
      throw new Error("Confirmed/cancelled entries cannot be edited — create an adjustment instead.");
    }
    const { error } = await context.supabase
      .from("meta_dollar_purchases")
      .update({
        brand_id: data.brandId ?? null,
        ad_account_id: data.adAccountId,
        paid_from_account_id: data.paidFromAccountId,
        purchase_date: data.purchaseDate,
        usd_amount: data.usdAmount,
        usd_rate: data.usdRate,
        fee_bdt: data.feeBdt ?? 0,
        payment_method: data.paymentMethod ?? null,
        reference: data.reference ?? null,
        supplier_name: data.supplierName ?? null,
        note: data.note ?? null,
        attachment_url: data.attachmentUrl ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const confirmDollarPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { data: res, error } = await context.supabase.rpc(
      "confirm_meta_dollar_purchase",
      { _purchase_id: data.id },
    );
    if (error) throw error;
    return res;
  });

export const cancelDollarPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFinance(context.supabase, context.userId);
    const { data: res, error } = await context.supabase.rpc(
      "cancel_meta_dollar_purchase",
      { _purchase_id: data.id, _reason: data.reason ?? undefined },
    );
    if (error) throw error;
    return res;
  });

export const listAdAccountWallets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandIds?: string[] }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("v_meta_ad_wallet_summary")
      .select("*")
      .order("ad_account_name");
    if (data.brandIds?.length) q = q.in("brand_id", data.brandIds);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getAdAccountWalletDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { adAccountId: string }) =>
    z.object({ adAccountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [summary, ledger, lots, purchases] = await Promise.all([
      context.supabase
        .from("v_meta_ad_wallet_summary")
        .select("*")
        .eq("ad_account_id", data.adAccountId)
        .maybeSingle(),
      context.supabase
        .from("meta_ad_wallet_ledger")
        .select("*")
        .eq("ad_account_id", data.adAccountId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase
        .from("meta_fifo_lots")
        .select("id, lot_date, usd_total, usd_remaining, effective_rate, is_active, purchase_id")
        .eq("ad_account_id", data.adAccountId)
        .order("lot_date", { ascending: true }),
      context.supabase
        .from("meta_dollar_purchases")
        .select("id, purchase_date, usd_amount, usd_rate, total_bdt, effective_rate, status")
        .eq("ad_account_id", data.adAccountId)
        .order("purchase_date", { ascending: false })
        .limit(50),
    ]);
    return {
      summary: summary.data ?? null,
      ledger: ledger.data ?? [],
      lots: lots.data ?? [],
      purchases: purchases.data ?? [],
    };
  });