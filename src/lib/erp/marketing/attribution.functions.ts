import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Attribution priority:
 *   1. Order has utm_campaign → match against mkt_campaigns.name (or external_id) — 0.95
 *   2. Order has fbclid → tracking event with same fbclid → utm_campaign → match — 0.85
 *   3. Phone match in tracking events (last 30d) → utm_campaign → match — 0.65
 *   4. Product link fallback (mkt_campaign_products) — pick highest weight — 0.40
 */

async function assertRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

function norm(s: string | null | undefined) {
  return (s || "").trim().toLowerCase();
}

async function findCampaignByName(supabase: any, brandId: string, name: string | null | undefined) {
  const n = norm(name);
  if (!n) return null;
  const { data } = await supabase
    .from("mkt_campaigns")
    .select("id, name, external_id")
    .eq("brand_id", brandId);
  for (const c of data ?? []) {
    if (norm(c.name) === n || norm(c.external_id) === n) return c;
  }
  // looser contains
  for (const c of data ?? []) {
    if (norm(c.name).includes(n) || n.includes(norm(c.name))) return c;
  }
  return null;
}

async function resolveOne(supabase: any, orderId: string): Promise<{
  attributed: boolean;
  source?: string;
  campaign_id?: string;
  confidence?: number;
}> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, brand_id, shipping_phone, guest_phone, utm_campaign, utm_source, utm_medium, utm_content, utm_term, fbclid")
    .eq("id", orderId)
    .single();
  if (error || !order) throw error || new Error("order_not_found");

  const baseUtm = {
    utm_campaign: order.utm_campaign,
    utm_source: order.utm_source,
    utm_medium: order.utm_medium,
    utm_content: order.utm_content,
    utm_term: order.utm_term,
    fbclid: order.fbclid,
  };

  // 1) direct utm_campaign on the order
  if (order.utm_campaign) {
    const c = await findCampaignByName(supabase, order.brand_id, order.utm_campaign);
    if (c) {
      await upsertAttribution(supabase, {
        order_id: orderId, brand_id: order.brand_id,
        campaign_id: c.id, source: "utm", confidence: 0.95, ...baseUtm,
      });
      await autoLinkOrderProducts(supabase, orderId, c.id, order.brand_id);
      return { attributed: true, source: "utm", campaign_id: c.id, confidence: 0.95 };
    }
  }

  // 2) fbclid → tracking event → utm_campaign
  if (order.fbclid) {
    const { data: ev } = await supabase
      .from("mkt_tracking_events")
      .select("utm_campaign, utm_source, utm_medium, utm_content, utm_term")
      .eq("fbclid", order.fbclid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ev?.utm_campaign) {
      const c = await findCampaignByName(supabase, order.brand_id, ev.utm_campaign);
      if (c) {
        await upsertAttribution(supabase, {
          order_id: orderId, brand_id: order.brand_id,
          campaign_id: c.id, source: "pixel", confidence: 0.85,
          utm_campaign: ev.utm_campaign,
          utm_source: ev.utm_source, utm_medium: ev.utm_medium,
          utm_content: ev.utm_content, utm_term: ev.utm_term,
          fbclid: order.fbclid,
        });
        await autoLinkOrderProducts(supabase, orderId, c.id, order.brand_id);
        return { attributed: true, source: "pixel", campaign_id: c.id, confidence: 0.85 };
      }
    }
  }

  // 3) phone match in tracking events
  const phoneRaw = order.shipping_phone || order.guest_phone;
  if (phoneRaw) {
    const phone = String(phoneRaw).replace(/\D/g, "").slice(-11);
    if (phone) {
      const { data: ev } = await supabase
        .from("mkt_tracking_events")
        .select("utm_campaign, utm_source, utm_medium, utm_content, utm_term")
        .ilike("phone", `%${phone}`)
        .not("utm_campaign", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ev?.utm_campaign) {
        const c = await findCampaignByName(supabase, order.brand_id, ev.utm_campaign);
        if (c) {
          await upsertAttribution(supabase, {
            order_id: orderId, brand_id: order.brand_id,
            campaign_id: c.id, source: "phone_match", confidence: 0.65,
            utm_campaign: ev.utm_campaign,
            utm_source: ev.utm_source, utm_medium: ev.utm_medium,
            utm_content: ev.utm_content, utm_term: ev.utm_term,
          });
          await autoLinkOrderProducts(supabase, orderId, c.id, order.brand_id);
          return { attributed: true, source: "phone_match", campaign_id: c.id, confidence: 0.65 };
        }
      }
    }
  }

  // 4) product link fallback
  const { data: items } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  const productIds = (items ?? []).map((i: any) => i.product_id).filter(Boolean);
  if (productIds.length) {
    const { data: links } = await supabase
      .from("mkt_campaign_products")
      .select("campaign_id, weight, mkt_campaigns!inner(brand_id)")
      .in("product_id", productIds)
      .eq("mkt_campaigns.brand_id", order.brand_id);
    if (links && links.length) {
      // tally weights per campaign
      const tally = new Map<string, number>();
      for (const l of links as any[]) {
        tally.set(l.campaign_id, (tally.get(l.campaign_id) ?? 0) + Number(l.weight ?? 1));
      }
      let best: { id: string; w: number } | null = null;
      for (const [id, w] of tally) {
        if (!best || w > best.w) best = { id, w };
      }
      if (best) {
        await upsertAttribution(supabase, {
          order_id: orderId, brand_id: order.brand_id,
          campaign_id: best.id, source: "product_link", confidence: 0.4,
          ...baseUtm,
        });
        return { attributed: true, source: "product_link", campaign_id: best.id, confidence: 0.4 };
      }
    }
  }

  return { attributed: false };
}

