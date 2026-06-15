import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMarketingRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ============ META: list available accounts (for connect dialog) ============
export const metaListMyAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const { metaListAccounts } = await import("./meta.server");
    try {
      const accs = await metaListAccounts();
      return { ok: true as const, accounts: accs };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, accounts: [] };
    }
  });

// ============ Connect Meta ad account to brand ============
export const connectMetaAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; externalAccountId: string }) =>
    z.object({
      brandId: z.string().uuid(),
      externalAccountId: z.string().min(1).max(64).regex(/^\d+$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const { metaVerifyAccount } = await import("./meta.server");
    const db = context.supabase;

    const info = await metaVerifyAccount(data.externalAccountId);

    const { data: platform, error: pErr } = await db
      .from("marketing_platforms").select("id").eq("code", "meta").maybeSingle();
    if (pErr || !platform) throw new Error("Meta platform not registered");

    const payload = {
      brand_id: data.brandId,
      platform_id: platform.id,
      external_account_id: data.externalAccountId,
      account_name: info?.name ?? null,
      currency: info?.currency ?? null,
      timezone_name: info?.timezone_name ?? null,
      is_active: true,
      created_by: context.userId,
      metadata: { account_status: info?.account_status ?? null },
      updated_at: new Date().toISOString(),
    };

    const { data: row, error } = await db
      .from("marketing_ad_accounts")
      .upsert(payload, { onConflict: "platform_id,external_account_id" })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

// ============ Sync campaigns for an ad account ============
export const syncMetaCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { adAccountId: string }) =>
    z.object({ adAccountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const db = context.supabase;

    const { data: acc, error: aErr } = await db
      .from("marketing_ad_accounts")
      .select("id, brand_id, external_account_id, metadata")
      .eq("id", data.adAccountId)
      .single();
    if (aErr || !acc) throw new Error("Ad account not found");

    const { metaListCampaigns, getAccountToken } = await import("./meta.server");
    const token = getAccountToken(acc.metadata);
    const campaigns = await metaListCampaigns(acc.external_account_id, token);

    if (campaigns.length === 0) {
      await db.from("marketing_ad_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", acc.id);
      return { synced: 0 };
    }

    const rows = campaigns.map((c) => ({
      brand_id: acc.brand_id,
      ad_account_id: acc.id,
      external_campaign_id: c.external_campaign_id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      buying_type: c.buying_type,
      daily_budget: c.daily_budget,
      lifetime_budget: c.lifetime_budget,
      start_time: c.start_time,
      stop_time: c.stop_time,
      raw: c.raw,
      updated_at: new Date().toISOString(),
    }));

    const { error: upErr } = await db
      .from("marketing_campaigns")
      .upsert(rows, { onConflict: "ad_account_id,external_campaign_id" });
    if (upErr) throw upErr;

    await db.from("marketing_ad_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", acc.id);
    return { synced: rows.length };
  });

// ============ Sync insights for an ad account ============
export const syncMetaInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { adAccountId: string; days?: number }) =>
    z.object({ adAccountId: z.string().uuid(), days: z.number().int().min(1).max(90).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    return runInsightsSync(data.adAccountId, data.days ?? 7, context.supabase);
  });

async function runInsightsSync(adAccountId: string, days: number, clientOverride?: any) {
  const admin = clientOverride ?? await getAdminClient();
  const { data: acc } = await admin
    .from("marketing_ad_accounts")
    .select("id, metadata")
    .eq("id", adAccountId)
    .single();
  const { data: campaigns, error: cErr } = await admin
    .from("marketing_campaigns")
    .select("id, external_campaign_id, brand_id")
    .eq("ad_account_id", adAccountId);
  if (cErr) throw cErr;
  if (!campaigns || campaigns.length === 0) return { campaigns: 0, insights: 0, expenses: 0 };

  const { metaCampaignInsights, getAccountToken } = await import("./meta.server");
  const token = getAccountToken(acc?.metadata);
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const sinceStr = fmt(since);
  const untilStr = fmt(until);

  let insightCount = 0;
  let expenseCount = 0;

  // Process small concurrency to respect rate limits
  const CONCURRENCY = 3;
  for (let i = 0; i < campaigns.length; i += CONCURRENCY) {
    const batch = campaigns.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (c: any) => {
      try {
        const rows = await metaCampaignInsights(c.external_campaign_id, sinceStr, untilStr, token);
        if (rows.length === 0) return;
        const insightRows = rows.map((r) => ({
          campaign_id: c.id,
          date: r.date,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
          reach: r.reach,
          ctr: r.ctr,
          cpc: r.cpc,
          cpm: r.cpm,
          purchases: r.purchases,
          purchase_value: r.purchase_value,
          purchase_roas: r.purchase_roas,
          outbound_clicks: r.outbound_clicks,
          landing_page_views: r.landing_page_views,
          raw: r.raw,
          synced_at: new Date().toISOString(),
        }));
        const { error: iErr } = await admin
          .from("marketing_campaign_insights")
          .upsert(insightRows, { onConflict: "campaign_id,date" });
        if (iErr) throw iErr;
        insightCount += insightRows.length;

        // Auto-create expense entries
        const expensesCreated = await syncCampaignExpenses(c.id, c.brand_id, rows, admin);
        expenseCount += expensesCreated;

        await admin.from("marketing_campaigns")
          .update({ last_insight_sync_at: new Date().toISOString() })
          .eq("id", c.id);
      } catch (e) {
        console.error(`[marketing] insight sync failed for campaign ${c.id}:`, (e as Error).message);
      }
    }));
  }

  return { campaigns: campaigns.length, insights: insightCount, expenses: expenseCount };
}

async function syncCampaignExpenses(
  campaignId: string,
  brandId: string,
  rows: Array<{ date: string; spend: number }>,
  clientOverride?: any,
): Promise<number> {
  const admin = clientOverride ?? await getAdminClient();

  // Load settings
  const { data: settings } = await admin
    .from("marketing_settings")
    .select("auto_create_expenses, default_expense_account_id, default_expense_category_id")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (settings && settings.auto_create_expenses === false) return 0;

  // Resolve / create category
  let categoryId = settings?.default_expense_category_id ?? null;
  if (!categoryId) {
    const { data: cat } = await admin
      .from("erp_expense_categories")
      .select("id")
      .eq("brand_id", brandId)
      .ilike("name", "Marketing — Meta Ads")
      .maybeSingle();
    if (cat) categoryId = cat.id;
    else {
      const { data: newCat, error: ncErr } = await admin
        .from("erp_expense_categories")
        .insert({ brand_id: brandId, name: "Marketing — Meta Ads", kind: "expense", is_active: true })
        .select("id")
        .single();
      if (ncErr) return 0;
      categoryId = newCat.id;
    }
  }

  const accountId = settings?.default_expense_account_id ?? null;

  // Existing links
  const dates = rows.map((r) => r.date);
  const { data: existing } = await admin
    .from("marketing_expense_links")
    .select("id, insight_date, transaction_id, amount")
    .eq("campaign_id", campaignId)
    .in("insight_date", dates);
  const existingMap = new Map<string, any>((existing ?? []).map((e: any) => [e.insight_date, e]));

  let created = 0;
  for (const r of rows) {
    if (r.spend <= 0) continue;
    const existingLink = existingMap.get(r.date);
    if (existingLink) {
      if (Number(existingLink.amount) !== r.spend && existingLink.transaction_id) {
        await admin.from("erp_transactions")
          .update({ amount: r.spend, updated_at: new Date().toISOString() })
          .eq("id", existingLink.transaction_id);
        await admin.from("marketing_expense_links")
          .update({ amount: r.spend })
          .eq("id", existingLink.id);
      }
      continue;
    }

    const { data: txn, error: tErr } = await admin
      .from("erp_transactions")
      .insert({
        brand_id: brandId,
        txn_type: "expense",
        category_id: categoryId,
        amount: r.spend,
        account_id: accountId,
        reference_type: "marketing_campaign",
        reference_id: campaignId,
        description: "Meta Ads spend",
        transaction_date: r.date,
      })
      .select("id")
      .single();
    if (tErr || !txn) continue;

    await admin.from("marketing_expense_links").insert({
      campaign_id: campaignId,
      insight_date: r.date,
      transaction_id: txn.id,
      amount: r.spend,
      account_id: accountId,
    });
    created++;
  }
  return created;
}

export { runInsightsSync };

// ============ List ad accounts for a brand ============
export const listAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("marketing_ad_accounts")
      .select("id, account_name, external_account_id, currency, timezone_name, is_active, last_synced_at, platform_id, marketing_platforms(code, name)")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { accounts: rows ?? [] };
  });

// ============ List campaigns for a brand ============
export const listCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; since?: string; until?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      since: z.string().optional(),
      until: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const db = context.supabase;

    const { data: campaigns, error } = await db
      .from("marketing_campaigns")
      .select("id, name, status, objective, daily_budget, last_insight_sync_at, ad_account_id, marketing_ad_accounts(account_name, currency)")
      .eq("brand_id", data.brandId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    if (!campaigns || campaigns.length === 0) return { campaigns: [] };

    const ids = campaigns.map((c: any) => c.id);

    const sinceStr = data.since ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const untilStr = data.until ?? new Date().toISOString().slice(0, 10);

    const { data: insights } = await db
      .from("marketing_campaign_insights")
      .select("campaign_id, spend, purchase_value, purchases, clicks, impressions, date")
      .in("campaign_id", ids)
      .gte("date", sinceStr)
      .lte("date", untilStr);

    const agg = new Map<string, { spend: number; pv: number; purchases: number; clicks: number; impressions: number }>();
    for (const i of insights ?? []) {
      const a = agg.get(i.campaign_id) ?? { spend: 0, pv: 0, purchases: 0, clicks: 0, impressions: 0 };
      a.spend += Number(i.spend || 0);
      a.pv += Number(i.purchase_value || 0);
      a.purchases += Number(i.purchases || 0);
      a.clicks += Number(i.clicks || 0);
      a.impressions += Number(i.impressions || 0);
      agg.set(i.campaign_id, a);
    }

    const { data: maps } = await db
      .from("marketing_campaign_products")
      .select("campaign_id, product_id, weight")
      .in("campaign_id", ids);
    const productMap = new Map<string, Array<{ product_id: string; weight: number }>>();
    for (const m of maps ?? []) {
      const arr = productMap.get(m.campaign_id) ?? [];
      arr.push({ product_id: m.product_id, weight: Number(m.weight) });
      productMap.set(m.campaign_id, arr);
    }

    // Compute estimated actual revenue per campaign via mapped products
    const allProductIds = Array.from(new Set((maps ?? []).map((m: any) => m.product_id)));
    const productRevenue = new Map<string, number>();
    if (allProductIds.length > 0) {
      const { data: itemRows } = await db
        .from("order_items")
        .select("product_id, quantity, price, line_total, orders!inner(status, created_at, brand_id)")
        .in("product_id", allProductIds)
        .gte("orders.created_at", `${sinceStr}T00:00:00Z`)
        .lte("orders.created_at", `${untilStr}T23:59:59Z`)
        .eq("orders.brand_id", data.brandId)
        .in("orders.status", ["delivered", "partial_delivered", "paid"]);
      for (const it of (itemRows ?? []) as any[]) {
        const cur = productRevenue.get(it.product_id) ?? 0;
        const rev = Number(it.line_total ?? 0) || Number(it.price || 0) * Number(it.quantity || 0);
        productRevenue.set(it.product_id, cur + rev);
      }
    }

    const result = campaigns.map((c: any) => {
      const a = agg.get(c.id) ?? { spend: 0, pv: 0, purchases: 0, clicks: 0, impressions: 0 };
      const maps = productMap.get(c.id) ?? [];
      const totalWeight = maps.reduce((s, m) => s + (m.weight || 0), 0);
      let actualRevenue = 0;
      for (const m of maps) {
        const w = totalWeight > 0 ? m.weight / totalWeight : 0;
        actualRevenue += (productRevenue.get(m.product_id) ?? 0) * w;
      }
      const metaRoas = a.spend > 0 ? a.pv / a.spend : null;
      const actualRoas = a.spend > 0 ? actualRevenue / a.spend : null;
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        ad_account_name: c.marketing_ad_accounts?.account_name ?? null,
        currency: c.marketing_ad_accounts?.currency ?? null,
        last_insight_sync_at: c.last_insight_sync_at,
        spend: a.spend,
        purchases: a.purchases,
        purchase_value: a.pv,
        clicks: a.clicks,
        impressions: a.impressions,
        meta_roas: metaRoas,
        actual_revenue: actualRevenue,
        actual_roas: actualRoas,
        mapped_products: maps.length,
      };
    });

    return { campaigns: result };
  });

