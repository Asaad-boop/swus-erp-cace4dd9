import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runStructureSync, runInsightsSync } from "./sync.server";

/** Admin or operations only — sync writes ad data. */
async function assertMktRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

function actId(externalId: string): string {
  return externalId.startsWith("act_") ? externalId : `act_${externalId}`;
}

async function logSync(
  supabase: any,
  args: {
    brand_id: string | null;
    account_id: string | null;
    kind: "structure" | "insights" | "attribution" | "finance_post";
    run: () => Promise<{ rows: number; meta?: any }>;
  },
) {
  const started_at = new Date().toISOString();
  const { data: logRow } = await supabase
    .from("mkt_sync_log")
    .insert({
      brand_id: args.brand_id,
      account_id: args.account_id,
      kind: args.kind,
      status: "running",
      started_at,
    })
    .select("id")
    .single();
  try {
    const { rows, meta } = await args.run();
    await supabase
      .from("mkt_sync_log")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_processed: rows,
        meta: meta ?? null,
      })
      .eq("id", logRow!.id);
    return { ok: true, rows };
  } catch (e: any) {
    await supabase
      .from("mkt_sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: String(e?.message ?? e),
      })
      .eq("id", logRow!.id);
    throw e;
  }
}

// ---- 1. List Meta ad accounts available under the token ----

export const listAvailableMetaAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { listMyAdAccounts } = await import("./meta.server");
    const accounts = await listMyAdAccounts();
    // Mark which ones already connected for this brand
    const { data: existing } = await context.supabase
      .from("mkt_ad_accounts")
      .select("external_id")
      .eq("brand_id", data.brandId);
    const taken = new Set((existing ?? []).map((r: any) => r.external_id));
    return accounts.map((a) => ({
      external_id: a.id,
      account_id: a.account_id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      business: a.business?.name ?? null,
      business_id: a.business?.id ?? null,
      account_status: a.account_status ?? null,
      connected: taken.has(a.id),
    }));
  });

// ---- 2. List saved (connected) ad accounts for brand ----

export const listConnectedAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_ad_accounts")
      .select("*")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

// ---- 3. Connect a Meta ad account to a brand ----

export const connectAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brandId: string;
    externalId: string;
    name: string;
    currency?: string | null;
    timezone?: string | null;
    businessId?: string | null;
  }) =>
    z
      .object({
        brandId: z.string().uuid(),
        externalId: z.string().min(1),
        name: z.string().min(1),
        currency: z.string().nullable().optional(),
        timezone: z.string().nullable().optional(),
        businessId: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase.from("mkt_ad_accounts").upsert(
      {
        brand_id: data.brandId,
        external_id: data.externalId,
        name: data.name,
        currency: data.currency ?? null,
        timezone: data.timezone ?? null,
        business_id: data.businessId ?? null,
        status: "active",
        last_error: null,
      },
      { onConflict: "brand_id,external_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

// ---- 4. Disconnect ----

export const disconnectAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .update({ status: "disconnected" })
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

// ---- 5. Sync structure (campaigns / adsets / ads) ----

export const syncAdAccountStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    return runStructureSync(context.supabase, data.accountId);
  });

// ---- 6. Sync insights (daily metrics per ad) ----

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const syncAdAccountInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string; since?: string; until?: string; days?: number }) =>
    z
      .object({
        accountId: z.string().uuid(),
        since: z.string().optional(),
        until: z.string().optional(),
        days: z.number().int().min(1).max(90).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    return runInsightsSync(context.supabase, data.accountId, {
      since: data.since,
      until: data.until,
      days: data.days ?? 3,
    });
  });

// ---- 7. Read sync log ----

export const listSyncLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; limit?: number }) =>
    z.object({ brandId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_sync_log")
      .select("*, mkt_ad_accounts(name)")
      .eq("brand_id", data.brandId)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw error;
    return rows ?? [];
  });