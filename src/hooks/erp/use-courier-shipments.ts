import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CourierShipmentRow = {
  id: string;
  order_id: string;
  provider: string | null;
  status: string | null;
  consignment_id: string | null;
  tracking_code: string | null;
  updated_at: string | null;
  created_at: string | null;
  rider_name: string | null;
  rider_phone: string | null;
};

export type CourierBucket =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned"
  | "on_hold"
  | "cancelled";

export const COURIER_BUCKETS: CourierBucket[] = [
  "pending",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
  "on_hold",
  "cancelled",
];

export function normalizeCourierStatus(raw: string | null | undefined): CourierBucket | null {
  if (!raw) return null;
  const x = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (!x) return null;
  if (/(^delivered$|delivered$|partial.?deliver|delivery.?success)/.test(x)) return "delivered";
  if (/out.?for.?deliver|on.?the.?way|on_delivery|assigned_for_delivery/.test(x)) return "out_for_delivery";
  if (/cancel/.test(x)) return "cancelled";
  if (/return/.test(x)) return "returned";
  if (/^hold$|on_hold|lost|damag/.test(x)) return "on_hold";
  if (/fail|unsuccess|reject/.test(x)) return "on_hold";
  if (/transit|forwarded|reached|sorting_hub|last_mile_hub|received_at/.test(x)) return "in_transit";
  if (/picked|pick_up|collected/.test(x)) return "picked_up";
  if (/pending|created|new|requested|assigned_for_pickup|booked/.test(x)) return "pending";
  return "pending";
}

export const COURIER_BUCKET_META: Record<CourierBucket, { label: string; className: string; pulse?: boolean; emoji?: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground border-border" },
  picked_up: { label: "Picked Up", className: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/60" },
  in_transit: { label: "In Transit", className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60", pulse: true },
  out_for_delivery: { label: "Out for Delivery", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60", pulse: true },
  delivered: { label: "Delivered", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60", emoji: "✅" },
  failed: { label: "Failed", className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60", emoji: "❌" },
  returned: { label: "Returned", className: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60" },
  on_hold: { label: "On Hold", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60", pulse: true },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground border-border" },
};

/**
 * Bulk fetch the latest courier shipment for a list of order ids.
 * Returns a Map<order_id, CourierShipmentRow> with only the most recent shipment per order.
 */
export function useCourierShipments(orderIds: string[]) {
  const ids = [...orderIds].sort();
  const key = ids.join(",");
  return useQuery({
    queryKey: ["courier-shipments", key],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, CourierShipmentRow>> => {
      const { data, error } = await supabase
        .from("courier_shipments")
        .select("id,order_id,provider,status,consignment_id,tracking_code,updated_at,created_at,rider_name,rider_phone")
        .in("order_id", ids)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, CourierShipmentRow> = {};
      for (const row of (data ?? []) as CourierShipmentRow[]) {
        // first occurrence wins (already ordered DESC by updated_at)
        if (!map[row.order_id]) map[row.order_id] = row;
      }
      return map;
    },
  });
}