// ============ Campaign detail ============
export const getCampaignDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; since?: string; until?: string }) =>
    z.object({
      campaignId: z.string().uuid(),
      since: z.string().optional(),
      until: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const db = context.supabase;

    const { data: campaign, error } = await db
      .from("marketing_campaigns")
      .select("*, marketing_ad_accounts(account_name, external_account_id, currency)")
      .eq("id", data.campaignId)
      .single();
    if (error || !campaign) throw new Error("Campaign not found");

    const sinceStr = data.since ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const untilStr = data.until ?? new Date().toISOString().slice(0, 10);

    const { data: insights } = await db
      .from("marketing_campaign_insights")
      .select("*")
      .eq("campaign_id", data.campaignId)
      .gte("date", sinceStr)
      .lte("date", untilStr)
      .order("date", { ascending: true });

    const { data: mappings } = await db
      .from("marketing_campaign_products")
      .select("id, product_id, weight, notes, products(id, title, sku, image, price)")
      .eq("campaign_id", data.campaignId);

    return { campaign, insights: insights ?? [], mappings: mappings ?? [], range: { since: sinceStr, until: untilStr } };
  });

// ============ Product mapping save ============
export const saveCampaignProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; products: Array<{ productId: string; weight: number }> }) =>
    z.object({
      campaignId: z.string().uuid(),
      products: z.array(z.object({
        productId: z.string().uuid(),
        weight: z.number().min(0).max(1000),
      })).max(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const db = context.supabase;
    await db.from("marketing_campaign_products").delete().eq("campaign_id", data.campaignId);
    if (data.products.length > 0) {
      const rows = data.products.map((p) => ({
        campaign_id: data.campaignId,
        product_id: p.productId,
        weight: p.weight,
        created_by: context.userId,
      }));
      const { error } = await db.from("marketing_campaign_products").insert(rows);
      if (error) throw error;
    }
    return { ok: true, count: data.products.length };
  });

// ============ Dashboard KPIs ============
export const getMarketingDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; since?: string; until?: string }) =>
    z.object({
      brandId: z.string().uuid(),
      since: z.string().optional(),
      until: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const db = context.supabase;

    const sinceStr = data.since ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const untilStr = data.until ?? new Date().toISOString().slice(0, 10);

    const { data: campaigns } = await db
      .from("marketing_campaigns")
      .select("id, status")
      .eq("brand_id", data.brandId);
    const campIds = (campaigns ?? []).map((c: any) => c.id);
    const activeCount = (campaigns ?? []).filter((c: any) => c.status === "ACTIVE").length;

    if (campIds.length === 0) {
      return {
        total_spend: 0, total_meta_revenue: 0, meta_roas: null, actual_roas: null,
        active_campaigns: 0, total_campaigns: 0, actual_revenue: 0,
        daily: [], range: { since: sinceStr, until: untilStr },
      };
    }

    const { data: insights } = await db
      .from("marketing_campaign_insights")
      .select("campaign_id, date, spend, purchase_value")
      .in("campaign_id", campIds)
      .gte("date", sinceStr)
      .lte("date", untilStr);

    let totalSpend = 0;
    let totalMetaRevenue = 0;
    const daily = new Map<string, { date: string; spend: number; meta_revenue: number }>();
    for (const i of insights ?? []) {
      totalSpend += Number(i.spend || 0);
      totalMetaRevenue += Number(i.purchase_value || 0);
      const d = daily.get(i.date) ?? { date: i.date, spend: 0, meta_revenue: 0 };
      d.spend += Number(i.spend || 0);
      d.meta_revenue += Number(i.purchase_value || 0);
      daily.set(i.date, d);
    }

    // Actual revenue (across mapped products)
    const { data: maps } = await db
      .from("marketing_campaign_products")
      .select("campaign_id, product_id, weight")
      .in("campaign_id", campIds);

    const productIds = Array.from(new Set((maps ?? []).map((m: any) => m.product_id)));
    let actualRevenue = 0;
    if (productIds.length > 0) {
      const { data: itemRows } = await db
        .from("order_items")
        .select("product_id, quantity, price, line_total, orders!inner(status, created_at, brand_id)")
        .in("product_id", productIds)
        .gte("orders.created_at", `${sinceStr}T00:00:00Z`)
        .lte("orders.created_at", `${untilStr}T23:59:59Z`)
        .eq("orders.brand_id", data.brandId)
        .in("orders.status", ["delivered", "partial_delivered", "paid"]);
      const productRev = new Map<string, number>();
      for (const it of (itemRows ?? []) as any[]) {
        const rev = Number(it.line_total ?? 0) || Number(it.price || 0) * Number(it.quantity || 0);
        productRev.set(it.product_id, (productRev.get(it.product_id) ?? 0) + rev);
      }
      for (const [, rev] of productRev) {
        actualRevenue += rev; // Total revenue from any mapped product
      }
    }

    return {
      total_spend: totalSpend,
      total_meta_revenue: totalMetaRevenue,
      actual_revenue: actualRevenue,
      meta_roas: totalSpend > 0 ? totalMetaRevenue / totalSpend : null,
      actual_roas: totalSpend > 0 ? actualRevenue / totalSpend : null,
      active_campaigns: activeCount,
      total_campaigns: campaigns?.length ?? 0,
      daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
      range: { since: sinceStr, until: untilStr },
    };
  });

