import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCourierRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

async function clientForBrand(supabase: any, brandId?: string | null) {
  const { createPathaoClient, loadPathaoCreds } = await import("./pathao.server");
  const creds = await loadPathaoCreds(supabase, brandId ?? null);
  return createPathaoClient(creds);
}

/**
 * Remove any existing courier_shipments rows for this order whose status
 * looks cancelled (e.g. "Pickup_Cancelled", "Cancelled", "Canceled").
 * Lets the user re-book a fresh consignment without keeping stale history.
 */
async function purgeCancelledShipments(supabase: any, orderId: string) {
  const { data: rows } = await supabase
    .from("courier_shipments")
    .select("id, status")
    .eq("order_id", orderId);
  const ids = ((rows ?? []) as Array<{ id: string; status: string | null }>)
    .filter((r) => /cancel/i.test(r.status ?? ""))
    .map((r) => r.id);
  if (ids.length > 0) {
    await supabase.from("courier_shipments").delete().in("id", ids);
  }
}

function readPositiveNumber(payload: any, keys: string[]): number | null {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const seen = new Set<any>();
  const visit = (node: any): number | null => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (wanted.has(key.toLowerCase()) && value !== undefined && value !== null && value !== "") {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    for (const value of Object.values(node)) {
      const found = visit(value);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(payload?.data ?? payload);
}

function pathaoActualCost(result: any, deliveryFee: number, codAmount: number, cityId?: number | null) {
  const rawTotalCost = readPositiveNumber(result, [
    "total_cost",
    "total_delivery_cost",
    "merchant_total_cost",
    "courier_charge",
  ]);
  const cod =
    readPositiveNumber(result, ["cod_fee", "cod_charge", "collection_fee"]) ??
    Math.round(Math.max(codAmount, 0) * 0.01 * 100) / 100;
  // Pathao order response er `delivery_fee` base charge hoye ashe; merchant standing
  // discount na thakle Dhaka 15 / outside 10 apply korte hobe.
  const discount =
    readPositiveNumber(result, [
      "discount",
      "discount_amount",
      "merchant_discount",
      "promo_discount",
      "promo_discount_amount",
    ]) ?? (cityId === 1 ? 15 : 10);
  const promo = 0;
  const additional = readPositiveNumber(result, ["additional_charge", "extra_charge", "weight_charge", "insurance_fee"]) ?? 0;
  const compensation = readPositiveNumber(result, ["compensation_cost", "compensation"]) ?? 0;
  const computed = deliveryFee > 0 ? deliveryFee + cod + additional + compensation - discount - promo : 0;
  const maxReasonableTotal = Math.max(500, Math.max(codAmount, 0) * 0.5);
  const totalCost = rawTotalCost && rawTotalCost <= maxReasonableTotal ? rawTotalCost : null;
  const total = totalCost && totalCost > 0 ? totalCost : computed;
  const rounded = total > 0 ? Math.round(total * 100) / 100 : 0;
  return {
    total: rounded,
    breakdown: { delivery: deliveryFee, cod, discount, promo_discount: promo, additional, compensation, extra: additional + compensation, total: rounded },
  };
}

export const pathaoCitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid().optional() }).optional().parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data?.brandId);
    return { items: await client.cities() };
  });

export const pathaoZonesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cityId: z.number().int().positive(), brandId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    return { items: await client.zones(data.cityId) };
  });

export const pathaoAreasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ zoneId: z.number().int().positive(), brandId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    return { items: await client.areas(data.zoneId) };
  });

/* ---------------------------------------------------------------------- */
/*  AI-powered address → Pathao city/zone/area detection                  */
/* ---------------------------------------------------------------------- */