async function upsertAttribution(supabase: any, row: any) {
  const { error } = await supabase
    .from("mkt_order_attributions")
    .upsert(row, { onConflict: "order_id" });
  if (error) throw error;
}

/**
 * Auto-link the products in this order to the attributed campaign.
 * Idempotent: skips (campaign_id, product_id) pairs that already exist.
 * New links start at weight 1 with note "auto:attribution".
 */
async function autoLinkOrderProducts(
  supabase: any,
  orderId: string,
  campaignId: string,
  brandId: string,
) {
  const { data: items } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  const productIds = Array.from(
    new Set((items ?? []).map((i: any) => i.product_id).filter(Boolean)),
  ) as string[];
  if (!productIds.length) return;

  const { data: existing } = await supabase
    .from("mkt_campaign_products")
    .select("product_id")
    .eq("campaign_id", campaignId)
    .in("product_id", productIds);
  const have = new Set((existing ?? []).map((r: any) => r.product_id));
  const rows = productIds
    .filter((pid) => !have.has(pid))
    .map((pid) => ({
      campaign_id: campaignId,
      product_id: pid,
      brand_id: brandId,
      weight: 1,
      note: "auto:attribution",
    }));
  if (!rows.length) return;
  await supabase
    .from("mkt_campaign_products")
    .upsert(rows, { onConflict: "campaign_id,product_id", ignoreDuplicates: true });
}

/* ---------------- public server fns ---------------- */

export const resolveOrderAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) =>
    z.object({ orderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    return resolveOne(context.supabase, data.orderId);
  });

export const bulkResolveAttributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; days?: number }) =>
    z.object({ brandId: z.string().uuid(), days: z.number().int().min(1).max(180).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    // Find orders without attribution
    const { data: existing } = await context.supabase
      .from("mkt_order_attributions")
      .select("order_id")
      .eq("brand_id", data.brandId);
    const attributedSet = new Set((existing ?? []).map((r: any) => r.order_id));

    const { data: orders } = await context.supabase
      .from("orders")
      .select("id")
      .eq("brand_id", data.brandId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    const targets = (orders ?? []).filter((o: any) => !attributedSet.has(o.id));

    let attributed = 0;
    let failed = 0;
    for (const o of targets) {
      try {
        const r = await resolveOne(context.supabase, o.id);
        if (r.attributed) attributed++;
      } catch {
        failed++;
      }
    }
    return { scanned: targets.length, attributed, unattributed: targets.length - attributed - failed, failed };
  });

export const setManualAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; campaignId: string; note?: string }) =>
    z.object({
      orderId: z.string().uuid(),
      campaignId: z.string().uuid(),
      note: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("brand_id")
      .eq("id", data.orderId)
      .single();
    if (error) throw error;
    await upsertAttribution(context.supabase, {
      order_id: data.orderId,
      brand_id: order.brand_id,
      campaign_id: data.campaignId,
      source: "manual",
      confidence: 1.0,
      note: data.note ?? null,
    });
    return { ok: true };
  });

