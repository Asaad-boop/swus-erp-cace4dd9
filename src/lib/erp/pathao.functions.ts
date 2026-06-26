import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCourierRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }, { data: cs }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "customer_service" }),
  ]);
  if (!admin && !ops && !cs) throw new Error("Not authorized");
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
/*  Pathao-only address detection — no AI, no heuristics                  */
/* ---------------------------------------------------------------------- */
//
// City / Zone / Area resolution comes entirely from Pathao's official
// customer-info API (lookup by phone) — the same call the Pathao
// merchant portal makes when typing a phone in "New Delivery".

async function resolveByPhone(client: any, phone: string) {
  const p = (phone || "").replace(/\D/g, "").slice(-11);
  if (p.length < 11) return null;
  const info: any = await client.lookupCustomer(p);
  const d = info?.data ?? info ?? {};
  const cityId = Number(d.city_id || d.recipient_city || 0);
  const zoneId = Number(d.zone_id || d.recipient_zone || 0);
  const areaId = Number(d.area_id || d.recipient_area || 0);
  if (!cityId || !zoneId) return null;
  const citiesRaw = (await client.cities()) as Array<{ city_id: number; city_name: string }>;
  const cityName = citiesRaw.find((c) => c.city_id === cityId)?.city_name ?? d.city_name ?? "";
  const zonesRaw = (await client.zones(cityId)) as Array<{ zone_id: number; zone_name: string }>;
  const zoneName = zonesRaw.find((z) => z.zone_id === zoneId)?.zone_name ?? d.zone_name ?? "";
  let area: { id: number; name: string } | null = null;
  if (areaId) {
    try {
      const areasRaw = (await client.areas(zoneId)) as Array<{ area_id: number; area_name: string }>;
      const an = areasRaw.find((a) => a.area_id === areaId)?.area_name ?? d.area_name ?? "";
      area = { id: areaId, name: an };
    } catch { /* ignore */ }
  }
  return {
    city: { id: cityId, name: cityName },
    zone: { id: zoneId, name: zoneName },
    area,
    recipient_name: (d.name || d.recipient_name || "") as string,
    recipient_address: (d.address || d.recipient_address || "") as string,
    success_ratio: typeof d.success_ratio === "number" ? d.success_ratio : null,
  };
}

const PHONE_ADDRESS_CITY_TOKENS = new Set([
  "dhaka", "chattogram", "chittagong", "gazipur", "narayanganj", "savar",
  "cumilla", "comilla", "sylhet", "rajshahi", "khulna", "barishal", "barisal",
  "rangpur", "mymensingh",
]);

function meaningfulAddressTokens(raw: string) {
  return normalizeAddr(raw)
    .split(" ")
    .filter((token) => {
      if (token.length < 3) return false;
      if (/^\d+$/.test(token)) return false;
      if (PHONE_ADDRESS_CITY_TOKENS.has(token)) return false;
      if (GENERIC_LOCATION_TOKENS.has(token)) return false;
      if (["place", "floor", "flat", "building", "holding", "goli", "gali", "near", "beside", "opposite", "mobile"].includes(token)) return false;
      return true;
    });
}

function hasTokenOverlap(left: string[], right: string[]) {
  return left.some((a) =>
    right.some((b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))),
  );
}

function phoneRouteMatchesCurrentAddress(
  route: Awaited<ReturnType<typeof resolveByPhone>>,
  currentAddress: string,
) {
  if (!route) return false;
  const addressTokens = meaningfulAddressTokens(currentAddress);
  // Very short/blank saved addresses can safely use Pathao phone history.
  if (addressTokens.length === 0) return true;

  const returnedAddressTokens = meaningfulAddressTokens(route.recipient_address || "");
  if (returnedAddressTokens.length > 0 && hasTokenOverlap(addressTokens, returnedAddressTokens)) return true;

  const returnedLocationTokens = meaningfulAddressTokens([
    route.zone?.name,
    route.area?.name,
  ].filter(Boolean).join(" "));
  return returnedLocationTokens.length > 0 && hasTokenOverlap(addressTokens, returnedLocationTokens);
}


/**
 * Pathao customer lookup by phone — same call the Pathao merchant portal
 * uses to auto-fill "New Delivery" forms. Returns the last-used City,
 * Zone, Area, recipient name & address. Authoritative for any data-entry
 * form (Create Order, Web Orders book dialog).
 */
