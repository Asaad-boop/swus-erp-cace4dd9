import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapCourierStatus,
  normalizeCourierStatus,
  type CourierProvider,
  type CourierStatusMappingOverrides,
} from "./courier-status-mapping";
import type { OrderStatus } from "./orders";

export type CourierSyncResult = {
  order_id: string;
  invoice_no: string | null;
  customer: string | null;
  phone: string | null;
  current_status: OrderStatus;
  provider: CourierProvider | null;
  identifier: string | null;
  raw_status: string | null;
  mapped_status: OrderStatus | null;
  actual_fee: number | null;
  fee_recorded: boolean;
  fee_breakdown: { delivery: number; cod: number; extra: number; total: number } | null;
  ok: boolean;
  error?: string;
};

function pickProviderFromName(name: string | null | undefined): CourierProvider | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("pathao")) return "pathao";
  if (n.includes("steadfast") || n.includes("packzy")) return "steadfast";
  return null;
}

function extractPathaoStatus(payload: any): string | null {
  const d = payload?.data ?? payload;
  return (
    d?.order_status ??
    d?.status ??
    d?.delivery_status ??
    null
  );
}

function extractFee(payload: any, keys: string[]): number | null {
  const d = payload?.data ?? payload;
  for (const k of keys) {
    const v = d?.[k];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

function extractSteadfastStatus(payload: any): string | null {
  const d = payload?.data ?? payload;
  return d?.delivery_status ?? d?.status ?? null;
}

async function syncOne(
  supabase: any,
  brandId: string | null,
  order: {
    id: string;
    invoice_no: string | null;
    status: OrderStatus;
    shipping_name: string | null;
    guest_name: string | null;
    shipping_phone: string | null;
    guest_phone: string | null;
    courier_name: string | null;
    tracking_number: string | null;
    brand_id: string | null;
  },
  shipment: { provider: string; consignment_id: string | null; tracking_code: string | null; delivery_fee?: number | null } | null,
  overrideId?: { provider: CourierProvider; identifier: string },
  mappingOverrides?: CourierStatusMappingOverrides | null,
): Promise<CourierSyncResult> {
  const base: CourierSyncResult = {
    order_id: order.id,
    invoice_no: order.invoice_no,
    customer: order.shipping_name ?? order.guest_name,
    phone: order.shipping_phone ?? order.guest_phone,
    current_status: order.status,
    provider: null,
    identifier: null,
    raw_status: null,
    mapped_status: null,
    actual_fee: null,
    fee_recorded: false,
    fee_breakdown: null,
    ok: false,
  };

  // Resolve provider + identifier
  let provider: CourierProvider | null = overrideId?.provider ?? null;
  let identifier: string | null = overrideId?.identifier ?? null;

  if (!provider || !identifier) {
    if (shipment) {
      const p = pickProviderFromName(shipment.provider);
      if (p) {
        provider = p;
        identifier = shipment.consignment_id ?? shipment.tracking_code ?? null;
      }
    }
    if (!provider || !identifier) {
      const p = pickProviderFromName(order.courier_name);
      if (p && order.tracking_number) {
        provider = p;
        identifier = order.tracking_number;
      }
    }
  }

  if (!provider) {
    return { ...base, error: "No courier linked" };
  }

  base.provider = provider;
  base.identifier = identifier;

  try {
    let raw: string | null = null;
    const effectiveBrand = order.brand_id ?? brandId;

    if (provider === "pathao") {
      if (!identifier) return { ...base, error: "No consignment ID" };
      const { loadPathaoCreds, createPathaoClient } = await import("./pathao.server");
      const creds = await loadPathaoCreds(supabase, effectiveBrand);
      const client = createPathaoClient(creds);
      const res: any = await client.track(identifier);
      raw = extractPathaoStatus(res);
      // Pathao returns delivery_fee, cod_fee, promo_discount, total_price, etc.
      // We want what Pathao actually charges us (delivery + cod + extras).
      const deliveryFee = extractFee(res, ["delivery_fee", "delivery_charge"]) ?? 0;
      const codFee = extractFee(res, ["cod_fee", "cod_charge", "collection_fee"]) ?? 0;
      const extra = extractFee(res, ["additional_charge", "extra_charge"]) ?? 0;
      const total = extractFee(res, ["total_price", "invoice_amount", "merchant_total"]);
      const sum = deliveryFee + codFee + extra;
      base.actual_fee = total && total > 0 ? total : (sum > 0 ? sum : null);
      if (base.actual_fee && base.actual_fee > 0) {
        base.fee_breakdown = {
          delivery: deliveryFee,
          cod: codFee,
          extra,
          total: base.actual_fee,
        };
      }
    } else {
      const { loadSteadfastCreds, createSteadfastClient } = await import("./steadfast.server");
      const creds = await loadSteadfastCreds(supabase, effectiveBrand);
      const client = createSteadfastClient(creds);
      let res: any = null;
      if (identifier) {
        res = await client.trackByCid(identifier).catch(() => null);
      }
      if (!res && order.invoice_no) {
        res = await client.trackByInvoice(order.invoice_no).catch(() => null);
      }
      if (!res) return { ...base, error: "Steadfast lookup failed" };
      raw = extractSteadfastStatus(res);
      base.actual_fee = extractFee(res, ["delivery_fee", "delivery_charge", "charge", "amount"]);
    }

    if (!raw) return { ...base, error: "Status not found in response" };

    base.raw_status = normalizeCourierStatus(raw);
    base.mapped_status = mapCourierStatus(provider, raw, mappingOverrides);
    base.ok = true;
    return base;
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

export const syncCourierStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderIds: z.array(z.string().uuid()).min(1).max(100),
        brandId: z.string().uuid().optional(),
        overrides: z
          .array(
            z.object({
              orderId: z.string().uuid(),
              provider: z.enum(["pathao", "steadfast"]),
              identifier: z.string().min(1).max(120),
            }),
          )
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,invoice_no,status,shipping_name,guest_name,shipping_phone,guest_phone,courier_name,tracking_number,brand_id",
      )
      .in("id", data.orderIds);
    if (oErr) throw oErr;

    const { data: shipments } = await supabase
      .from("courier_shipments")
      .select("id, order_id, provider, consignment_id, tracking_code, delivery_fee, created_at")
      .in("order_id", data.orderIds)
      .order("created_at", { ascending: false });

    type ShipRow = { id: string; provider: string; consignment_id: string | null; tracking_code: string | null; delivery_fee: number | null };
    const shipmentsByOrder = new Map<string, ShipRow[]>();
    for (const s of (shipments ?? []) as Array<ShipRow & { order_id: string }>) {
      const arr = shipmentsByOrder.get(s.order_id) ?? [];
      arr.push(s);
      shipmentsByOrder.set(s.order_id, arr);
    }
    const latestShipment = new Map<string, ShipRow>();
    for (const [oid, arr] of shipmentsByOrder) {
      if (arr[0]) latestShipment.set(oid, arr[0]);
    }

    const overrideMap = new Map<string, { provider: CourierProvider; identifier: string }>();
    for (const o of data.overrides ?? []) {
      overrideMap.set(o.orderId, { provider: o.provider, identifier: o.identifier });
    }

    // Load per-brand mapping overrides from erp_settings.config.courier_status_mapping
    let mappingOverrides: CourierStatusMappingOverrides | null = null;
    const brandsInScope = new Set<string>();
    for (const o of (orders ?? []) as Array<{ brand_id: string | null }>) {
      if (o.brand_id) brandsInScope.add(o.brand_id);
    }
    if (data.brandId) brandsInScope.add(data.brandId);
    if (brandsInScope.size === 1) {
      const [bid] = Array.from(brandsInScope);
      const { data: s } = await supabase
        .from("erp_settings")
        .select("config")
        .eq("brand_id", bid)
        .maybeSingle();
      const m = (s?.config as any)?.courier_status_mapping;
      if (m && typeof m === "object") mappingOverrides = m as CourierStatusMappingOverrides;
    }

    // For each order: try latest shipment. If courier reports a cancelled
    // status, delete that row and try the next one. The "active" consignment
    // wins; cancelled rows leave no trace.
    const results: CourierSyncResult[] = [];
    const batchSize = 4;
    const list = (orders ?? []) as Array<Parameters<typeof syncOne>[2]>;
    const tryOne = async (o: Parameters<typeof syncOne>[2]): Promise<CourierSyncResult> => {
      const override = overrideMap.get(o.id);
      if (override) {
        return syncOne(supabase, data.brandId ?? null, o, null, override, mappingOverrides);
      }
      const queue = (shipmentsByOrder.get(o.id) ?? []).slice();
      // Always include a no-shipment attempt (uses orders.tracking_number) as final fallback
      let last: CourierSyncResult | null = null;
      while (queue.length > 0) {
        const ship = queue.shift()!;
        const r = await syncOne(supabase, data.brandId ?? null, o, ship, undefined, mappingOverrides);
        last = r;
        if (r.ok && r.raw_status && /cancel/i.test(r.raw_status)) {
          // drop this cancelled shipment row and try next
          await supabase.from("courier_shipments").delete().eq("id", ship.id);
          latestShipment.set(o.id, queue[0] ?? ship); // best-effort fee fallback ref
          continue;
        }
        // mirror status back to row so re-book flows can see it
        if (r.ok && r.raw_status) {
          await supabase
            .from("courier_shipments")
            .update({ status: r.raw_status, updated_at: new Date().toISOString() })
            .eq("id", ship.id);
        }
        return r;
      }
      return last ?? (await syncOne(supabase, data.brandId ?? null, o, null, undefined, mappingOverrides));
    };
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const settled = await Promise.all(batch.map((o) => tryOne(o)));
      results.push(...settled);
    }

    // Fallback: if track API didn't return a fee, use the fee captured at booking time.
    for (const r of results) {
      if (r.ok && (!r.actual_fee || r.actual_fee <= 0)) {
        const ship = latestShipment.get(r.order_id);
        const f = Number(ship?.delivery_fee ?? 0);
        if (f > 0) r.actual_fee = f;
      }
    }

    // Persist actual courier fees + write expense (skip orders manually overridden)
    if (results.some((r) => r.ok && r.actual_fee && r.actual_fee > 0)) {
      const ids = results.filter((r) => r.ok && r.actual_fee).map((r) => r.order_id);
      const { data: existing } = await supabase
        .from("orders")
        .select("id, actual_shipping_source")
        .in("id", ids);
      const manualSet = new Set(
        ((existing ?? []) as Array<{ id: string; actual_shipping_source: string | null }>)
          .filter((r) => r.actual_shipping_source === "manual")
          .map((r) => r.id),
      );
      for (const r of results) {
        if (!r.ok || !r.actual_fee || r.actual_fee <= 0) continue;
        if (manualSet.has(r.order_id)) continue; // respect manual override
        const { error: uErr } = await supabase
          .from("orders")
          .update({
            actual_shipping_cost: r.actual_fee,
            actual_shipping_source: "auto",
            actual_shipping_recorded_at: new Date().toISOString(),
            actual_shipping_breakdown: r.fee_breakdown ?? null,
          })
          .eq("id", r.order_id);
        if (uErr) continue;
        const { error: rpcErr } = await supabase.rpc("record_order_courier_expense", {
          _order_id: r.order_id,
          _amount: r.actual_fee,
        });
        if (!rpcErr) r.fee_recorded = true;
      }
    }

    return { results };
  });

// Manual override: staff enters actual courier cost on an order.
export const setOrderActualShippingCostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        amount: z.number().min(0).max(100000),
        accountId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: uErr } = await supabase
      .from("orders")
      .update({
        actual_shipping_cost: data.amount,
        actual_shipping_source: "manual",
        actual_shipping_recorded_at: new Date().toISOString(),
      })
      .eq("id", data.orderId);
    if (uErr) throw new Error(uErr.message);

    if (data.amount > 0) {
      const { error: rpcErr } = await supabase.rpc("record_order_courier_expense", {
        _order_id: data.orderId,
        _amount: data.amount,
        _account_id: data.accountId ?? undefined,
      });
      if (rpcErr) throw new Error(rpcErr.message);
    }
    return { ok: true };
  });