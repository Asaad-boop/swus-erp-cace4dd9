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

// ---- List saved ad accounts for brand (token NOT returned) ----

export const listConnectedAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_ad_accounts")
      .select(
        "id,brand_id,external_id,name,currency,timezone,status,business_id,app_id,usd_to_bdt_rate,last_structure_sync_at,last_insights_sync_at,last_error,created_at,updated_at",
      )
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Surface whether credentials are present without leaking values.
    const ids = (rows ?? []).map((r: any) => r.id);
    let credMap = new Map<string, { hasToken: boolean; hasSecret: boolean }>();
    if (ids.length) {
      const { data: creds } = await context.supabase
        .from("mkt_ad_accounts")
        .select("id,access_token,app_secret")
        .in("id", ids);
      credMap = new Map(
        (creds ?? []).map((r: any) => [
          r.id,
          { hasToken: !!r.access_token, hasSecret: !!r.app_secret },
        ]),
      );
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      has_access_token: credMap.get(r.id)?.hasToken ?? false,
      has_app_secret: credMap.get(r.id)?.hasSecret ?? false,
    }));
  });

// ---- Create / Update / Delete / Toggle ad account (per-account credentials) ----

const accountInput = z.object({
  name: z.string().min(1),
  appId: z.string().trim().min(1).optional().nullable(),
  appSecret: z.string().trim().min(1).optional().nullable(),
  accessToken: z.string().trim().min(20),
  adAccountId: z
    .string()
    .trim()
    .min(1)
    .regex(/^\d+$/, "Ad Account ID numeric hote hobe (without act_ prefix)"),
  usdToBdtRate: z.coerce.number().positive().default(110),
  active: z.boolean().default(true),
});

export const createAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    accountInput.extend({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase.from("mkt_ad_accounts").upsert(
      {
        brand_id: data.brandId,
        external_id: data.adAccountId,
        name: data.name,
        app_id: data.appId ?? null,
        app_secret: data.appSecret ?? null,
        access_token: data.accessToken,
        usd_to_bdt_rate: data.usdToBdtRate,
        status: data.active ? "active" : "paused",
        last_error: null,
      },
      { onConflict: "brand_id,external_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const updateAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        accountId: z.string().uuid(),
        name: z.string().min(1),
        appId: z.string().trim().optional().nullable(),
        appSecret: z.string().trim().optional().nullable(),
        // Allow leaving token blank to keep existing.
        accessToken: z.string().trim().optional().nullable(),
        adAccountId: z.string().trim().regex(/^\d+$/),
        usdToBdtRate: z.coerce.number().positive(),
        active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const patch: any = {
      name: data.name,
      external_id: data.adAccountId,
      app_id: data.appId ?? null,
      usd_to_bdt_rate: data.usdToBdtRate,
      status: data.active ? "active" : "paused",
    };
    if (data.appSecret && data.appSecret.trim().length > 0) {
      patch.app_secret = data.appSecret.trim();
    }
    if (data.accessToken && data.accessToken.trim().length > 20) {
      patch.access_token = data.accessToken.trim();
      patch.last_error = null;
    }
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .update(patch)
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

export const toggleAdAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string; active: boolean }) =>
    z.object({ accountId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_ad_accounts")
      .update({ status: data.active ? "active" : "paused" })
      .eq("id", data.accountId);
    if (error) throw error;
    return { ok: true };
  });

/** Test connection — verifies token against Meta Graph API. */
export const testAdAccountConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        // Either pass live form values, OR an accountId to use stored creds.
        accountId: z.string().uuid().optional(),
        accessToken: z.string().trim().optional(),
        adAccountId: z
          .string()
          .trim()
          .regex(/^\d+$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    let token = data.accessToken ?? "";
    let actId = data.adAccountId ?? "";
    if ((!token || !actId) && data.accountId) {
      const { data: acc } = await context.supabase
        .from("mkt_ad_accounts")
        .select("access_token,external_id")
        .eq("id", data.accountId)
        .single();
      if (!acc) throw new Error("Account not found");
      token = token || acc.access_token || "";
      actId = actId || acc.external_id;
    }
    if (!token) throw new Error("Access token nei");
    if (!actId) throw new Error("Ad Account ID nei");
    const { verifyAdAccount } = await import("./meta.server");
    try {
      const info = await verifyAdAccount(actId, token);
      if (data.accountId) {
        await context.supabase
          .from("mkt_ad_accounts")
          .update({
            currency: info.currency ?? null,
            timezone: info.timezone_name ?? null,
            business_id: info.business?.id ?? null,
            last_error: null,
          })
          .eq("id", data.accountId);
      }
      return {
        ok: true as const,
        info: {
          name: info.name,
          currency: info.currency,
          timezone: info.timezone_name,
          business: info.business?.name ?? null,
          account_status: info.account_status,
        },
      };
    } catch (e: any) {
      if (data.accountId) {
        await context.supabase
          .from("mkt_ad_accounts")
          .update({ last_error: String(e?.message ?? e), status: "error" })
          .eq("id", data.accountId);
      }
      throw new Error(e?.message ?? "Connection failed");
    }
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
      days: data.days ?? 90,
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