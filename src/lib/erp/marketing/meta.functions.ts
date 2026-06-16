import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD expected");

declare global {
  var __LOVABLE_RUNTIME_ENV__: Record<string, string> | undefined;
}

function getMetaToken(savedToken?: string | null) {
  return (
    savedToken ||
    process.env.META_SYSTEM_USER_TOKEN ||
    globalThis.__LOVABLE_RUNTIME_ENV__?.META_SYSTEM_USER_TOKEN ||
    null
  );
}

function normalizeMetaAdAccountId(id: string) {
  return id.startsWith("act_") ? id : `act_${id.replace(/\D/g, "")}`;
}

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!(roles.has("admin") || roles.has("operations"))) {
    throw new Error("Forbidden: admin or operations role required");
  }
}

// ----- List Meta ad accounts available for a raw token (Connect Flow) -----
export const metaListMyAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { metaListAdAccountsForToken, metaMe } = await import("./meta.server");
    const [me, accounts] = await Promise.all([
      metaMe(data.token).catch(() => null),
      metaListAdAccountsForToken(data.token),
    ]);
    return { me, accounts };
  });

// ----- Save / connect an ad account with a token -----
export const metaConnectAdAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      brand_id: string;
      external_account_id: string;
      account_name?: string;
      currency?: string;
      timezone_name?: string;
      token: string;
      token_expires_at?: string | null;
    }) =>
    z
      .object({
        brand_id: z.string().uuid(),
        external_account_id: z.string().min(3),
        account_name: z.string().optional(),
        currency: z.string().optional(),
        timezone_name: z.string().optional(),
        token: z.string().min(20),
        token_expires_at: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { metaMe } = await import("./meta.server");
    // Validate token works
    await metaMe(data.token);

    const { data: platform, error: pErr } = await context.supabase
      .from("marketing_platforms")
      .select("id")
      .eq("code", "meta")
      .single();
    if (pErr || !platform) throw new Error("Meta platform row not found");

    const ext = normalizeMetaAdAccountId(data.external_account_id);
    const numericExt = ext.replace(/^act_/, "");

    const { data: existing } = await context.supabase
      .from("marketing_ad_accounts")
      .select("id")
      .eq("brand_id", data.brand_id)
      .eq("platform_id", platform.id)
      .in("external_account_id", [ext, numericExt])
      .maybeSingle();

    if (existing?.id) {
      const { data: row, error } = await context.supabase
        .from("marketing_ad_accounts")
        .update({
          external_account_id: ext,
          account_name: data.account_name ?? null,
          currency: data.currency ?? "BDT",
          timezone_name: data.timezone_name ?? null,
          access_token_secret_ref: data.token,
          token_expires_at: data.token_expires_at ?? null,
          is_active: true,
          last_sync_error: null,
        })
        .eq("id", existing.id)
        .select("id, external_account_id, account_name")
        .single();
      if (error) throw error;
      return row;
    }

    const { data: row, error } = await context.supabase
      .from("marketing_ad_accounts")
      .upsert(
        {
          brand_id: data.brand_id,
          platform_id: platform.id,
          external_account_id: ext,
          account_name: data.account_name ?? null,
          currency: data.currency ?? "BDT",
          timezone_name: data.timezone_name ?? null,
          access_token_secret_ref: data.token,
          token_expires_at: data.token_expires_at ?? null,
          is_active: true,
          created_by: context.userId,
          last_sync_error: null,
        },
        { onConflict: "brand_id,platform_id,external_account_id" },
      )
      .select("id, external_account_id, account_name")
      .single();
    if (error) throw error;
    return row;
  });

export const metaTestConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ad_account_id: string }) => z.object({ ad_account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: acc, error } = await context.supabase
      .from("marketing_ad_accounts")
      .select("id, external_account_id, access_token_secret_ref")
      .eq("id", data.ad_account_id)
      .single();
    if (error || !acc) throw new Error("Ad account not found");
    const token = getMetaToken(acc.access_token_secret_ref);
    if (!token) throw new Error("No Meta token configured");
    const { metaMe } = await import("./meta.server");
    try {
      const me = await metaMe(token);
      return { ok: true, me };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Token invalid" };
    }
  });

