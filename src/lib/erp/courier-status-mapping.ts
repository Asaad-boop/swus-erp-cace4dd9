import type { OrderStatus } from "./orders";

export type CourierProvider = "pathao" | "steadfast";

/** Normalize raw courier status: lowercase, replace spaces/hyphens with underscore. */
export function normalizeCourierStatus(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Default mapping per provider. Key = normalized raw status, value = ERP status. */
const PATHAO_MAP: Record<string, OrderStatus> = {
  pickup_requested: "ready_to_ship",
  assigned_for_pickup: "ready_to_ship",
  picked: "ready_to_ship",
  pickup: "ready_to_ship",
  pickup_failed: "on_hold",
  pickup_cancelled: "cancelled",
  at_the_sorting_hub: "shipped",
  at_sorting_hub: "shipped",
  in_transit: "shipped",
  received_at_last_mile_hub: "shipped",
  assigned_for_delivery: "shipped",
  on_delivery: "shipped",
  out_for_delivery: "shipped",
  delivered: "delivered",
  partial_delivery: "partial_delivered",
  partial_delivered: "partial_delivered",
  delivery_failed: "on_hold",
  hold: "on_hold",
  on_hold: "on_hold",
  return: "returned",
  returning: "pending_return",
  returned: "returned",
  return_to_pickup: "pending_return",
  return_to_merchant: "returned",
  cancelled: "cancelled",
  canceled: "cancelled",
  exchange: "exchange",
  exchanged: "exchanged",
};

const STEADFAST_MAP: Record<string, OrderStatus> = {
  pending: "ready_to_ship",
  in_review: "ready_to_ship",
  hold: "on_hold",
  in_transit: "shipped",
  delivered: "delivered",
  partial_delivered: "partial_delivered",
  delivery_failed: "on_hold",
  cancelled: "cancelled",
  unknown: "on_hold",
  unknown_approval: "on_hold",
  return: "returned",
  returned: "returned",
  partial_delivered_return: "partial_return",
};

export function mapCourierStatus(provider: CourierProvider, raw: string | null | undefined): OrderStatus | null {
  const key = normalizeCourierStatus(raw);
  if (!key) return null;
  const table = provider === "pathao" ? PATHAO_MAP : STEADFAST_MAP;
  return table[key] ?? null;
}