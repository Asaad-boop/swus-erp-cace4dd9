import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CampaignRollupRow = {
  id: string;
  external_id: string;
  name: string;
  objective: string | null;
  status: string | null;
  effective_status: string | null;
  account_id: string;
  account_name: string | null;
  daily_budget: number | null;
  // Meta numbers
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpm: number | null;
  meta_purchases: number;
  meta_purchase_value: number;
  meta_leads: number;
  // Currency / FX (per account)
  currency: string;
  fx_rate: number; // 1 unit of account currency in BDT
  spend_bdt: number;
  meta_purchase_value_bdt: number;
  // FIFO cost source
  spend_bdt_fifo: number;
  cost_source: "fifo" | "fx_fallback" | "manual" | "mixed";
  estimated_bdt_cost: boolean;
  // Attribution-derived
  confirmed_orders: number;
  confirmed_revenue: number;
  delivered_orders: number;
  delivered_revenue: number;
  return_orders: number;
  // Computed
  roas_meta: number | null;
  roas_confirmed: number | null;
  roas_delivered: number | null;
  cpo_confirmed_bdt: number | null;
  cpo_delivered_bdt: number | null;
  products: Array<{ id: string; title: string | null; image: string | null; sku: string | null }>;
};

function dateRangeDefaults(input: { from?: string; to?: string }) {
  const today = new Date();
  const to = input.to ?? today.toISOString().slice(0, 10);
  const from =
    input.from ??
    new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

export const listCampaignsRollup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[]; from?: string; to?: string }) =>
    z
      .object({
        brandId: z.string().uuid().optional(),
        brandIds: z.array(z.string().uuid()).min(1).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .refine((v) => !!v.brandId || (v.brandIds && v.brandIds.length > 0), {
        message: "brandId or brandIds required",
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CampaignRollupRow[]> => {
    const { getBrandUsdBdtMap } = await import("./fx.server");
    const brandIds = data.brandIds && data.brandIds.length ? data.brandIds : [data.brandId!];
    const fxMap = await getBrandUsdBdtMap(context.supabase, brandIds);
    const supabase = context.supabase;
    const { from, to } = dateRangeDefaults(data);

    const { data: campaigns, error: cErr } = await supabase
      .from("mkt_campaigns")
      .select(
        "id,external_id,name,objective,status,effective_status,account_id,brand_id,daily_budget,mkt_ad_accounts(name,currency,usd_to_bdt_rate)",
      )
      .in("brand_id", brandIds)
      .order("name");
    if (cErr) throw cErr;
    if (!campaigns?.length) return [];

    const campIds = campaigns.map((c: any) => c.id);

    // Aggregate Meta insights per campaign within window
    const { data: insights, error: iErr } = await supabase
      .from("mkt_insights_daily")
      .select("campaign_id,spend,impressions,clicks,meta_purchases,meta_purchase_value,meta_leads,spend_bdt_fifo,conversion_source,estimated_bdt_cost")
      .in("campaign_id", campIds)
      .gte("date", from)
      .lte("date", to);
    if (iErr) throw iErr;

    const insMap = new Map<string, { spend: number; impressions: number; clicks: number; meta_purchases: number; meta_purchase_value: number; meta_leads: number; spend_bdt_fifo: number; fifo_rows: number; fallback_rows: number }>();
    for (const r of insights ?? []) {
      if (!r.campaign_id) continue;
      const cur = insMap.get(r.campaign_id) ?? { spend: 0, impressions: 0, clicks: 0, meta_purchases: 0, meta_purchase_value: 0, meta_leads: 0, spend_bdt_fifo: 0, fifo_rows: 0, fallback_rows: 0 };
      cur.spend += Number(r.spend) || 0;
      cur.impressions += Number(r.impressions) || 0;
      cur.clicks += Number(r.clicks) || 0;
      cur.meta_purchases += Number(r.meta_purchases) || 0;
      cur.meta_purchase_value += Number(r.meta_purchase_value) || 0;
      cur.meta_leads += Number(r.meta_leads) || 0;
      cur.spend_bdt_fifo += Number((r as any).spend_bdt_fifo) || 0;
      if ((r as any).conversion_source === "fifo") cur.fifo_rows += 1;
      if ((r as any).conversion_source === "fx_fallback" || (r as any).estimated_bdt_cost) cur.fallback_rows += 1;
      insMap.set(r.campaign_id, cur);
    }

    // Attribution → orders join (confirmed = any non-cancelled status, delivered = delivered, return = returned)
    const { data: attribs, error: aErr } = await supabase
      .from("mkt_order_attributions")
      .select("campaign_id, orders(status, total)")
      .in("campaign_id", campIds);
    if (aErr) throw aErr;

    const attrMap = new Map<string, { confirmed_orders: number; confirmed_revenue: number; delivered_orders: number; delivered_revenue: number; return_orders: number }>();
    for (const r of (attribs ?? []) as any[]) {
      if (!r.campaign_id || !r.orders) continue;
      const cur = attrMap.get(r.campaign_id) ?? { confirmed_orders: 0, confirmed_revenue: 0, delivered_orders: 0, delivered_revenue: 0, return_orders: 0 };
      const status = r.orders.status as string;
      const total = Number(r.orders.total) || 0;
      if (status !== "cancelled" && status !== "returned") {
        cur.confirmed_orders += 1;
        cur.confirmed_revenue += total;
      }
      if (status === "delivered") {
        cur.delivered_orders += 1;
        cur.delivered_revenue += total;
      }
      if (status === "returned") cur.return_orders += 1;
      attrMap.set(r.campaign_id, cur);
    }

    // Phase 4a — side-by-side drift check vs canonical get_meta_spend_bdt RPC.
    // Log-only; Phase 4a.1 will replace the local sum.
    if (brandIds.length === 1) {
      try {
        // Local sum of spend_bdt across all campaigns in window (mirrors row map below)
        let localBdt = 0;
        for (const c of campaigns as any[]) {
          const ins = insMap.get(c.id);
          if (!ins) continue;
          const acc = c.mkt_ad_accounts ?? {};
          const currency: string = (acc.currency ?? "USD").toUpperCase();
          const usdFx: number = Number(acc.usd_to_bdt_rate) || (fxMap.get(c.brand_id) ?? 0);
          const fx: number = currency === "BDT" ? 1 : usdFx;
          localBdt += ins.spend_bdt_fifo > 0 ? ins.spend_bdt_fifo : ins.spend * fx;
        }
        if (localBdt > 0) {
          const { data: rpcRows } = await supabase.rpc("get_meta_spend_bdt", {
            _brand_id: brandIds[0], _from: from, _to: to,
          });
          const rpcSum = ((rpcRows ?? []) as any[]).reduce(
            (s, r) => s + (Number(r.spend_bdt) || 0), 0,
          );
          const drift = localBdt - rpcSum;
          if (Math.abs(drift) >= 0.5) {
            console.warn("[phase4a-drift] campaigns.rollup", {
              brand: brandIds[0], from, to,
              local: +localBdt.toFixed(2),
              rpc: +rpcSum.toFixed(2),
              drift: +drift.toFixed(2),
            });
          }
        }
      } catch (e) {
        console.warn("[phase4a-drift] campaigns rpc failed", e);
      }
    }

    // Linked products per campaign (for visual identification)
    const { data: linkRows } = await supabase
      .from("mkt_campaign_products")
      .select("campaign_id, product_id, products(id, title, sku, image)")
      .in("campaign_id", campIds);
    const prodMap = new Map<string, Array<{ id: string; title: string | null; image: string | null; sku: string | null }>>();
    for (const r of (linkRows ?? []) as any[]) {
      if (!r.campaign_id || !r.products) continue;
      const arr = prodMap.get(r.campaign_id) ?? [];
      arr.push({ id: r.products.id, title: r.products.title ?? null, image: r.products.image ?? null, sku: r.products.sku ?? null });
      prodMap.set(r.campaign_id, arr);
    }

    return campaigns.map((c: any): CampaignRollupRow => {
      const ins = insMap.get(c.id) ?? { spend: 0, impressions: 0, clicks: 0, meta_purchases: 0, meta_purchase_value: 0, meta_leads: 0, spend_bdt_fifo: 0, fifo_rows: 0, fallback_rows: 0 };
      const att = attrMap.get(c.id) ?? { confirmed_orders: 0, confirmed_revenue: 0, delivered_orders: 0, delivered_revenue: 0, return_orders: 0 };
      const ctr = ins.impressions > 0 ? (ins.clicks / ins.impressions) * 100 : null;
      const cpm = ins.impressions > 0 ? (ins.spend / ins.impressions) * 1000 : null;
      const acc = c.mkt_ad_accounts ?? {};
      const currency: string = (acc.currency ?? "USD").toUpperCase();
      const usdFx: number = Number(acc.usd_to_bdt_rate) || (fxMap.get(c.brand_id) ?? 0);
      const fx: number = currency === "BDT" ? 1 : usdFx;
      const hasFifo = ins.spend_bdt_fifo > 0;
      const spend_bdt = hasFifo ? ins.spend_bdt_fifo : ins.spend * fx;
      const cost_source: CampaignRollupRow["cost_source"] = !hasFifo
        ? "fx_fallback"
        : ins.fallback_rows > 0 && ins.fifo_rows > 0
        ? "mixed"
        : ins.fallback_rows > 0
        ? "fx_fallback"
        : "fifo";
      const estimated_bdt_cost = cost_source !== "fifo";
      const meta_purchase_value_bdt = ins.meta_purchase_value * fx;
      // ROAS — all in BDT for apples-to-apples
      const roas_meta = spend_bdt > 0 ? meta_purchase_value_bdt / spend_bdt : null;
      const roas_confirmed = spend_bdt > 0 ? att.confirmed_revenue / spend_bdt : null;
      const roas_delivered = spend_bdt > 0 ? att.delivered_revenue / spend_bdt : null;
      const cpo_confirmed_bdt = att.confirmed_orders > 0 ? spend_bdt / att.confirmed_orders : null;
      const cpo_delivered_bdt = att.delivered_orders > 0 ? spend_bdt / att.delivered_orders : null;
      return {
        id: c.id,
        external_id: c.external_id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        effective_status: c.effective_status,
        account_id: c.account_id,
        account_name: acc.name ?? null,
        daily_budget: c.daily_budget,
        ...ins,
        ctr,
        cpm,
        currency,
        fx_rate: fx,
        spend_bdt,
        meta_purchase_value_bdt,
        spend_bdt_fifo: ins.spend_bdt_fifo,
        cost_source,
        estimated_bdt_cost,
        ...att,
        roas_meta,
        roas_confirmed,
        roas_delivered,
        cpo_confirmed_bdt,
        cpo_delivered_bdt,
        products: prodMap.get(c.id) ?? [],
      };
    });
  });

export const getCampaignDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; from?: string; to?: string }) =>
    z
      .object({
        campaignId: z.string().uuid(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { from, to } = dateRangeDefaults(data);

    const { data: camp, error: cErr } = await supabase
      .from("mkt_campaigns")
      .select("*, mkt_ad_accounts(name, currency, external_id)")
      .eq("id", data.campaignId)
      .single();
    if (cErr) throw cErr;

    const { data: daily, error: dErr } = await supabase
      .from("mkt_insights_daily")
      .select("date, spend, impressions, clicks, reach, meta_purchases, meta_purchase_value, meta_leads")
      .eq("campaign_id", data.campaignId)
      .gte("date", from)
      .lte("date", to)
      .order("date");
    if (dErr) throw dErr;

    // Aggregate per day across ads
    const dayMap = new Map<string, any>();
    for (const r of daily ?? []) {
      const cur = dayMap.get(r.date) ?? { date: r.date, spend: 0, impressions: 0, clicks: 0, reach: 0, meta_purchases: 0, meta_purchase_value: 0, meta_leads: 0 };
      cur.spend += Number(r.spend) || 0;
      cur.impressions += Number(r.impressions) || 0;
      cur.clicks += Number(r.clicks) || 0;
      cur.reach += Number(r.reach) || 0;
      cur.meta_purchases += Number(r.meta_purchases) || 0;
      cur.meta_purchase_value += Number(r.meta_purchase_value) || 0;
      cur.meta_leads += Number(r.meta_leads) || 0;
      dayMap.set(r.date, cur);
    }
    const series = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Adsets with rollup
    const { data: adsets } = await supabase
      .from("mkt_adsets")
      .select("id, name, status, effective_status, daily_budget")
      .eq("campaign_id", data.campaignId)
      .order("name");

    const adsetIds = (adsets ?? []).map((a: any) => a.id);
    let adsetMetrics = new Map<string, { spend: number; impressions: number; clicks: number; meta_purchases: number; meta_purchase_value: number }>();
    if (adsetIds.length) {
      const { data: aIns } = await supabase
        .from("mkt_insights_daily")
        .select("adset_id, spend, impressions, clicks, meta_purchases, meta_purchase_value")
        .in("adset_id", adsetIds)
        .gte("date", from)
        .lte("date", to);
      for (const r of aIns ?? []) {
        if (!r.adset_id) continue;
        const cur = adsetMetrics.get(r.adset_id) ?? { spend: 0, impressions: 0, clicks: 0, meta_purchases: 0, meta_purchase_value: 0 };
        cur.spend += Number(r.spend) || 0;
        cur.impressions += Number(r.impressions) || 0;
        cur.clicks += Number(r.clicks) || 0;
        cur.meta_purchases += Number(r.meta_purchases) || 0;
        cur.meta_purchase_value += Number(r.meta_purchase_value) || 0;
        adsetMetrics.set(r.adset_id, cur);
      }
    }

    const adsetRows = (adsets ?? []).map((a: any) => ({
      ...a,
      ...(adsetMetrics.get(a.id) ?? { spend: 0, impressions: 0, clicks: 0, meta_purchases: 0, meta_purchase_value: 0 }),
    }));

    // Attribution totals
    const { data: attribs } = await supabase
      .from("mkt_order_attributions")
      .select("source, confidence, orders(id, status, total, created_at)")
      .eq("campaign_id", data.campaignId);

    const attrTotals = { confirmed_orders: 0, confirmed_revenue: 0, delivered_orders: 0, delivered_revenue: 0, return_orders: 0 };
    for (const r of (attribs ?? []) as any[]) {
      if (!r.orders) continue;
      const status = r.orders.status as string;
      const total = Number(r.orders.total) || 0;
      if (status !== "cancelled" && status !== "returned") {
        attrTotals.confirmed_orders += 1;
        attrTotals.confirmed_revenue += total;
      }
      if (status === "delivered") {
        attrTotals.delivered_orders += 1;
        attrTotals.delivered_revenue += total;
      }
      if (status === "returned") attrTotals.return_orders += 1;
    }

    const totals = series.reduce(
      (a, r) => {
        a.spend += r.spend;
        a.impressions += r.impressions;
        a.clicks += r.clicks;
        a.meta_purchases += r.meta_purchases;
        a.meta_purchase_value += r.meta_purchase_value;
        a.meta_leads += r.meta_leads;
        return a;
      },
      { spend: 0, impressions: 0, clicks: 0, meta_purchases: 0, meta_purchase_value: 0, meta_leads: 0 },
    );

    return {
      campaign: camp,
      from,
      to,
      totals: { ...totals, ...attrTotals },
      series,
      adsets: adsetRows,
    };
  });

// ---- Campaign ↔ Product linking ----

async function assertMktRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

export const listCampaignProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) =>
    z.object({ campaignId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_campaign_products")
      .select("id, weight, note, product_id, products(id, title, sku, price, image, is_active)")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const productIds = (rows ?? []).map((r: any) => r.product_id).filter(Boolean);
    if (productIds.length === 0) return rows ?? [];

    // Product-level allocation table dropped in Phase 1 cleanup.
    return (rows ?? []).map((r: any) => ({
      ...r,
      allocated_meta_spend: 0,
    }));
  });

export const searchBrandProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string; brandIds?: string[]; query?: string; limit?: number }) =>
    z
      .object({
        brandId: z.string().uuid().optional(),
        brandIds: z.array(z.string().uuid()).optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ids = data.brandIds && data.brandIds.length > 0
      ? data.brandIds
      : data.brandId
        ? [data.brandId]
        : [];
    if (ids.length === 0) return [];
    let q = context.supabase
      .from("products")
      .select("id, title, sku, price, image, is_active, brand_id")
      .in("brand_id", ids)
      .order("title", { ascending: true })
      .limit(data.limit ?? 25);
    if (data.query && data.query.trim()) {
      const term = `%${data.query.trim()}%`;
      q = q.or(`title.ilike.${term},sku.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const linkCampaignProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; productId: string; weight?: number; note?: string | null }) =>
    z
      .object({
        campaignId: z.string().uuid(),
        productId: z.string().uuid(),
        weight: z.coerce.number().min(0).max(100).optional(),
        note: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    // brand_id auto-fill from campaign
    const { data: camp, error: cErr } = await context.supabase
      .from("mkt_campaigns")
      .select("brand_id")
      .eq("id", data.campaignId)
      .single();
    if (cErr || !camp) throw new Error("Campaign not found");
    const { error } = await context.supabase.from("mkt_campaign_products").upsert(
      {
        brand_id: camp.brand_id,
        campaign_id: data.campaignId,
        product_id: data.productId,
        weight: data.weight ?? 1,
        note: data.note ?? null,
      },
      { onConflict: "campaign_id,product_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const updateCampaignProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { linkId: string; weight: number; note?: string | null }) =>
    z
      .object({
        linkId: z.string().uuid(),
        weight: z.coerce.number().min(0).max(100),
        note: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_campaign_products")
      .update({ weight: data.weight, note: data.note ?? null })
      .eq("id", data.linkId);
    if (error) throw error;
    return { ok: true };
  });

export const unlinkCampaignProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { linkId: string }) =>
    z.object({ linkId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMktRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_campaign_products")
      .delete()
      .eq("id", data.linkId);
    if (error) throw error;
    return { ok: true };
  });