// ----- Sync structure: campaigns + adsets + ads -----
export const metaSyncStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ad_account_id: string }) => z.object({ ad_account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: acc, error } = await context.supabase
      .from("marketing_ad_accounts")
      .select("id, brand_id, external_account_id, access_token_secret_ref")
      .eq("id", data.ad_account_id)
      .single();
    if (error || !acc) throw new Error("Ad account not found");
    const token = getMetaToken(acc.access_token_secret_ref);
    if (!token) throw new Error("No Meta token configured");

    const { metaListCampaigns, metaListAdsets, metaListAds } = await import("./meta.server");
    const ext = normalizeMetaAdAccountId(acc.external_account_id);

    let campaignsCount = 0,
      adsetsCount = 0,
      adsCount = 0;
    const errors: string[] = [];

    try {
      const campaigns = await metaListCampaigns(ext, token);
      if (campaigns.length) {
        const rows = campaigns.map((c: any) => ({
          brand_id: acc.brand_id,
          ad_account_id: acc.id,
          external_campaign_id: c.id,
          name: c.name ?? "(no name)",
          objective: c.objective ?? null,
          status: c.status ?? null,
          effective_status: c.effective_status ?? null,
          daily_budget: Number(c.daily_budget ?? 0) / 100,
          lifetime_budget: Number(c.lifetime_budget ?? 0) / 100,
          start_time: c.start_time ?? null,
          stop_time: c.stop_time ?? null,
          raw_json: c,
          last_synced_at: new Date().toISOString(),
        }));
        const { error: e } = await context.supabase
          .from("marketing_campaigns")
          .upsert(rows, { onConflict: "ad_account_id,external_campaign_id" });
        if (e) errors.push(`campaigns: ${e.message}`);
        else campaignsCount = rows.length;
      }
    } catch (e: any) {
      errors.push(`campaigns fetch: ${e?.message}`);
    }

    try {
      const adsets = await metaListAdsets(ext, token);
      if (adsets.length) {
        // map external campaign id -> internal id
        const { data: campRows } = await context.supabase
          .from("marketing_campaigns")
          .select("id, external_campaign_id")
          .eq("ad_account_id", acc.id);
        const campMap = new Map((campRows ?? []).map((c: any) => [c.external_campaign_id, c.id]));
        const rows = adsets.map((a: any) => ({
          brand_id: acc.brand_id,
          ad_account_id: acc.id,
          campaign_id: campMap.get(a.campaign_id) ?? null,
          external_adset_id: a.id,
          external_campaign_id: a.campaign_id ?? null,
          name: a.name ?? "(no name)",
          status: a.status ?? null,
          effective_status: a.effective_status ?? null,
          optimization_goal: a.optimization_goal ?? null,
          billing_event: a.billing_event ?? null,
          bid_strategy: a.bid_strategy ?? null,
          daily_budget: Number(a.daily_budget ?? 0) / 100,
          lifetime_budget: Number(a.lifetime_budget ?? 0) / 100,
          targeting_raw: a.targeting ?? {},
          raw_json: a,
          last_synced_at: new Date().toISOString(),
        }));
        const { error: e } = await context.supabase
          .from("marketing_adsets")
          .upsert(rows, { onConflict: "ad_account_id,external_adset_id" });
        if (e) errors.push(`adsets: ${e.message}`);
        else adsetsCount = rows.length;
      }
    } catch (e: any) {
      errors.push(`adsets fetch: ${e?.message}`);
    }

    try {
      const ads = await metaListAds(ext, token);
      if (ads.length) {
        const { data: campRows } = await context.supabase
          .from("marketing_campaigns")
          .select("id, external_campaign_id")
          .eq("ad_account_id", acc.id);
        const { data: asetRows } = await context.supabase
          .from("marketing_adsets")
          .select("id, external_adset_id")
          .eq("ad_account_id", acc.id);
        const campMap = new Map((campRows ?? []).map((c: any) => [c.external_campaign_id, c.id]));
        const asetMap = new Map((asetRows ?? []).map((a: any) => [a.external_adset_id, a.id]));
        const rows = ads.map((a: any) => ({
          brand_id: acc.brand_id,
          ad_account_id: acc.id,
          campaign_id: campMap.get(a.campaign_id) ?? null,
          adset_id: asetMap.get(a.adset_id) ?? null,
          external_ad_id: a.id,
          external_campaign_id: a.campaign_id ?? null,
          external_adset_id: a.adset_id ?? null,
          name: a.name ?? "(no name)",
          status: a.status ?? null,
          effective_status: a.effective_status ?? null,
          creative_id: a.creative?.id ?? null,
          creative_name: a.creative?.name ?? null,
          preview_url: a.preview_shareable_link ?? null,
          thumbnail_url: a.creative?.thumbnail_url ?? null,
          raw_json: a,
          last_synced_at: new Date().toISOString(),
        }));
        const { error: e } = await context.supabase
          .from("marketing_ads")
          .upsert(rows, { onConflict: "ad_account_id,external_ad_id" });
        if (e) errors.push(`ads: ${e.message}`);
        else adsCount = rows.length;
      }
    } catch (e: any) {
      errors.push(`ads fetch: ${e?.message}`);
    }

    await context.supabase
      .from("marketing_ad_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: errors.length ? errors.join(" | ") : null,
      })
      .eq("id", acc.id);

    return { campaignsCount, adsetsCount, adsCount, errors };
  });

