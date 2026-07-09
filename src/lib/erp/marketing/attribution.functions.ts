import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 3 Attribution priority + tiering:
 *   1. Order has utm_campaign → match against mkt_campaigns.name (or external_id) — 0.95
 *   2. Order has fbclid → tracking event with same fbclid → utm_campaign → match — 0.85
 *   3. Phone match in tracking events (within 24h BEFORE order.created_at) → utm_campaign → 0.65
 *   4. Product link fallback (mkt_campaign_products) — pick highest weight — 0.40
 *
 * Confidence tiers:
 *   high   >= 0.85  → auto-write to mkt_order_attributions (via guard RPC)
 *   medium >= 0.60  → auto-write to mkt_order_attributions (via guard RPC)
 *   low    <  0.60  → write to mkt_attribution_candidates (review queue), NOT to attributions
 */

export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MEDIUM = 0.60;
export const PHONE_WINDOW_HOURS = 24;

function tierOf(conf: number): "high" | "medium" | "low" {
  if (conf >= CONFIDENCE_HIGH) return "high";
  if (conf >= CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

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

/**
 * Compute the best attribution candidate for an order — pure decision,
 * no writes. Used by both live resolve and preview/dry-run.
 */
async function computeCandidate(supabase: any, orderId: string): Promise<
  | { matched: false; order: any }
  | {
      matched: true;
      order: any;
      source: "utm" | "pixel" | "phone_match" | "product_link";
      campaign_id: string;
      confidence: number;
      utm: any;
      signal: Record<string, any>;
    }
> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, brand_id, created_at, shipping_phone, guest_phone, utm_campaign, utm_source, utm_medium, utm_content, utm_term, fbclid")
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
      return {
        matched: true, order, source: "utm", campaign_id: c.id, confidence: 0.95,
        utm: baseUtm, signal: { utm_campaign: order.utm_campaign },
      };
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
        return {
          matched: true, order, source: "pixel", campaign_id: c.id, confidence: 0.85,
          utm: {
            utm_campaign: ev.utm_campaign, utm_source: ev.utm_source,
            utm_medium: ev.utm_medium, utm_content: ev.utm_content,
            utm_term: ev.utm_term, fbclid: order.fbclid,
          },
          signal: { fbclid: order.fbclid },
        };
      }
    }
  }

  // 3) phone match in tracking events, within 24h BEFORE order.created_at
  const phoneRaw = order.shipping_phone || order.guest_phone;
  if (phoneRaw) {
    const phone = String(phoneRaw).replace(/\D/g, "").slice(-11);
    if (phone) {
      const orderTs = new Date(order.created_at).getTime();
      const windowStart = new Date(orderTs - PHONE_WINDOW_HOURS * 3600_000).toISOString();
      const windowEnd = new Date(orderTs).toISOString();
      const { data: ev } = await supabase
        .from("mkt_tracking_events")
        .select("utm_campaign, utm_source, utm_medium, utm_content, utm_term, created_at")
        .ilike("phone", `%${phone}`)
        .not("utm_campaign", "is", null)
        .gte("created_at", windowStart)
        .lte("created_at", windowEnd)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ev?.utm_campaign) {
        const c = await findCampaignByName(supabase, order.brand_id, ev.utm_campaign);
        if (c) {
          const gapMs = orderTs - new Date(ev.created_at).getTime();
          return {
            matched: true, order, source: "phone_match", campaign_id: c.id, confidence: 0.65,
            utm: {
              utm_campaign: ev.utm_campaign, utm_source: ev.utm_source,
              utm_medium: ev.utm_medium, utm_content: ev.utm_content,
              utm_term: ev.utm_term,
            },
            signal: { phone, gap_hours: Math.round(gapMs / 3600_000 * 10) / 10 },
          };
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
      const tally = new Map<string, number>();
      for (const l of links as any[]) {
        tally.set(l.campaign_id, (tally.get(l.campaign_id) ?? 0) + Number(l.weight ?? 1));
      }
      let best: { id: string; w: number } | null = null;
      for (const [id, w] of tally) {
        if (!best || w > best.w) best = { id, w };
      }
      if (best) {
        return {
          matched: true, order, source: "product_link", campaign_id: best.id, confidence: 0.4,
          utm: baseUtm, signal: { product_ids: productIds, weight: best.w },
        };
      }
    }
  }

  return { matched: false, order };
}

async function upsertCandidate(supabase: any, cand: {
  order_id: string; brand_id: string; campaign_id: string;
  source: string; confidence: number; signal: any;
}) {
  const { error } = await supabase
    .from("mkt_attribution_candidates")
    .upsert(
      {
        order_id: cand.order_id,
        brand_id: cand.brand_id,
        suggested_campaign_id: cand.campaign_id,
        source: cand.source,
        confidence: cand.confidence,
        matched_signal: cand.signal,
        status: "pending",
      },
      { onConflict: "order_id" },
    );
  if (error) throw error;
}