type PickItem = { id: number; name: string };

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[।,.\-_/\\()[\]{}'"`!?:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fast local fuzzy match. Returns a high-confidence pick when the address
 * clearly contains an item name (substring / word match). Avoids a network
 * round-trip to the AI gateway in the common case.
 */
function localPick(address: string, items: PickItem[]): { id: number; name: string } | null {
  const addr = " " + normalizeText(address) + " ";
  let best: { id: number; name: string; score: number } | null = null;
  for (const it of items) {
    const name = normalizeText(it.name);
    if (!name || name.length < 2) continue;
    const padded = " " + name + " ";
    let score = 0;
    if (addr.includes(padded)) score = name.length * 3; // whole-word match
    else if (addr.includes(name)) score = name.length * 2; // substring
    if (score > 0 && (!best || score > best.score)) {
      best = { id: it.id, name: it.name, score };
    }
  }
  // Require a reasonably specific match (avoid 2-char accidental hits)
  return best && best.score >= 6 ? { id: best.id, name: best.name } : null;
}

async function aiPickFromList(opts: {
  address: string;
  stage: "city" | "zone" | "area";
  parentLabel?: string;
  items: PickItem[];
}): Promise<{ id: number | null; name: string | null; confidence: number }> {
  // 1) Try ultra-fast local match first
  const local = localPick(opts.address, opts.items);
  if (local) return { id: local.id, name: local.name, confidence: 0.95 };

  const apiKey = process.env.GEMINI_API_KEY || process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const useGemini = !!process.env.GEMINI_API_KEY;

  const stageLabel = opts.stage === "city"
    ? "Pathao city/district"
    : opts.stage === "zone"
      ? `Pathao zone (delivery sub-area inside ${opts.parentLabel ?? "the selected city"})`
      : `Pathao area (specific neighbourhood inside ${opts.parentLabel ?? "the selected zone"})`;

  const list = opts.items.map((i) => `${i.id}\t${i.name}`).join("\n");

  const system =
    "You are an expert Bangladeshi address parser for Pathao courier. " +
    "Given a customer-written shipping address (often mixed Bangla/English, with informal spellings), " +
    "select the SINGLE best matching entry from a provided list. " +
    "Always prefer an exact or near-exact name match. If the address mentions a well-known landmark, " +
    "infer the correct administrative location. Never invent an id that is not in the list. " +
    'Respond ONLY as JSON: {"id": <number or null>, "name": <string or null>, "confidence": <0..1>}. ' +
    "If nothing in the list reasonably matches, return id=null.";

  const user =
    `Customer address:\n"""${opts.address}"""\n\n` +
    `Pick the best ${stageLabel} from this list (format: <id>\\t<name>):\n${list}`;

  const url = useGemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: useGemini ? "gemini-2.5-flash-lite" : "google/gemini-3.1-flash-lite-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit exceeded. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway error (${res.status}): ${txt.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: { id?: number | null; name?: string | null; confidence?: number } = {};
  try { parsed = JSON.parse(content); } catch { parsed = {}; }

  const id = typeof parsed.id === "number" ? parsed.id : null;
  // Verify the id actually exists in our list (no hallucinations)
  const match = id != null ? opts.items.find((i) => i.id === id) ?? null : null;
  return {
    id: match?.id ?? null,
    name: match?.name ?? null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
  };
}

export const pathaoDetectAddressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        address: z.string().min(3).max(2000),
        brandId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);

    // 1) City
    const citiesRaw = (await client.cities()) as Array<{ city_id: number; city_name: string }>;
    const cityPick = await aiPickFromList({
      address: data.address,
      stage: "city",
      items: citiesRaw.map((c) => ({ id: c.city_id, name: c.city_name })),
    });
    if (!cityPick.id) {
      return { city: null, zone: null, area: null, confidence: cityPick.confidence };
    }

    // 2) Zone
    const zonesRaw = (await client.zones(cityPick.id)) as Array<{ zone_id: number; zone_name: string }>;
    const zonePick = await aiPickFromList({
      address: data.address,
      stage: "zone",
      parentLabel: cityPick.name ?? undefined,
      items: zonesRaw.map((z) => ({ id: z.zone_id, name: z.zone_name })),
    });
    if (!zonePick.id) {
      return {
        city: { id: cityPick.id, name: cityPick.name },
        zone: null,
        area: null,
        confidence: cityPick.confidence,
      };
    }

    // 3) Area (optional — many zones have a large list; still try)
    const areasRaw = (await client.areas(zonePick.id)) as Array<{ area_id: number; area_name: string }>;
    let areaPick: { id: number | null; name: string | null; confidence: number } = { id: null, name: null, confidence: 0 };
    if (areasRaw.length > 0) {
      areaPick = await aiPickFromList({
        address: data.address,
        stage: "area",
        parentLabel: zonePick.name ?? undefined,
        items: areasRaw.map((a) => ({ id: a.area_id, name: a.area_name })),
      });
    }

    return {
      city: { id: cityPick.id, name: cityPick.name },
      zone: { id: zonePick.id, name: zonePick.name },
      area: areaPick.id ? { id: areaPick.id, name: areaPick.name } : null,
      confidence: Math.min(cityPick.confidence, zonePick.confidence, areaPick.confidence || 1),
    };
  });

export const pathaoPriceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        item_weight: z.number().positive(),
        recipient_city: z.number().int().positive(),
        recipient_zone: z.number().int().positive(),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
        brandId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    const { brandId: _b, ...rest } = data;
    return { price: await client.price({ store_id: client.storeId, ...rest }) };
  });

export const pathaoBookOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        recipient_city: z.number().int().positive(),
        recipient_zone: z.number().int().positive(),
        recipient_area: z.number().int().positive().optional(),
        item_weight: z.number().positive(),
        item_quantity: z.number().int().positive().default(1),
        amount_to_collect: z.number().nonnegative(),
        item_description: z.string().max(500).optional(),
        special_instruction: z.string().max(500).optional(),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase, userId } = context;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, brand_id, shipping_name, shipping_phone, guest_name, guest_phone, shipping_address, shipping_thana, shipping_city, total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) throw new Error("Order not found");

    const name = order.shipping_name || order.guest_name || "Customer";
    const phone = order.shipping_phone || order.guest_phone || "";
    const address = [order.shipping_address, order.shipping_thana, order.shipping_city].filter(Boolean).join(", ");

    // Drop any prior cancelled shipments so we start fresh
    await purgeCancelledShipments(supabase, order.id);

    const client = await clientForBrand(supabase, order.brand_id);
    const merchantId = order.id.slice(0, 8).toUpperCase();
    const result: any = await client.createOrder({
      store_id: client.storeId,
      merchant_order_id: merchantId,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      recipient_city: data.recipient_city,
      recipient_zone: data.recipient_zone,
      recipient_area: data.recipient_area,
      delivery_type: data.delivery_type,
      item_type: data.item_type,
      special_instruction: data.special_instruction,
      item_quantity: data.item_quantity,
      item_weight: data.item_weight,
      amount_to_collect: data.amount_to_collect,
      item_description: data.item_description,
    });

    const consignment = result?.consignment_id || result?.data?.consignment_id || null;
    const tracking = result?.tracking_code || result?.data?.tracking_code || null;
    const fee = readPositiveNumber(result, ["delivery_fee", "delivery_charge", "normal_delivery", "same_day_delivery"]) ?? 0;
    const actualCost = pathaoActualCost(result, fee, data.amount_to_collect, data.recipient_city);
    const status = result?.order_status || result?.data?.order_status || "Pickup_Requested";

    const { data: shipment, error: sErr } = await supabase
      .from("courier_shipments")
      .insert({
        order_id: order.id,
        brand_id: order.brand_id,
        provider: "pathao",
        consignment_id: consignment,
        merchant_order_id: merchantId,
        tracking_code: tracking,
        delivery_fee: fee || null,
        status,
        request_payload: data as never,
        response_payload: result as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    if (actualCost.total > 0) {
      await supabase.rpc("record_courier_expense", { _shipment_id: shipment.id, _amount: actualCost.total });
    }

    await supabase
      .from("orders")
      .update({
        courier_name: "pathao",
        courier_assigned_at: new Date().toISOString(),
        tracking_number: consignment ?? undefined,
        pathao_city_id: data.recipient_city,
        pathao_zone_id: data.recipient_zone,
        pathao_area_id: data.recipient_area ?? null,
        ...(actualCost.total > 0 ? {
          actual_shipping_cost: actualCost.total,
          actual_shipping_source: "auto",
          actual_shipping_recorded_at: new Date().toISOString(),
          actual_shipping_breakdown: actualCost.breakdown as never,
        } : {}),
      })
      .eq("id", order.id);

    return { shipmentId: shipment.id, consignment, tracking, fee: actualCost.total || fee, status };
  });