// ----- Sync daily insights (campaign / adset / ad) -----
export const metaSyncInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ad_account_id: string; from: string; to: string }) =>
    z.object({ ad_account_id: z.string().uuid(), from: dateStr, to: dateStr }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: acc, error } = await context.supabase
      .from("marketing_ad_accounts")
      .select("id, brand_id, external_account_id, access_token_secret_ref")
      .eq("id", data.ad_account_id)
      .single();
    if (error || !acc) throw new Error("Ad account not found");
    const token = getMetaToken(acc.access_token_secret_ref);
    if (!token) throw new Error("No Meta token configured");

    const { metaListInsights, extractPurchaseStats } = await import("./meta.server");

    const { data: campRows } = await context.supabase
      .from("marketing_campaigns")
      .select("id, external_campaign_id")
      .eq("ad_account_id", acc.id);
    const { data: asetRows } = await context.supabase
      .from("marketing_adsets")
      .select("id, external_adset_id")
      .eq("ad_account_id", acc.id);
    const { data: adRows } = await context.supabase
      .from("marketing_ads")
      .select("id, external_ad_id")
      .eq("ad_account_id", acc.id);
    const campMap = new Map((campRows ?? []).map((c: any) => [c.external_campaign_id, c.id]));
    const asetMap = new Map((asetRows ?? []).map((a: any) => [a.external_adset_id, a.id]));
    const adMap = new Map((adRows ?? []).map((a: any) => [a.external_ad_id, a.id]));

    const totals = { campaign: 0, adset: 0, ad: 0 };
    const errors: string[] = [];

    for (const level of ["campaign", "adset", "ad"] as const) {
      try {
        const rows = await metaListInsights(normalizeMetaAdAccountId(acc.external_account_id), token, level, data.from, data.to);
        if (!rows.length) continue;
        const upserts = rows.map((r: any) => {
          const { purchases, value } = extractPurchaseStats(r);
          const spend = Number(r.spend ?? 0);
          return {
            brand_id: acc.brand_id,
            ad_account_id: acc.id,
            date: r.date_start,
            level,
            campaign_id: r.campaign_id ? campMap.get(r.campaign_id) ?? null : null,
            adset_id: r.adset_id ? asetMap.get(r.adset_id) ?? null : null,
            ad_id: r.ad_id ? adMap.get(r.ad_id) ?? null : null,
            external_campaign_id: r.campaign_id ?? null,
            external_adset_id: r.adset_id ?? null,
            external_ad_id: r.ad_id ?? null,
            spend,
            impressions: Number(r.impressions ?? 0),
            reach: Number(r.reach ?? 0),
            clicks: Number(r.clicks ?? 0),
            link_clicks: Number(r.inline_link_clicks ?? 0),
            landing_page_views: 0,
            ctr: Number(r.ctr ?? 0),
            cpc: Number(r.cpc ?? 0),
            cpm: Number(r.cpm ?? 0),
            meta_purchases: purchases,
            meta_purchase_value: value,
            meta_roas: spend > 0 ? value / spend : 0,
            raw_json: r,
            synced_at: new Date().toISOString(),
          };
        });
        // The unique index is on a COALESCE() expression so PostgREST can't target it.
        // Strategy: delete the (account, level, date-range) slice first, then bulk insert.
        const delRes = await context.supabase
          .from("marketing_insights_daily")
          .delete()
          .eq("ad_account_id", acc.id)
          .eq("level", level)
          .gte("date", data.from)
          .lte("date", data.to);
        if (delRes.error) {
          errors.push(`${level} delete: ${delRes.error.message}`);
          continue;
        }
        const insRes = await context.supabase.from("marketing_insights_daily").insert(upserts);
        if (insRes.error) errors.push(`${level} insert: ${insRes.error.message}`);
        else totals[level] = upserts.length;
      } catch (e: any) {
        errors.push(`${level} insights: ${e?.message}`);
      }
    }

    await context.supabase
      .from("marketing_ad_accounts")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: errors.length ? errors.join(" | ") : null,
      })
      .eq("id", acc.id);

    return { totals, errors };
  });

// ----- Status / overview for a brand -----
export const getMetaAccountsForBrand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => z.object({ brand_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("marketing_ad_accounts")
      .select(
        "id, external_account_id, account_name, currency, timezone_name, is_active, last_synced_at, last_sync_error, token_expires_at, access_token_secret_ref",
      )
      .eq("brand_id", data.brand_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []).map(({ access_token_secret_ref, ...row }: any) => {
      const hasSavedToken = Boolean(access_token_secret_ref);
      return {
        ...row,
        has_token: Boolean(getMetaToken(access_token_secret_ref)),
        token_source: hasSavedToken ? "saved" : getMetaToken(null) ? "system" : null,
      };
    });
  });

export const setMetaAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ad_account_id: string; is_active: boolean }) =>
    z.object({ ad_account_id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("marketing_ad_accounts")
      .update({ is_active: data.is_active })
      .eq("id", data.ad_account_id);
    if (error) throw error;
    return { ok: true };
  });

export const disconnectMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ad_account_id: string }) => z.object({ ad_account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("marketing_ad_accounts")
      .update({ access_token_secret_ref: null, is_active: false })
      .eq("id", data.ad_account_id);
    if (error) throw error;
    return { ok: true };
  });

export const getMarketingSetupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => z.object({ brand_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const [accounts, campaigns, adsets, ads, insights] = await Promise.all([
      context.supabase.from("marketing_ad_accounts").select("id", { count: "exact", head: true }).eq("brand_id", data.brand_id),
      context.supabase.from("marketing_campaigns").select("id", { count: "exact", head: true }).eq("brand_id", data.brand_id),
      context.supabase.from("marketing_adsets").select("id", { count: "exact", head: true }).eq("brand_id", data.brand_id),
      context.supabase.from("marketing_ads").select("id", { count: "exact", head: true }).eq("brand_id", data.brand_id),
      context.supabase.from("marketing_insights_daily").select("id", { count: "exact", head: true }).eq("brand_id", data.brand_id),
    ]);
    for (const r of [accounts, campaigns, adsets, ads, insights]) {
      if (r.error) throw new Error(r.error.message);
    }
    return {
      accounts: accounts.count ?? 0,
      campaigns: campaigns.count ?? 0,
      adsets: adsets.count ?? 0,
      ads: ads.count ?? 0,
      insights: insights.count ?? 0,
    };
  });