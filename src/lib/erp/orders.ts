import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type ConfirmationStatus = Database["public"]["Enums"]["confirmation_status"];

// Pipeline order: Fulfillment → Return → Exchange → Finance → Closing
export const ORDER_STATUSES: OrderStatus[] = [
  // Fulfillment
  "confirmed", "ready_to_pack", "packed", "ready_to_ship",
  "shipped", "in_transit", "delivered", "partial_delivered",
  // Return
  "pending_return", "returned", "partial_return",
  // Exchange
  "exchange", "exchanged",
  // Finance
  "paid", "paid_return", "unpaid_return",
  // Closing
  "on_hold", "cancelled",
];

export type StatusGroup = "fulfillment" | "return" | "exchange" | "finance" | "closing";

export const STATUS_GROUPS: { key: StatusGroup; label: string; statuses: OrderStatus[] }[] = [
  {
    key: "fulfillment", label: "Fulfillment",
    statuses: ["confirmed", "ready_to_pack", "packed", "ready_to_ship", "shipped", "in_transit", "delivered", "partial_delivered"],
  },
  { key: "return", label: "Return", statuses: ["pending_return", "returned", "partial_return"] },
  { key: "exchange", label: "Exchange", statuses: ["exchange", "exchanged"] },
  { key: "finance", label: "Finance", statuses: ["paid", "paid_return", "unpaid_return"] },
  { key: "closing", label: "Closing", statuses: ["on_hold", "cancelled"] },
];

// Top-of-page tabs (reference layout). Each tab maps to one or more of our statuses.
export type StatusTabKey =
  | "all" | "pending" | "packing" | "rts" | "shipped" | "in_transit" | "delivered"
  | "partial" | "paid" | "pending_return" | "returned" | "exchange" | "on_hold" | "cancelled" | "incomplete";

export const STATUS_TABS: { key: StatusTabKey; label: string; statuses: OrderStatus[] }[] = [
  { key: "pending", label: "Pending", statuses: ["confirmed"] },
  { key: "packing", label: "Packing", statuses: ["ready_to_pack", "packed"] },
  { key: "rts", label: "RTS", statuses: ["ready_to_ship"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "in_transit", label: "In Transit", statuses: ["in_transit"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "partial", label: "Partial", statuses: ["partial_delivered", "partial_return"] },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "pending_return", label: "Pending Return", statuses: ["pending_return"] },
  { key: "returned", label: "Returned", statuses: ["returned"] },
  { key: "exchange", label: "Exchange", statuses: ["exchange", "exchanged"] },
  { key: "on_hold", label: "On Hold", statuses: ["on_hold"] },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"] },
  { key: "all", label: "All", statuses: [] },
];

export function tabForStatuses(statuses: OrderStatus[]): StatusTabKey {
  if (!statuses.length) return "all";
  for (const t of STATUS_TABS) {
    if (t.statuses.length === statuses.length && t.statuses.every((s) => statuses.includes(s))) return t.key;
  }
  return "all";
}

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  // Fulfillment
  confirmed: { label: "Pending", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  ready_to_pack: { label: "Ready to Pack", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  packed: { label: "Packed", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  ready_to_ship: { label: "RTS", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300" },
  shipped: { label: "Shipped", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  in_transit: { label: "In Transit", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  delivered: { label: "Delivered", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  partial_delivered: { label: "Partial Delivery", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  // Finance — courier paid out COD
  paid: { label: "Paid", className: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200" },
  // Return
  pending_return: { label: "Return In Transit", className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  returned: { label: "Returned", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  partial_return: { label: "Partial Return", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  // Exchange
  exchange: { label: "Exchange", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  exchanged: { label: "Exchange Delivery", className: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  // Finance
  paid_return: { label: "Paid Return", className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  unpaid_return: { label: "Refund", className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  // Closing
  on_hold: { label: "On Hold", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  cancelled: { label: "Cancelled", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  // Legacy / fallbacks (still in DB enum)
  new: { label: "New", className: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300" },
  packaging: { label: "Packaging", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  fake: { label: "Fake", className: "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-300" },
};

export function statusBadge(s: string) {
  return STATUS_BADGE[s] ?? { label: s, className: "bg-zinc-100 text-zinc-700" };
}

/** Accent color (Tailwind hex-ish) for status, used as row left border. */
export const STATUS_ACCENT: Record<string, string> = {
  confirmed: "#3b82f6", ready_to_pack: "#6366f1", packed: "#a855f7",
  ready_to_ship: "#06b6d4", shipped: "#f59e0b", in_transit: "#f59e0b",
  delivered: "#10b981", partial_delivered: "#10b981",
  paid: "#0d9488",
  pending_return: "#f97316", returned: "#ef4444", partial_return: "#ef4444",
  exchange: "#8b5cf6", exchanged: "#8b5cf6",
  paid_return: "#14b8a6", unpaid_return: "#14b8a6",
  on_hold: "#eab308", cancelled: "#71717a",
};
export function statusAccent(s: string) { return STATUS_ACCENT[s] ?? "#a1a1aa"; }

export type OrderRow = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  status: OrderStatus;
  confirmation_status: ConfirmationStatus;
  total: number;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  payment_method: string | null;
  advance_amount: number | null;
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
  shipping_note: string | null;
  call_status: string | null;
  call_attempt_count: number | null;
  delivered_at: string | null;
  shipped_at: string | null;
  confirmed_at: string | null;
  paid_at?: string | null;
  items?: OrderItemMini[];
  actual_shipping_cost?: number | null;
};

export type OrderItemMini = {
  id: string;
  name: string | null;
  image: string | null;
  quantity: number;
  variant_label: string | null;
  line_total: number | null;
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

/** Display invoice number, falling back to a short order id. */
export function invoiceDisplay(o: { invoice_no: string | null; id: string }) {
  return o.invoice_no ?? shortId(o.id);
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