export const pathaoLookupByPhoneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        phone: z.string().min(6).max(20),
        brandId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    const phone = data.phone.replace(/\D/g, "").slice(-11);
    if (phone.length < 11) return { found: false as const };
    const info: any = await client.lookupCustomer(phone);
    const dd = info?.data ?? info ?? {};
    const cityId = Number(dd.city_id || dd.recipient_city || 0);
    const zoneId = Number(dd.zone_id || dd.recipient_zone || 0);
    const areaId = Number(dd.area_id || dd.recipient_area || 0);
    if (!cityId || !zoneId) return { found: false as const };
    const citiesRaw = (await client.cities()) as Array<{ city_id: number; city_name: string }>;
    const cityName = citiesRaw.find((c) => c.city_id === cityId)?.city_name ?? dd.city_name ?? "";
    const zonesRaw = (await client.zones(cityId)) as Array<{ zone_id: number; zone_name: string }>;
    const zoneName = zonesRaw.find((z) => z.zone_id === zoneId)?.zone_name ?? dd.zone_name ?? "";
    let areaName = "";
    if (areaId) {
      try {
        const areasRaw = (await client.areas(zoneId)) as Array<{ area_id: number; area_name: string }>;
        areaName = areasRaw.find((a) => a.area_id === areaId)?.area_name ?? dd.area_name ?? "";
      } catch { /* ignore */ }
    }
    return {
      found: true as const,
      city: { id: cityId, name: cityName },
      zone: { id: zoneId, name: zoneName },
      area: areaId ? { id: areaId, name: areaName } : null,
      recipient_name: (dd.name || dd.recipient_name || "") as string,
      recipient_address: (dd.address || dd.recipient_address || "") as string,
      success_ratio: typeof dd.success_ratio === "number" ? dd.success_ratio : null,
    };
  });

/**
 * Address-based City / Zone / Area matcher. No AI — pure substring matching
 * against Pathao's own cities / zones / areas lists. Used to auto-fill the
 * dropdowns the moment a recipient address is typed.
 */
