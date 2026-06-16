import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function runStructureSync(supabase: any, accountId: string) {
  const { data: acc, error: accErr } = await supabase
    .from("mkt_ad_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accErr || !acc) throw new Error("Ad account not found");
  const act = actId(acc.external_id);

  return logSync(supabase, {
    brand_id: acc.brand_id,
    account_id: acc.id,
    kind: "structure",
    run: async () => {
      const { listCampaigns, listAdsets, listAds } = await import("./meta.server");
      const [camps, adsets, ads] = await Promise.all([
        listCampaigns(act),
        listAdsets(act),
        listAds(act),
      ]);

      // Upsert campaigns
      if (camps.length) {
        const rows = camps.map((c) => ({
          brand_id: acc.brand_id,
          account_id: acc.id,
          external_id: c.id,
          name: c.name,
          objective: c.objective ?? null,
          status: c.status ?? null,
          effective_status: c.effective_status ?? null,
          daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
          start_time: c.start_time ?? null,
          stop_time: c.stop_time ?? null,
          raw: c as any,
        }));
        const { error } = await supabase
          .from("mkt_campaigns")
          .upsert(rows, { onConflict: "account_id,external_id" });
        if (error) throw error;
      }

      // Map external campaign id -> internal id
      const { data: campRows } = await supabase
        .from("mkt_campaigns")
        .select("id,external_id")
        .eq("account_id", acc.id);
      const campMap = new Map<string, string>(
        (campRows ?? []).map((r: any) => [r.external_id, r.id]),
      );

      if (adsets.length) {
        const rows = adsets
          .filter((a) => campMap.has(a.campaign_id))
          .map((a) => ({
            brand_id: acc.brand_id,
            account_id: acc.id,
            campaign_id: campMap.get(a.campaign_id)!,
            external_id: a.id,
            name: a.name,
            status: a.status ?? null,
            effective_status: a.effective_status ?? null,
            daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
            lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
            targeting_summary: a.targeting ? JSON.stringify(a.targeting).slice(0, 500) : null,
            raw: a as any,
          }));
        if (rows.length) {
          const { error } = await supabase
            .from("mkt_adsets")
            .upsert(rows, { onConflict: "account_id,external_id" });
          if (error) throw error;
        }
      }

      const { data: adsetRows } = await supabase
        .from("mkt_adsets")
        .select("id,external_id")
        .eq("account_id", acc.id);
      const adsetMap = new Map<string, string>(
        (adsetRows ?? []).map((r: any) => [r.external_id, r.id]),
      );

      if (ads.length) {
        const rows = ads
          .filter((a) => campMap.has(a.campaign_id) && adsetMap.has(a.adset_id))
          .map((a) => ({
            brand_id: acc.brand_id,
            account_id: acc.id,
            campaign_id: campMap.get(a.campaign_id)!,
            adset_id: adsetMap.get(a.adset_id)!,
            external_id: a.id,
            name: a.name,
            status: a.status ?? null,
            effective_status: a.effective_status ?? null,
            creative_body: a.creative?.body ?? null,
            creative_thumbnail: a.creative?.thumbnail_url ?? null,
            raw: a as any,
          }));
        if (rows.length) {
          const { error } = await supabase
            .from("mkt_ads")
            .upsert(rows, { onConflict: "account_id,external_id" });
          if (error) throw error;
        }
      }

      await supabase
        .from("mkt_ad_accounts")
        .update({
          last_structure_sync_at: new Date().toISOString(),
          last_error: null,
          status: "active",
        })
        .eq("id", acc.id);

      return {
        rows: camps.length + adsets.length + ads.length,
        meta: { campaigns: camps.length, adsets: adsets.length, ads: ads.length },
      };
    },
  }).catch(async (e) => {
    await supabase
      .from("mkt_ad_accounts")
      .update({ last_error: String(e?.message ?? e), status: "error" })
      .eq("id", acc.id);
    throw e;
  });
}

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

async function runInsightsSync(
  supabase: any,
  accountId: string,
  opts: { since?: string; until?: string; days: number },
) {
  const { data: acc, error: accErr } = await supabase
    .from("mkt_ad_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (accErr || !acc) throw new Error("Ad account not found");
  const act = actId(acc.external_id);

  const until = opts.until ?? isoDate(new Date());
  const since =
    opts.since ??
    isoDate(new Date(Date.now() - (opts.days - 1) * 24 * 60 * 60 * 1000));

  return logSync(supabase, {
    brand_id: acc.brand_id,
    account_id: acc.id,
    kind: "insights",
    run: async () => {
      const { getDailyInsights, extractMetaConversions } = await import("./meta.server");
      const insights = await getDailyInsights(act, since, until);

      // Need ad/adset/campaign internal id maps
      const [{ data: adRows }, { data: adsetRows }, { data: campRows }] = await Promise.all([
        supabase.from("mkt_ads").select("id,external_id").eq("account_id", acc.id),
        supabase.from("mkt_adsets").select("id,external_id").eq("account_id", acc.id),
        supabase.from("mkt_campaigns").select("id,external_id").eq("account_id", acc.id),
      ]);
      const adMap = new Map<string, string>((adRows ?? []).map((r: any) => [r.external_id, r.id]));
      const adsetMap = new Map<string, string>(
        (adsetRows ?? []).map((r: any) => [r.external_id, r.id]),
      );
      const campMap = new Map<string, string>(
        (campRows ?? []).map((r: any) => [r.external_id, r.id]),
      );

      const rows = insights.map((ins) => {
        const conv = extractMetaConversions(ins);
        return {
          brand_id: acc.brand_id,
          account_id: acc.id,
          date: ins.date_start,
          ad_id: ins.ad_id ? adMap.get(ins.ad_id) ?? null : null,
          adset_id: ins.adset_id ? adsetMap.get(ins.adset_id) ?? null : null,
          campaign_id: ins.campaign_id ? campMap.get(ins.campaign_id) ?? null : null,
          spend: Number(ins.spend) || 0,
          impressions: Number(ins.impressions) || 0,
          reach: Number(ins.reach) || 0,
          clicks: Number(ins.clicks) || 0,
          cpm: ins.cpm ? Number(ins.cpm) : null,
          cpc: ins.cpc ? Number(ins.cpc) : null,
          ctr: ins.ctr ? Number(ins.ctr) : null,
          meta_purchases: conv.purchases,
          meta_purchase_value: conv.purchase_value,
          meta_add_to_cart: conv.add_to_cart,
          meta_initiate_checkout: conv.initiate_checkout,
          meta_leads: conv.leads,
          raw: ins as any,
        };
      });

      if (rows.length) {
        // Upsert per (ad_id, date) — unique index expected from migration.
        // Fallback: delete window then insert to avoid conflict issues.
        await supabase
          .from("mkt_insights_daily")
          .delete()
          .eq("account_id", acc.id)
          .gte("date", since)
          .lte("date", until);
        const { error } = await supabase.from("mkt_insights_daily").insert(rows);
        if (error) throw error;
      }

      await supabase
        .from("mkt_ad_accounts")
        .update({
          last_insights_sync_at: new Date().toISOString(),
          last_error: null,
          status: "active",
        })
        .eq("id", acc.id);

      return { rows: rows.length, meta: { since, until } };
    },
  }).catch(async (e) => {
    await supabase
      .from("mkt_ad_accounts")
      .update({ last_error: String(e?.message ?? e), status: "error" })
      .eq("id", acc.id);
    throw e;
  });
}

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

// Internal helpers exposed for the cron route (no auth middleware).
export const __internal = { runStructureSync, runInsightsSync };