/**
 * Live resolve: compute candidate, then route by tier.
 * high/medium → write attribution (via guard RPC) + auto-link products
 * low         → write to mkt_attribution_candidates review queue
 */
async function resolveOne(supabase: any, orderId: string): Promise<{
  attributed: boolean;
  queued?: boolean;
  tier?: "high" | "medium" | "low";
  source?: string;
  campaign_id?: string;
  confidence?: number;
}> {
  const r = await computeCandidate(supabase, orderId);
  if (!r.matched) return { attributed: false };

  const tier = tierOf(r.confidence);
  if (tier === "low") {
    await upsertCandidate(supabase, {
      order_id: orderId,
      brand_id: r.order.brand_id,
      campaign_id: r.campaign_id,
      source: r.source,
      confidence: r.confidence,
      signal: r.signal,
    });
    return { attributed: false, queued: true, tier, source: r.source, campaign_id: r.campaign_id, confidence: r.confidence };
  }

  await upsertAttribution(supabase, {
    order_id: orderId,
    brand_id: r.order.brand_id,
    campaign_id: r.campaign_id,
    source: r.source,
    confidence: r.confidence,
    ...r.utm,
  });
  await autoLinkOrderProducts(supabase, orderId, r.campaign_id, r.order.brand_id);
  return { attributed: true, tier, source: r.source, campaign_id: r.campaign_id, confidence: r.confidence };
}