// ============ Marketing settings ============
export const getMarketingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("marketing_settings")
      .select("*")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    return { settings: row };
  });

export const saveMarketingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brandId: string;
    default_expense_account_id?: string | null;
    default_expense_category_id?: string | null;
    attribution_mode?: "weighted" | "equal_split" | "revenue_proportional";
    auto_create_expenses?: boolean;
    auto_sync_enabled?: boolean;
  }) => z.object({
    brandId: z.string().uuid(),
    default_expense_account_id: z.string().uuid().nullable().optional(),
    default_expense_category_id: z.string().uuid().nullable().optional(),
    attribution_mode: z.enum(["weighted", "equal_split", "revenue_proportional"]).optional(),
    auto_create_expenses: z.boolean().optional(),
    auto_sync_enabled: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const isAdmin = (await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" })).data;
    if (!isAdmin) throw new Error("Admin only");
    const admin = await getAdminClient();
    const { brandId, ...rest } = data;
    const { error } = await admin
      .from("marketing_settings")
      .upsert({ brand_id: brandId, ...rest, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
    if (error) throw error;
    return { ok: true };
  });

// ============ Product search for mapping ============
export const searchProductsForMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; q?: string }) =>
    z.object({ brandId: z.string().uuid(), q: z.string().max(120).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    let q = context.supabase
      .from("products")
      .select("id, title, sku, image, price")
      .eq("brand_id", data.brandId)
      .limit(30);
    if (data.q && data.q.trim()) {
      q = q.or(`title.ilike.%${data.q.trim()}%,sku.ilike.%${data.q.trim()}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return { products: rows ?? [] };
  });

// ============ Disconnect / reactivate ad account ============
export const setAdAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { adAccountId: string; isActive: boolean }) =>
    z.object({ adAccountId: z.string().uuid(), isActive: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const admin = await getAdminClient();
    const { error } = await admin
      .from("marketing_ad_accounts")
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() })
      .eq("id", data.adAccountId);
    if (error) throw error;
    return { ok: true };
  });

// ============ Meta integration status ============
export const getMetaIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const tokenSet = !!process.env.META_SYSTEM_USER_TOKEN;
    if (!tokenSet) {
      return { tokenSet: false, ok: false, error: "META_SYSTEM_USER_TOKEN secret nai" };
    }
    try {
      const { metaListAccounts } = await import("./meta.server");
      const accs = await metaListAccounts();
      return { tokenSet: true, ok: true, accountCount: accs.length };
    } catch (e) {
      return { tokenSet: true, ok: false, error: (e as Error).message };
    }
  });

// ============ Lookups for settings selects ============
export const getMarketingLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const admin = await getAdminClient();
    const [{ data: accounts }, { data: categories }] = await Promise.all([
      admin
        .from("erp_accounts")
        .select("id, name, account_type")
        .eq("brand_id", data.brandId)
        .eq("is_active", true)
        .order("name"),
      admin
        .from("erp_expense_categories")
        .select("id, name, kind")
        .eq("brand_id", data.brandId)
        .eq("is_active", true)
        .order("name"),
    ]);
    return { accounts: accounts ?? [], categories: categories ?? [] };
  });
// ============ Get ad account detail (for edit dialog) ============
export const getAdAccountDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { adAccountId: string }) =>
    z.object({ adAccountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const admin = await getAdminClient();
    const { data: row, error } = await admin
      .from("marketing_ad_accounts")
      .select("id, brand_id, platform_id, external_account_id, account_name, currency, is_active, metadata, last_synced_at")
      .eq("id", data.adAccountId)
      .single();
    if (error || !row) throw new Error("Ad account not found");
    const meta = (row.metadata ?? {}) as any;
    return {
      id: row.id,
      brand_id: row.brand_id,
      external_account_id: row.external_account_id,
      account_name: row.account_name,
      currency: row.currency,
      is_active: row.is_active,
      last_synced_at: row.last_synced_at,
      app_id: meta.app_id ?? "",
      app_secret_masked: meta.app_secret ? "•".repeat(Math.min(24, String(meta.app_secret).length)) : "",
      access_token_masked: meta.access_token ? "•".repeat(24) : "",
      usd_to_bdt: typeof meta.usd_to_bdt === "number" ? meta.usd_to_bdt : null,
      has_app_secret: !!meta.app_secret,
      has_access_token: !!meta.access_token,
    };
  });

// ============ Test Meta credentials (no DB write) ============
export const testMetaAccountCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { externalAccountId: string; accessToken: string }) =>
    z.object({
      externalAccountId: z.string().min(1).max(64).regex(/^\d+$/),
      accessToken: z.string().min(20).max(8192),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    try {
      const { metaVerifyAccount } = await import("./meta.server");
      const info = await metaVerifyAccount(data.externalAccountId, data.accessToken);
      return {
        ok: true as const,
        account: {
          name: info?.name ?? null,
          currency: info?.currency ?? null,
          timezone_name: info?.timezone_name ?? null,
          status: info?.account_status ?? null,
        },
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

// ============ Save (create / edit) Meta account with full credentials ============
export const saveMetaAccountManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null;
    brandId: string;
    accountName: string;
    externalAccountId: string;
    appId?: string | null;
    appSecret?: string | null;
    accessToken?: string | null;
    usdToBdt?: number | null;
    isActive: boolean;
  }) =>
    z.object({
      id: z.string().uuid().nullable().optional(),
      brandId: z.string().uuid(),
      accountName: z.string().min(1).max(200),
      externalAccountId: z.string().min(1).max(64).regex(/^\d+$/),
      appId: z.string().max(64).regex(/^\d*$/).nullable().optional(),
      appSecret: z.string().max(256).nullable().optional(),
      accessToken: z.string().max(8192).nullable().optional(),
      usdToBdt: z.number().positive().max(10000).nullable().optional(),
      isActive: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMarketingRole(context.supabase, context.userId);
    const admin = await getAdminClient();

    const { data: platform, error: pErr } = await admin
      .from("marketing_platforms").select("id").eq("code", "meta").maybeSingle();
    if (pErr || !platform) throw new Error("Meta platform not registered");

    // Resolve existing row (when editing) so we can preserve unchanged secrets
    let existingMeta: Record<string, any> = {};
    let resolvedInfo: { name?: string | null; currency?: string | null; timezone_name?: string | null; account_status?: number | null } = {};

    if (data.id) {
      const { data: row, error } = await admin
        .from("marketing_ad_accounts")
        .select("metadata")
        .eq("id", data.id)
        .single();
      if (error || !row) throw new Error("Ad account not found");
      existingMeta = (row.metadata ?? {}) as Record<string, any>;
    }

    const finalToken =
      data.accessToken && data.accessToken.trim().length > 0
        ? data.accessToken.trim()
        : (existingMeta.access_token ?? null);

    const finalAppSecret =
      data.appSecret && data.appSecret.trim().length > 0
        ? data.appSecret.trim()
        : (existingMeta.app_secret ?? null);

    // Verify credentials against Meta if we have a token
    if (finalToken) {
      try {
        const { metaVerifyAccount } = await import("./meta.server");
        const info = await metaVerifyAccount(data.externalAccountId, finalToken);
        resolvedInfo = {
          name: info?.name ?? null,
          currency: info?.currency ?? null,
          timezone_name: info?.timezone_name ?? null,
          account_status: info?.account_status ?? null,
        };
      } catch (e) {
        throw new Error(`Meta verification failed: ${(e as Error).message}`);
      }
    }

    const nextMetadata: Record<string, any> = {
      ...existingMeta,
      app_id: data.appId ?? existingMeta.app_id ?? null,
      app_secret: finalAppSecret,
      access_token: finalToken,
      usd_to_bdt: typeof data.usdToBdt === "number" ? data.usdToBdt : existingMeta.usd_to_bdt ?? null,
      account_status: resolvedInfo.account_status ?? existingMeta.account_status ?? null,
    };

    const payload: any = {
      brand_id: data.brandId,
      platform_id: platform.id,
      external_account_id: data.externalAccountId,
      account_name: data.accountName || resolvedInfo.name || null,
      currency: resolvedInfo.currency ?? null,
      timezone_name: resolvedInfo.timezone_name ?? null,
      is_active: data.isActive,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await admin
        .from("marketing_ad_accounts")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    } else {
      payload.created_by = context.userId;
      const { data: row, error } = await admin
        .from("marketing_ad_accounts")
        .upsert(payload, { onConflict: "platform_id,external_account_id" })
        .select("id")
        .single();
      if (error) throw error;
      return { id: row.id };
    }
  });