export const pathaoTrackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase } = context;
    const { data: ship, error } = await supabase
      .from("courier_shipments")
      .select("id, consignment_id, provider, brand_id")
      .eq("id", data.shipmentId)
      .maybeSingle();
    if (error) throw error;
    if (!ship?.consignment_id) throw new Error("Shipment has no consignment id");

    const client = await clientForBrand(supabase, ship.brand_id);
    const info: any = await client.track(ship.consignment_id);
    const status = info?.order_status || info?.data?.order_status || info?.status || null;

    if (status) {
      await supabase
        .from("courier_shipments")
        .update({ status, response_payload: info as never, updated_at: new Date().toISOString() })
        .eq("id", ship.id);
    }
    return { status, info };
  });

/**
 * Auto-detect city/zone/area from the order's shipping address (using AI) and
 * book a Pathao consignment in one call. Designed for bulk "Send to Pathao".
 */
export const pathaoBookOrderAutoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        item_weight: z.number().positive().default(0.5),
        item_quantity: z.number().int().positive().default(1),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase, userId } = context;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select(
        "id, invoice_no, brand_id, shipping_name, shipping_phone, guest_name, guest_phone, shipping_address, shipping_thana, shipping_city, shipping_district, total, items:order_items(name, quantity)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) throw new Error("Order not found");

    // Bail early if already booked with Pathao
    const { data: existing } = await supabase
      .from("courier_shipments")
      .select("consignment_id, tracking_code, status")
      .eq("order_id", order.id)
      .eq("provider", "pathao")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const existingIsCancelled = /cancel/i.test(existing?.status ?? "");
    if (existing?.consignment_id && !existingIsCancelled) {
      return {
        skipped: true,
        consignment: existing.consignment_id,
        tracking: existing.tracking_code,
        message: "Already booked",
      };
    }

    // Existing one was cancelled — wipe it and book fresh.
    await purgeCancelledShipments(supabase, order.id);

    const name = order.shipping_name || order.guest_name || "Customer";
    const phone = order.shipping_phone || order.guest_phone || "";
    const address = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
      .filter(Boolean)
      .join(", ");
    if (!phone || address.length < 5) throw new Error("Missing phone or address");

    // Resolve city / zone / area
    const client = await clientForBrand(supabase, order.brand_id);
    const citiesRaw = (await client.cities()) as Array<{ city_id: number; city_name: string }>;
    const cityPick = await aiPickFromList({
      address,
      stage: "city",
      items: citiesRaw.map((c) => ({ id: c.city_id, name: c.city_name })),
    });
    if (!cityPick.id) throw new Error("Could not detect city from address");

    const zonesRaw = (await client.zones(cityPick.id)) as Array<{ zone_id: number; zone_name: string }>;
    const zonePick = await aiPickFromList({
      address,
      stage: "zone",
      parentLabel: cityPick.name ?? undefined,
      items: zonesRaw.map((z) => ({ id: z.zone_id, name: z.zone_name })),
    });
    // Fallback: if AI could not match a zone, pick the first available zone
    // in the detected city so the consignment still goes through. The rider
    // re-routes by phone/address anyway — the zone is just for routing fee.
    let resolvedZoneId = zonePick.id;
    let resolvedZoneName = zonePick.name;
    if (!resolvedZoneId) {
      if (zonesRaw.length === 0) throw new Error("No Pathao zones available for detected city");
      resolvedZoneId = zonesRaw[0].zone_id;
      resolvedZoneName = zonesRaw[0].zone_name + " (fallback)";
    }

    let areaId: number | undefined;
    try {
      const areasRaw = (await client.areas(resolvedZoneId)) as Array<{ area_id: number; area_name: string }>;
      if (areasRaw.length > 0) {
        // Try ultra-fast local match only; skip AI for area to save latency.
        // Area is optional — Pathao routes by phone/address regardless.
        const local = localPick(
          address,
          areasRaw.map((a) => ({ id: a.area_id, name: a.area_name })),
        );
        areaId = local?.id ?? areasRaw[0].area_id;
      }
    } catch { /* area is optional */ }

    const items = (order.items ?? []) as Array<{ name: string | null; quantity: number | null }>;
    const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0) || data.item_quantity;
    const desc = items
      .map((it) => `${it.quantity ?? 1}× ${it.name ?? "item"}`)
      .join(", ")
      .slice(0, 480) || "Order items";

    const merchantId = order.invoice_no || order.id.slice(0, 8).toUpperCase();
    const result: any = await client.createOrder({
      store_id: client.storeId,
      merchant_order_id: merchantId,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      recipient_city: cityPick.id,
      recipient_zone: resolvedZoneId,
      recipient_area: areaId,
      delivery_type: data.delivery_type,
      item_type: data.item_type,
      item_quantity: totalQty,
      item_weight: data.item_weight,
      amount_to_collect: Number(order.total) || 0,
      item_description: desc,
    });

    const consignment = result?.consignment_id || result?.data?.consignment_id || null;
    const tracking = result?.tracking_code || result?.data?.tracking_code || null;
    const fee = readPositiveNumber(result, ["delivery_fee", "delivery_charge", "normal_delivery", "same_day_delivery"]) ?? 0;
    const actualCost = pathaoActualCost(result, fee, Number(order.total) || 0, cityPick.id);
    const status = result?.order_status || result?.data?.order_status || "Pickup_Requested";

    const { data: shipment, error: sErr } = await supabase
      .from("courier_shipments")
      .insert({
        order_id: order.id,
        brand_id: order.brand_id,
        provider: "pathao",
        consignment_id: consignment,
        merchant_order_id: merchantId,
        tracking_code: tracking,
        delivery_fee: fee || null,
        status,
        request_payload: { auto: true, city: cityPick, zone: { id: resolvedZoneId, name: resolvedZoneName }, area: areaId } as never,
        response_payload: result as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    if (actualCost.total > 0) {
      await supabase.rpc("record_courier_expense", { _shipment_id: shipment.id, _amount: actualCost.total });
    }

    await supabase
      .from("orders")
      .update({
        courier_name: "pathao",
        courier_assigned_at: new Date().toISOString(),
        tracking_number: consignment ?? undefined,
        pathao_city_id: cityPick.id,
        pathao_city_name: cityPick.name,
        pathao_zone_id: resolvedZoneId,
        pathao_zone_name: resolvedZoneName,
        pathao_area_id: areaId ?? null,
        ...(actualCost.total > 0 ? {
          actual_shipping_cost: actualCost.total,
          actual_shipping_source: "auto",
          actual_shipping_recorded_at: new Date().toISOString(),
          actual_shipping_breakdown: actualCost.breakdown as never,
        } : {}),
      })
      .eq("id", order.id);

    return {
      shipmentId: shipment.id,
      consignment,
      tracking,
      fee: actualCost.total || fee,
      status,
      city: cityPick.name,
      zone: resolvedZoneName,
    };
  });

// ---- Settings management ----

const SettingsSchema = z.object({
  brand_id: z.string().uuid(),
  base_url: z.string().url().optional().or(z.literal("")),
  client_id: z.string().min(1).max(200),
  client_secret: z.string().min(1).max(500),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
  store_id: z.string().min(1).max(50),
  is_active: z.boolean().default(true),
});
const SettingsSaveSchema = SettingsSchema.extend({
  wallet_id: z.string().uuid().nullable().optional(),
});

export const pathaoGetSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const { data: row, error } = await supabase
      .from("erp_courier_settings")
      .select("brand_id, base_url, client_id, client_secret, username, password, store_id, is_active, wallet_id")
      .eq("provider", "pathao")
      .eq("brand_id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    return { settings: row };
  });

export const pathaoSaveSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SettingsSaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const payload = {
      brand_id: data.brand_id,
      provider: "pathao",
      base_url: data.base_url && data.base_url.length > 0 ? data.base_url : "https://api-hermes.pathao.com",
      client_id: data.client_id,
      client_secret: data.client_secret,
      username: data.username,
      password: data.password,
      store_id: data.store_id,
      is_active: data.is_active,
      wallet_id: data.wallet_id ?? null,
    };
    const { error } = await supabase
      .from("erp_courier_settings")
      .upsert(payload, { onConflict: "brand_id,provider" });
    if (error) throw error;
    return { ok: true };
  });

export const pathaoTestConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!admin) throw new Error("Admin only");
    const client = await clientForBrand(supabase, data.brandId);
    const cities = await client.cities();
    return { ok: true, cityCount: Array.isArray(cities) ? cities.length : 0 };
  });