function normalizeAddr(s: string) {
  const normalized = (s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[।,.;:/|()\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized
    .split(" ")
    .map((token) => {
      if (["sodor", "sodar", "sodhor", "sadr"].includes(token)) return "sadar";
      if (token === "comilla") return "cumilla";
      if (token === "ctg") return "chattogram";
      if (["mipur", "mirpoor", "mirpurr"].includes(token)) return "mirpur";
      return token;
    })
    .join(" ");
}

const GENERIC_LOCATION_TOKENS = new Set([
  "sadar", "bazar", "bazaar", "market", "road", "rd", "house", "block", "sector",
  "area", "para", "pur", "city", "thana", "upazila", "district", "ward", "union",
]);

function tokenSet(s: string) {
  return new Set(normalizeAddr(s).split(" ").filter((t) => t.length >= 2));
}

function scoreLocationName(
  haystack: string,
  hayTokens: Set<string>,
  name: string,
  allowGenericOnly = false,
  ignoredTokens: Set<string> = new Set(),
) {
  const normalized = normalizeAddr(name);
  if (!normalized) return 0;
  const paddedHay = ` ${haystack} `;
  const paddedName = ` ${normalized} `;
  if (paddedHay.includes(paddedName)) return 120 + normalized.length;

  const nameTokens = normalized.split(" ").filter(Boolean);
  const withoutIgnored = nameTokens.filter((t) => !ignoredTokens.has(t));
  const scopedTokens = withoutIgnored.length > 0 ? withoutIgnored : nameTokens;
  const distinctTokens = scopedTokens.filter((t) => !GENERIC_LOCATION_TOKENS.has(t));
  const usableTokens = distinctTokens.length > 0 || allowGenericOnly ? scopedTokens : distinctTokens;
  if (usableTokens.length === 0) return 0;

  const matched = usableTokens.filter((t) => hayTokens.has(t));
  if (matched.length === usableTokens.length) return 95 + normalized.length;
  if (matched.length > 0) return 55 + matched.join(" ").length;

  let partial = 0;
  for (const token of usableTokens) {
    if (token.length < 4) continue;
    for (const ht of hayTokens) {
      if (ht.length >= 4 && (token.startsWith(ht) || ht.startsWith(token))) {
        partial = Math.max(partial, 40 + Math.min(token.length, ht.length));
      }
    }
  }
  return partial;
}

function bestScoredMatch<T extends { name: string }>(
  haystack: string,
  items: T[],
  allowGenericOnly = false,
  ignoredTokens: Set<string> = new Set(),
): (T & { score: number }) | null {
  const hayTokens = tokenSet(haystack);
  let best: (T & { score: number }) | null = null;
  for (const it of items) {
    const score = scoreLocationName(haystack, hayTokens, it.name, allowGenericOnly, ignoredTokens);
    if (score > 0 && (!best || score > best.score)) best = { ...it, score };
  }
  return best;
}

async function resolveByAddress(client: any, address: string) {
  const hay = normalizeAddr(address);
  if (!hay) return null;

  const citiesRaw = (await client.cities()) as Array<{ city_id: number; city_name: string }>;
  const cityItems = citiesRaw.map((c) => ({ id: c.city_id, name: c.city_name }));
  const explicitCity = bestScoredMatch(hay, cityItems);
  const strongCity = explicitCity && explicitCity.score >= 95 ? explicitCity : null;
  const cityHasStrongMatch = strongCity != null;

  const commonCityNames = [
    "Dhaka", "Chattogram", "Chittagong", "Gazipur", "Narayanganj", "Savar",
    "Cumilla", "Comilla", "Sylhet", "Rajshahi", "Khulna", "Barishal", "Barisal",
    "Rangpur", "Mymensingh",
  ];
  const cityMap = new Map(cityItems.map((c) => [normalizeAddr(c.name), c]));
  const commonCities = commonCityNames.map((n) => cityMap.get(normalizeAddr(n))).filter(Boolean) as typeof cityItems;
  const candidateCities = strongCity
    ? [strongCity]
    : [...commonCities, ...cityItems.filter((c) => !commonCities.some((cc) => cc.id === c.id))];

  let bestRoute: {
    city: { id: number; name: string };
    zone: { id: number; name: string } | null;
    area: { id: number; name: string } | null;
    score: number;
  } | null = strongCity
    ? { city: { id: strongCity.id, name: strongCity.name }, zone: null, area: null, score: strongCity.score }
    : null;

  for (const c of candidateCities) {
    const zonesRaw = (await client.zones(c.id).catch(() => [])) as Array<{ zone_id: number; zone_name: string }>;
    const cityTokens = tokenSet(c.name);
    const zone = bestScoredMatch(
      hay,
      zonesRaw.map((z) => ({ id: z.zone_id, name: z.zone_name })),
      cityHasStrongMatch,
      cityTokens,
    );
    const minZoneScore = cityHasStrongMatch ? 40 : 55;
    if (!zone || zone.score < minZoneScore) {
      if (cityHasStrongMatch) break;
      continue;
    }

    let area: { id: number; name: string; score: number } | null = null;
    const areasRaw = (await client.areas(zone.id).catch(() => [])) as Array<{ area_id: number; area_name: string }>;
    const areaMatch = bestScoredMatch(
      hay,
      areasRaw.map((a) => ({ id: a.area_id, name: a.area_name })),
      false,
    );
    if (areaMatch && areaMatch.score >= 55) area = areaMatch;

    const routeScore = zone.score + (area?.score ?? 0) + (cityHasStrongMatch && strongCity && c.id === strongCity.id ? 40 : 0);
    if (!bestRoute || routeScore > bestRoute.score) {
      bestRoute = {
        city: { id: c.id, name: c.name },
        zone: { id: zone.id, name: zone.name },
        area: area ? { id: area.id, name: area.name } : null,
        score: routeScore,
      };
    }
    if (routeScore >= 170) break;
  }

  if (!bestRoute?.city) return null;
  if (!bestRoute.zone && !cityHasStrongMatch) return null;
  return bestRoute;
}

export const pathaoMatchAddressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        address: z.string().min(2).max(500),
        brandId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const client = await clientForBrand(context.supabase, data.brandId);
    const route = await resolveByAddress(client, data.address);
    if (!route) return { found: false as const };
    return {
      found: true as const,
      city: route.city,
      zone: route.zone,
      area: route.area,
      confidence: Math.min(1, Math.round((route.score / 200) * 100) / 100),
      source: "pathao_address" as const,
    };
  });

/**
 * Pathao-only detection for a saved order. It first asks Pathao customer-info
 * by phone; if Pathao has no customer record, it matches the saved checkout
 * address/district/thana against Pathao's official City/Zone/Area lists.
 */
export const pathaoDetectForOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase } = context;

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, brand_id, shipping_phone, guest_phone, shipping_address, shipping_city, shipping_thana, shipping_district")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Order not found");

    const client = await clientForBrand(supabase, order.brand_id);
    const phone = (order.shipping_phone || order.guest_phone || "").toString();
    const addressText = [order.shipping_address, order.shipping_thana, order.shipping_city, order.shipping_district]
      .filter(Boolean)
      .join(", ");
    const r = await resolveByPhone(client, phone);
    if (r && phoneRouteMatchesCurrentAddress(r, addressText)) {
      return {
        city: r.city,
        zone: r.zone,
        area: r.area,
        confidence: 1,
        source: "pathao_phone" as const,
      };
    }

    const route = await resolveByAddress(client, addressText);
    if (route) {
      return {
        city: route.city,
        zone: route.zone,
        area: route.area,
        confidence: Math.min(1, Math.round((route.score / 200) * 100) / 100),
        source: "pathao_address" as const,
      };
    }
    return { city: null, zone: null, area: null, confidence: 0, source: "none" as const };
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
        recipient_city: z.number().int().positive().optional(),
        recipient_zone: z.number().int().positive().optional(),
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
    const manualLocation = data.recipient_city && data.recipient_zone;
    const result: any = await client.createOrder({
      store_id: client.storeId,
      merchant_order_id: merchantId,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      ...(manualLocation ? {
        recipient_city: data.recipient_city,
        recipient_zone: data.recipient_zone,
        recipient_area: data.recipient_area,
      } : {}),
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
    const actualCost = pathaoActualCost(result, fee, data.amount_to_collect, data.recipient_city ?? null);
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

    const orderUpdate: Record<string, unknown> = {
      courier_name: "pathao",
      courier_assigned_at: new Date().toISOString(),
      tracking_number: consignment ?? undefined,
      ...(manualLocation ? {
        pathao_city_id: data.recipient_city,
        pathao_zone_id: data.recipient_zone,
        pathao_area_id: data.recipient_area ?? null,
      } : {}),
      ...(actualCost.total > 0 ? {
        actual_shipping_cost: actualCost.total,
        actual_shipping_source: "auto",
        actual_shipping_recorded_at: new Date().toISOString(),
        actual_shipping_breakdown: actualCost.breakdown as never,
      } : {}),
    };

    await supabase
      .from("orders")
      .update(orderUpdate as never)
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
      const payload = info?.data ?? info ?? {};
      const norm = String(status).toLowerCase().replace(/[\s-]+/g, "_");
      const isActiveDelivery = /assigned_for_delivery|on_delivery|out_for_delivery/.test(norm);
      const riderName = isActiveDelivery
        ? (payload?.delivery_man_name ?? payload?.delivery_man?.name ?? null)
        : null;
      const riderPhone = isActiveDelivery
        ? (payload?.delivery_man_phone ?? payload?.delivery_man?.phone ?? null)
        : null;
      await supabase
        .from("courier_shipments")
        .update({
          status,
          response_payload: info as never,
          rider_name: riderName,
          rider_phone: riderPhone,
          updated_at: new Date().toISOString(),
        } as never)
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

    // Pathao now supports auto address mapping in the create-order API when
    // city/zone/area are omitted, so bulk/fast booking sends the full address
    // directly and lets Pathao choose the delivery area.
    const client = await clientForBrand(supabase, order.brand_id);

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
    const actualCost = pathaoActualCost(result, fee, Number(order.total) || 0, null);
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
        request_payload: { auto: true, pathao_auto_address: true, address } as never,
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
      city: null,
      zone: null,
    };
  });

// ---- Settings management ----

const SettingsSchema = z.object({
  brand_id: z.string().uuid(),
  base_url: z.string().url().optional().or(z.literal("")),
  // Credentials optional — if a brand only needs its own store_id and wants to
  // reuse another brand's API credentials, leave these blank.
  client_id: z.string().max(200).optional().or(z.literal("")),
  client_secret: z.string().max(500).optional().or(z.literal("")),
  username: z.string().max(200).optional().or(z.literal("")),
  password: z.string().max(200).optional().or(z.literal("")),
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
      client_id: data.client_id || null,
      client_secret: data.client_secret || null,
      username: data.username || null,
      password: data.password || null,
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