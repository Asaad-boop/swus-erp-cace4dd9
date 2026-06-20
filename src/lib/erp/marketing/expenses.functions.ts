import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORIES = [
  "influencer",
  "content",
  "photoshoot",
  "agency",
  "boost",
  "print_design",
  "event",
  "sms_email",
  "other",
] as const;

async function assertRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

/* ---------------- list ---------------- */

export const listMarketingExpenses = createServerFn({ method: "POST" })
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
      .from("mkt_manual_expenses")
      .select(`
        id, date, amount, currency, vendor, category, note, attachment_url,
        product_id, campaign_id, account_id, transaction_id, created_at,
        products:product_id ( id, name ),
        mkt_campaigns:campaign_id ( id, name ),
        erp_accounts:account_id ( id, name )
      `)
      .eq("brand_id", data.brandId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("date", data.from);
    if (data.to) q = q.lte("date", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ---------------- supporting selects ---------------- */

export const listExpenseFormOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [products, campaigns, accounts] = await Promise.all([
      context.supabase
        .from("products")
        .select("id, name")
        .eq("brand_id", data.brandId)
        .order("name")
        .limit(1000),
      context.supabase
        .from("mkt_campaigns")
        .select("id, name")
        .eq("brand_id", data.brandId)
        .order("name")
        .limit(500),
      context.supabase
        .from("erp_accounts")
        .select("id, name, is_active")
        .eq("brand_id", data.brandId)
        .eq("is_active", true)
        .order("name"),
    ]);
    return {
      products: products.data ?? [],
      campaigns: campaigns.data ?? [],
      accounts: accounts.data ?? [],
    };
  });

/* ---------------- create ---------------- */

const createSchema = z.object({
  brandId: z.string().uuid(),
  date: z.string(),
  amount: z.number().positive(),
  currency: z.string().default("BDT"),
  vendor: z.string().optional().nullable(),
  category: z.enum(CATEGORIES),
  note: z.string().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  campaignId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  attachmentUrl: z.string().url().optional().nullable(),
  postToFinance: z.boolean().default(true),
});

export const createMarketingExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof createSchema>) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const supabase = context.supabase;

    const { data: exp, error: expErr } = await supabase
      .from("mkt_manual_expenses")
      .insert({
        brand_id: data.brandId,
        date: data.date,
        amount: data.amount,
        currency: data.currency,
        vendor: data.vendor || null,
        category: data.category,
        note: data.note || null,
        product_id: data.productId || null,
        campaign_id: data.campaignId || null,
        account_id: data.accountId || null,
        attachment_url: data.attachmentUrl || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (expErr) throw expErr;

    // Auto-post to Finance if account + flag
    if (data.postToFinance && data.accountId) {
      const { data: cat } = await supabase
        .from("erp_expense_categories")
        .select("id")
        .ilike("name", "Marketing")
        .limit(1)
        .maybeSingle();

      const descParts = [
        `Marketing: ${data.category}`,
        data.vendor ? `— ${data.vendor}` : null,
        data.note ? `(${data.note})` : null,
      ].filter(Boolean);

      const { data: txn, error: txnErr } = await supabase
        .from("erp_transactions")
        .insert({
          brand_id: data.brandId,
          txn_type: "expense",
          amount: data.amount,
          account_id: data.accountId,
          category_id: cat?.id ?? null,
          transaction_date: data.date,
          description: descParts.join(" "),
          reference_type: "mkt_manual_expense",
          reference_id: exp.id,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (txnErr) throw txnErr;

      await supabase
        .from("mkt_manual_expenses")
        .update({ transaction_id: txn.id })
        .eq("id", exp.id);
    }

    return { id: exp.id };
  });

/* ---------------- delete ---------------- */

export const deleteMarketingExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const supabase = context.supabase;

    const { data: exp, error: getErr } = await supabase
      .from("mkt_manual_expenses")
      .select("id, transaction_id")
      .eq("id", data.id)
      .single();
    if (getErr) throw getErr;

    if (exp.transaction_id) {
      await supabase.from("erp_transactions").delete().eq("id", exp.transaction_id);
    }
    const { error } = await supabase.from("mkt_manual_expenses").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });