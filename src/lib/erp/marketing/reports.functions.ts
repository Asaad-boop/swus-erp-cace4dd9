import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!(roles.has("admin") || roles.has("operations") || roles.has("accountant"))) {
    throw new Error("Forbidden");
  }
}

const rangeSchema = z.object({ brand_id: z.string().uuid(), from: dateStr, to: dateStr });

export const listCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; from: string; to: string }) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("mkt_list_campaigns", {
      p_brand_id: data.brand_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const listAdsets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; campaign_id: string; from: string; to: string }) =>
    rangeSchema.extend({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("mkt_list_adsets", {
      p_brand_id: data.brand_id, p_campaign_id: data.campaign_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const listAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; adset_id: string; from: string; to: string }) =>
    rangeSchema.extend({ adset_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("mkt_list_ads", {
      p_brand_id: data.brand_id, p_adset_id: data.adset_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const getCampaignSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; campaign_id: string; from: string; to: string }) =>
    rangeSchema.extend({ campaign_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: out, error } = await context.supabase.rpc("mkt_campaign_summary", {
      p_brand_id: data.brand_id, p_campaign_id: data.campaign_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return out as Record<string, any>;
  });

export const getAdsetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { adset_id: string }) => z.object({ adset_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("marketing_adsets")
      .select("id, brand_id, campaign_id, name, external_adset_id, status, effective_status, daily_budget, lifetime_budget, optimization_goal")
      .eq("id", data.adset_id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const explorerAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; from: string; to: string; source?: string; campaign_id?: string; limit?: number }) =>
    rangeSchema.extend({
      source: z.string().optional(),
      campaign_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("mkt_attribution_explorer", {
      p_brand_id: data.brand_id, p_from: data.from, p_to: data.to,
      p_source: (data.source ?? null) as any,
      p_campaign_id: (data.campaign_id ?? null) as any,
      p_limit: data.limit ?? 200,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const productCampaignReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; from: string; to: string }) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("mkt_product_campaign_report", {
      p_brand_id: data.brand_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const courierCampaignReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; from: string; to: string }) => rangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("mkt_courier_campaign_report", {
      p_brand_id: data.brand_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });