import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOps(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!(roles.has("admin") || roles.has("operations") || roles.has("accountant"))) {
    throw new Error("Forbidden");
  }
}

export const getCostRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => z.object({ brand_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOps(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("marketing_cost_rules")
      .select("*")
      .eq("brand_id", data.brand_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCostRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brand_id: string;
    auto_post_meta_spend?: boolean;
    meta_expense_account_id?: string | null;
    meta_payment_account_id?: string | null;
  }) =>
    z
      .object({
        brand_id: z.string().uuid(),
        auto_post_meta_spend: z.boolean().optional(),
        meta_expense_account_id: z.string().uuid().nullable().optional(),
        meta_payment_account_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOps(context.supabase, context.userId);
    const { brand_id, ...patch } = data;
    // Upsert
    const { data: existing } = await context.supabase
      .from("marketing_cost_rules")
      .select("id")
      .eq("brand_id", brand_id)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("marketing_cost_rules")
        .update(patch)
        .eq("brand_id", brand_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("marketing_cost_rules")
        .insert({ brand_id, ...patch });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const postMetaSpendNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; days?: number; force?: boolean }) =>
    z
      .object({
        brand_id: z.string().uuid(),
        days: z.number().int().min(1).max(60).optional(),
        force: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOps(context.supabase, context.userId);
    const { data: out, error } = await context.supabase.rpc("mkt_post_meta_spend_window", {
      p_brand_id: data.brand_id,
      p_days: data.days ?? 7,
      p_force: data.force ?? true,
    });
    if (error) throw new Error(error.message);
    return out;
  });

export const listSpendPostings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; limit?: number }) =>
    z.object({ brand_id: z.string().uuid(), limit: z.number().int().min(1).max(60).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOps(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("marketing_spend_postings")
      .select("id, ad_account_id, posting_date, amount, currency, txn_id, status, created_at, marketing_ad_accounts:ad_account_id(account_name)")
      .eq("brand_id", data.brand_id)
      .order("posting_date", { ascending: false })
      .limit(data.limit ?? 14);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listExpenseCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => z.object({ brand_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOps(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("erp_expense_categories")
      .select("id, name, kind")
      .eq("brand_id", data.brand_id)
      .eq("kind", "expense")
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listPaymentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => z.object({ brand_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOps(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("erp_accounts")
      .select("id, name, account_type, current_balance")
      .eq("brand_id", data.brand_id)
      .eq("is_active", true)
      .order("account_type")
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });