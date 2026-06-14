import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapCourierStatus, normalizeCourierStatus, type CourierProvider } from "./courier-status-mapping";
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
  shipment: { provider: string; consignment_id: string | null; tracking_code: string | null } | null,
  overrideId?: { provider: CourierProvider; identifier: string },
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
    }

    if (!raw) return { ...base, error: "Status not found in response" };

    base.raw_status = normalizeCourierStatus(raw);
    base.mapped_status = mapCourierStatus(provider, raw);
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
      .select("order_id, provider, consignment_id, tracking_code, created_at")
      .in("order_id", data.orderIds)
      .order("created_at", { ascending: false });

    const latestShipment = new Map<string, { provider: string; consignment_id: string | null; tracking_code: string | null }>();
    for (const s of (shipments ?? []) as Array<{ order_id: string; provider: string; consignment_id: string | null; tracking_code: string | null }>) {
      if (!latestShipment.has(s.order_id)) latestShipment.set(s.order_id, s);
    }

    const overrideMap = new Map<string, { provider: CourierProvider; identifier: string }>();
    for (const o of data.overrides ?? []) {
      overrideMap.set(o.orderId, { provider: o.provider, identifier: o.identifier });
    }

    const results: CourierSyncResult[] = [];
    const batchSize = 4;
    const list = (orders ?? []) as Array<Parameters<typeof syncOne>[2]>;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const settled = await Promise.all(
        batch.map((o) => syncOne(supabase, data.brandId ?? null, o, latestShipment.get(o.id) ?? null, overrideMap.get(o.id))),
      );
      results.push(...settled);
    }

    return { results };
  });