export const clearAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) =>
    z.object({ orderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_order_attributions")
      .delete()
      .eq("order_id", data.orderId);
    if (error) throw error;
    return { ok: true };
  });

export const listAttributionOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; mode: "unattributed" | "attributed"; days?: number }) =>
    z.object({
      brandId: z.string().uuid(),
      mode: z.enum(["unattributed", "attributed"]),
      days: z.number().int().min(1).max(365).default(30),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const supabase = context.supabase;

    const { data: attrs } = await supabase
      .from("mkt_order_attributions")
      .select("order_id, campaign_id, source, confidence, mkt_campaigns:campaign_id(name)")
      .eq("brand_id", data.brandId);
    const attrMap = new Map<string, any>();
    for (const a of attrs ?? []) attrMap.set(a.order_id, a);

    const { data: orders } = await supabase
      .from("orders")
      .select("id, invoice_no, created_at, status, total, shipping_phone, guest_phone, shipping_name, guest_name, utm_campaign, utm_source, fbclid")
      .eq("brand_id", data.brandId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    const rows = (orders ?? [])
      .map((o: any) => ({
        ...o,
        order_number: o.invoice_no,
        total_amount: o.total,
        customer_phone: o.shipping_phone || o.guest_phone,
        customer_name: o.shipping_name || o.guest_name,
        attribution: attrMap.get(o.id) ?? null,
      }))
      .filter((o: any) =>
        data.mode === "unattributed" ? !o.attribution : !!o.attribution,
      );
    return rows;
  });

export const listBrandCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) =>
    z.object({ brandId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("mkt_campaigns")
      .select("id, name, status")
      .eq("brand_id", data.brandId)
      .order("name");
    return rows ?? [];
  });

/**
 * Backfill: for every existing attributed order in a brand, auto-link
 * the order's products to that campaign (mkt_campaign_products).
 * Idempotent — existing (campaign_id, product_id) pairs are skipped.
 */
export const backfillCampaignProductLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null }) =>
    z.object({ brandId: z.string().uuid().nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const supabase = context.supabase;

    let q = supabase
      .from("mkt_order_attributions")
      .select("order_id, campaign_id, brand_id");
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: attrs, error } = await q;
    if (error) throw error;

    const orderIds = Array.from(new Set((attrs ?? []).map((a: any) => a.order_id)));
    if (!orderIds.length) return { scanned: 0, linked: 0, skipped: 0 };

    // Batch fetch all order_items for these orders
    const itemsByOrder = new Map<string, string[]>();
    const CHUNK = 500;
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const slice = orderIds.slice(i, i + CHUNK);
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, product_id")
        .in("order_id", slice);
      for (const it of items ?? []) {
        if (!it.product_id) continue;
        const list = itemsByOrder.get(it.order_id) ?? [];
        list.push(it.product_id);
        itemsByOrder.set(it.order_id, list);
      }
    }

    // Build per-campaign product set
    const perCampaign = new Map<string, { brand_id: string; products: Set<string> }>();
    for (const a of attrs ?? []) {
      if (!a.campaign_id || !a.brand_id) continue;
      const pids = itemsByOrder.get(a.order_id) ?? [];
      if (!pids.length) continue;
      const entry = perCampaign.get(a.campaign_id) ?? { brand_id: a.brand_id, products: new Set<string>() };
      for (const p of pids) entry.products.add(p);
      perCampaign.set(a.campaign_id, entry);
    }

    let linked = 0;
    let skipped = 0;
    for (const [campaignId, { brand_id, products }] of perCampaign) {
      const productIds = Array.from(products);
      const { data: existing } = await supabase
        .from("mkt_campaign_products")
        .select("product_id")
        .eq("campaign_id", campaignId)
        .in("product_id", productIds);
      const have = new Set((existing ?? []).map((r: any) => r.product_id));
      const rows = productIds
        .filter((pid) => !have.has(pid))
        .map((pid) => ({
          campaign_id: campaignId,
          product_id: pid,
          brand_id,
          weight: 1,
          note: "auto:backfill",
        }));
      skipped += productIds.length - rows.length;
      if (!rows.length) continue;
      const { error: upErr } = await supabase
        .from("mkt_campaign_products")
        .upsert(rows, { onConflict: "campaign_id,product_id", ignoreDuplicates: true });
      if (!upErr) linked += rows.length;
    }
    return { scanned: orderIds.length, linked, skipped };
  });