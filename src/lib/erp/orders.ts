import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type ConfirmationStatus = Database["public"]["Enums"]["confirmation_status"];

export const ORDER_STATUSES: OrderStatus[] = [
  "new", "confirmed", "packaging", "packed", "ready_to_ship",
  "shipped", "in_transit", "delivered", "partial_delivered",
  "returned", "exchanged", "cancelled", "fake", "on_hold",
];

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  confirmed: { label: "Confirmed", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  packaging: { label: "Packaging", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  packed: { label: "Packed", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  ready_to_ship: { label: "Ready", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300" },
  shipped: { label: "Shipped", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  in_transit: { label: "In transit", className: "bg-amber-100 text-amber-800" },
  delivered: { label: "Delivered", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  partial_delivered: { label: "Partial", className: "bg-emerald-100 text-emerald-800" },
  returned: { label: "Returned", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  cancelled: { label: "Cancelled", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  fake: { label: "Fake", className: "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300" },
  on_hold: { label: "On hold", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  exchanged: { label: "Exchanged", className: "bg-orange-100 text-orange-800" },
};

export function statusBadge(s: string) {
  return STATUS_BADGE[s] ?? { label: s, className: "bg-zinc-100 text-zinc-700" };
}

export type OrderRow = {
  id: string;
  created_at: string;
  status: OrderStatus;
  confirmation_status: ConfirmationStatus;
  total: number;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  payment_method: string | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  shipping_thana: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  is_guest_order: boolean;
  user_id: string | null;
  brand_id: string | null;
  source: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  assigned_to: string | null;
  admin_notes: string | null;
  customer_note: string | null;
  call_status: string | null;
  call_attempt_count: number | null;
  delivered_at: string | null;
  shipped_at: string | null;
  confirmed_at: string | null;
};

export function customerName(o: Pick<OrderRow, "shipping_name" | "guest_name">) {
  return o.shipping_name ?? o.guest_name ?? "—";
}
export function customerPhone(o: Pick<OrderRow, "shipping_phone" | "guest_phone">) {
  return o.shipping_phone ?? o.guest_phone ?? "";
}
export function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function exportOrdersCsv(orders: OrderRow[]): string {
  const headers = [
    "Order ID", "Date", "Customer", "Phone", "Address", "City", "District",
    "Total", "Subtotal", "Shipping", "Discount", "Payment",
    "Status", "Confirmation", "Courier", "Tracking", "Source",
  ];
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const o of orders) {
    lines.push([
      shortId(o.id),
      new Date(o.created_at).toLocaleString(),
      customerName(o),
      customerPhone(o),
      o.shipping_address ?? "",
      o.shipping_city ?? "",
      o.shipping_district ?? "",
      o.total,
      o.subtotal,
      o.shipping_fee,
      o.discount_amount,
      o.payment_method ?? "",
      o.status,
      o.confirmation_status,
      o.courier_name ?? "",
      o.tracking_number ?? "",
      o.source ?? "",
    ].map(escape).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}