async function upsertAttribution(supabase: any, row: any) {
  // Race-safe: RPC enforces manual-protect + confidence guards, and
  // takes a pg_advisory_xact_lock keyed on order_id so concurrent
  // bulk + single resolvers on the same order serialize.
  const { data, error } = await supabase.rpc("mkt_upsert_order_attribution", {
    _order_id:     row.order_id,
    _brand_id:     row.brand_id,
    _campaign_id:  row.campaign_id ?? null,
    _adset_id:     row.adset_id ?? null,
    _ad_id:        row.ad_id ?? null,
    _source:       row.source ?? null,
    _confidence:   row.confidence ?? null,
    _utm_source:   row.utm_source ?? null,
    _utm_medium:   row.utm_medium ?? null,
    _utm_campaign: row.utm_campaign ?? null,
    _utm_content:  row.utm_content ?? null,
    _utm_term:     row.utm_term ?? null,
    _fbclid:       row.fbclid ?? null,
    _note:         row.note ?? null,
  });
  if (error) throw error;
  return data as { written: boolean; reason?: string } | null;
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

    // Skip only orders that already have a resolved campaign.
    // auto_unmatched rows (campaign_id NULL) MUST be re-tried.
    const { data: existing } = await context.supabase
      .from("mkt_order_attributions")
      .select("order_id, campaign_id")
      .eq("brand_id", data.brandId)
      .not("campaign_id", "is", null);
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

/* ---------------- Phase 3: preview / candidates ---------------- */

/**
 * Dry-run: run computeCandidate over recent orders without writing.
 * Returns tier breakdown, would-flip diffs vs existing attributions,
 * phone-match gap distribution, and existing low-conf demote proposal.
 */
export const previewBulkResolve = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; days?: number }) =>
    z.object({ brandId: z.string().uuid(), days: z.number().int().min(1).max(365).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const supabase = context.supabase;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("brand_id", data.brandId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    const orderIds = (orders ?? []).map((o: any) => o.id);

    const { data: existing } = await supabase
      .from("mkt_order_attributions")
      .select("order_id, campaign_id, source, confidence, mkt_campaigns:campaign_id(name)")
      .eq("brand_id", data.brandId)
      .in("order_id", orderIds.length ? orderIds : ["00000000-0000-0000-0000-000000000000"]);
    const existingMap = new Map<string, any>();
    for (const a of existing ?? []) existingMap.set(a.order_id, a);

    // campaign name lookup for diff readability
    const { data: campRows } = await supabase
      .from("mkt_campaigns")
      .select("id, name")
      .eq("brand_id", data.brandId);
    const campName = new Map<string, string>();
    for (const c of campRows ?? []) campName.set(c.id, c.name);

    let scanned = 0;
    let would_attribute_high = 0;
    let would_attribute_medium = 0;
    let would_queue_low = 0;
    let no_match = 0;
    const would_flip_existing: any[] = [];
    const phoneGaps: number[] = [];
    const bySource: Record<string, number> = {};

    for (const o of orders ?? []) {
      scanned++;
      let r;
      try {
        r = await computeCandidate(supabase, o.id);
      } catch {
        continue;
      }
      if (!r.matched) { no_match++; continue; }
      const tier = tierOf(r.confidence);
      bySource[r.source] = (bySource[r.source] ?? 0) + 1;
      if (tier === "high") would_attribute_high++;
      else if (tier === "medium") would_attribute_medium++;
      else would_queue_low++;
      if (r.source === "phone_match" && typeof r.signal?.gap_hours === "number") {
        phoneGaps.push(r.signal.gap_hours);
      }
      const cur = existingMap.get(o.id);
      if (cur && cur.campaign_id && cur.campaign_id !== r.campaign_id) {
        would_flip_existing.push({
          order_id: o.id,
          old_campaign_id: cur.campaign_id,
          old_campaign_name: cur.mkt_campaigns?.name ?? null,
          old_source: cur.source,
          old_confidence: Number(cur.confidence),
          new_campaign_id: r.campaign_id,
          new_campaign_name: campName.get(r.campaign_id) ?? null,
          new_source: r.source,
          new_confidence: r.confidence,
          new_tier: tier,
        });
      }
    }

    // Phone-match gap distribution
    phoneGaps.sort((a, b) => a - b);
    const percentile = (p: number) =>
      phoneGaps.length ? phoneGaps[Math.min(phoneGaps.length - 1, Math.floor(phoneGaps.length * p))] : null;
    const phone_gap = {
      n: phoneGaps.length,
      median_h: percentile(0.5),
      p90_h: percentile(0.9),
      p95_h: percentile(0.95),
      max_h: phoneGaps.length ? phoneGaps[phoneGaps.length - 1] : null,
    };

    // Existing low-conf demote proposal (product_link < 0.60 currently in attributions)
    const { data: lowConfRows, count: low_conf_existing_count } = await supabase
      .from("mkt_order_attributions")
      .select("order_id, source, confidence", { count: "exact" })
      .eq("brand_id", data.brandId)
      .lt("confidence", CONFIDENCE_MEDIUM)
      .neq("source", "manual");

    return {
      window_days: data.days,
      scanned,
      no_match,
      would_attribute_high,
      would_attribute_medium,
      would_queue_low,
      would_flip_count: would_flip_existing.length,
      would_flip_sample: would_flip_existing.slice(0, 25),
      by_source: bySource,
      phone_gap_distribution_hours: phone_gap,
      existing_low_conf_in_attributions: {
        count: low_conf_existing_count ?? (lowConfRows?.length ?? 0),
        note: "These are already-written attributions with confidence < 0.60 (excludes manual). Under new tier gate they would belong in the candidates queue. NOT auto-demoted — proposal only.",
      },
      thresholds: { high: CONFIDENCE_HIGH, medium: CONFIDENCE_MEDIUM, phone_window_hours: PHONE_WINDOW_HOURS },
    };
  });

export const listAttributionCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; status?: "pending" | "accepted" | "dismissed" }) =>
    z.object({
      brandId: z.string().uuid(),
      status: z.enum(["pending", "accepted", "dismissed"]).default("pending"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mkt_attribution_candidates")
      .select("id, order_id, brand_id, suggested_campaign_id, source, confidence, matched_signal, status, created_at, mkt_campaigns:suggested_campaign_id(name)")
      .eq("brand_id", data.brandId)
      .eq("status", data.status)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const list = rows ?? [];
    if (!list.length) return [];
    const orderIds = list.map((r: any) => r.order_id);
    const { data: orders } = await context.supabase
      .from("orders")
      .select("id, invoice_no, created_at, total, shipping_phone, guest_phone, shipping_name, guest_name, utm_campaign, fbclid")
      .in("id", orderIds);
    const oMap = new Map<string, any>();
    for (const o of orders ?? []) oMap.set(o.id, o);
    const enriched = list.map((r: any) => {
      const o = oMap.get(r.order_id) ?? {};
      return {
        ...r,
        order_number: o.invoice_no ?? null,
        order_created_at: o.created_at ?? null,
        total_amount: Number(o.total ?? 0),
        customer_name: o.shipping_name || o.guest_name || null,
        customer_phone: o.shipping_phone || o.guest_phone || null,
        utm_campaign: o.utm_campaign ?? null,
        fbclid: o.fbclid ?? null,
      };
    });
    enriched.sort((a: any, b: any) => b.total_amount - a.total_amount);
    return enriched;
  });

export const acceptAttributionCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { candidateId: string }) =>
    z.object({ candidateId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const supabase = context.supabase;
    const { data: cand, error } = await supabase
      .from("mkt_attribution_candidates")
      .select("*")
      .eq("id", data.candidateId)
      .single();
    if (error) throw error;
    if (!cand.suggested_campaign_id) throw new Error("candidate_has_no_campaign");
    // Accept as manual — confidence 1.0, protected
    await upsertAttribution(supabase, {
      order_id: cand.order_id,
      brand_id: cand.brand_id,
      campaign_id: cand.suggested_campaign_id,
      source: "manual",
      confidence: 1.0,
      note: `accepted_candidate:${cand.source}`,
    });
    await autoLinkOrderProducts(supabase, cand.order_id, cand.suggested_campaign_id, cand.brand_id);
    await supabase
      .from("mkt_attribution_candidates")
      .update({ status: "accepted" })
      .eq("id", data.candidateId);
    return { ok: true };
  });

export const dismissAttributionCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { candidateId: string }) =>
    z.object({ candidateId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("mkt_attribution_candidates")
      .update({ status: "dismissed" })
      .eq("id", data.candidateId);
    if (error) throw error;
    return { ok: true };
  });