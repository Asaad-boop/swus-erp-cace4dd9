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

async function assertOps(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!(roles.has("admin") || roles.has("operations"))) {
    throw new Error("Forbidden");
  }
}

export const rebuildProfitWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id?: string; days?: number }) =>
    z.object({ brand_id: z.string().uuid().optional(), days: z.number().int().min(1).max(60).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOps(context.supabase, context.userId);
    const { data: out, error } = await context.supabase.rpc("mkt_rebuild_window", {
      p_brand_id: data.brand_id ?? null,
      p_days: data.days ?? 7,
      p_trigger: "manual",
    });
    if (error) throw new Error(error.message);
    return out;
  });

export const getOverviewKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; from: string; to: string }) =>
    z.object({ brand_id: z.string().uuid(), from: dateStr, to: dateStr }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: out, error } = await context.supabase.rpc("mkt_get_overview_kpis", {
      p_brand_id: data.brand_id,
      p_from: data.from,
      p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return out as Record<string, any>;
  });

export const getCampaignRollup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; from: string; to: string }) =>
    z.object({ brand_id: z.string().uuid(), from: dateStr, to: dateStr }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: out, error } = await context.supabase.rpc("mkt_get_campaign_daily_rollup", {
      p_brand_id: data.brand_id,
      p_from: data.from,
      p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return (out ?? []) as any[];
  });

export const listRebuildJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id?: string; limit?: number }) =>
    z.object({ brand_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(50).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    let q = context.supabase
      .from("marketing_rebuild_jobs")
      .select("id, brand_id, range_from, range_to, trigger, orders_processed, status, error, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (data.brand_id) q = q.eq("brand_id", data.brand_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });