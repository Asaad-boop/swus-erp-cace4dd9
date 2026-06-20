import type { OrderStatus } from "./orders";

export type CourierProvider = "pathao" | "steadfast";

/** Normalize raw courier status: lowercase, replace spaces/hyphens with underscore. */
export function normalizeCourierStatus(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Default mapping per provider. Key = normalized raw status, value = ERP status. */
export const DEFAULT_PATHAO_MAP: Record<string, OrderStatus> = {
  pickup_requested: "ready_to_ship",
  assigned_for_pickup: "ready_to_ship",
  picked: "shipped",
  pickup: "shipped",
  pickup_failed: "ready_to_ship",
  pickup_cancelled: "cancelled",
  at_the_sorting_hub: "in_transit",
  at_sorting_hub: "in_transit",
  in_transit: "in_transit",
  received_at_last_mile_hub: "in_transit",
  assigned_for_delivery: "in_transit",
  on_delivery: "in_transit",
  out_for_delivery: "in_transit",
  delivered: "delivered",
  partial_delivery: "partial_delivered",
  partial_delivered: "partial_delivered",
  paid: "completed",
  invoice_paid: "completed",
  payment_invoice: "completed",
  payment_completed: "completed",
  completed: "completed",
  delivery_failed: "on_hold",
  hold: "on_hold",
  on_hold: "on_hold",
  return: "return_in_transit",
  returning: "return_in_transit",
  returned: "returned",
  return_to_pickup: "return_in_transit",
  return_to_merchant: "return_in_transit",
  cancelled: "cancelled",
  canceled: "cancelled",
  exchange: "exchange",
  exchanged: "exchange",
  lost: "on_hold",
  damaged: "on_hold",
};

export const DEFAULT_STEADFAST_MAP: Record<string, OrderStatus> = {
  pending: "ready_to_ship",
  in_review: "ready_to_ship",
  hold: "on_hold",
  in_transit: "in_transit",
  delivered: "delivered",
  partial_delivered: "partial_delivered",
  paid: "completed",
  payment_paid: "completed",
  delivery_failed: "on_hold",
  cancelled: "cancelled",
  unknown: "on_hold",
  unknown_approval: "on_hold",
  return: "return_in_transit",
  returned: "returned",
  partial_delivered_return: "partial_return",
};

export type CourierStatusMappingOverrides = {
  pathao?: Record<string, OrderStatus>;
  steadfast?: Record<string, OrderStatus>;
};

export function getMergedMap(
  provider: CourierProvider,
  overrides?: CourierStatusMappingOverrides | null,
): Record<string, OrderStatus> {
  const base = provider === "pathao" ? DEFAULT_PATHAO_MAP : DEFAULT_STEADFAST_MAP;
  const extra = overrides?.[provider] ?? {};
  return { ...base, ...extra };
}

export function mapCourierStatus(
  provider: CourierProvider,
  raw: string | null | undefined,
  overrides?: CourierStatusMappingOverrides | null,
): OrderStatus | null {
  const key = normalizeCourierStatus(raw);
  if (!key) return null;
  const table = getMergedMap(provider, overrides);
  return table[key] ?? null;
}