import type { OrderRow } from "@/lib/erp/orders";

export type AutoTagKey =
  | "fraud"
  | "risky"
  | "priority"
  | "old_customer"
  | "repeat"
  | "no_response"
  | "has_note";

export type AutoTag = {
  key: AutoTagKey;
  label: string;
  icon: string;
  /** Tailwind classes for chip background/text */
  chip: string;
  /** Tailwind bg class for row-accent border */
  accent: string;
  /** Lower number = higher priority (used for row accent + sorting) */
  priority: number;
  /** Human reason shown on hover */
  reason: string;
};

export type CustomerBreakdown = {
  total: number;
  confirmed: number;
  cancelled: number;
  returned?: number;
  delivered?: number;
};

export type CourierStat = { total: number; success: number; cancelled: number };
export type CourierBreakdown = {
  pathao: CourierStat;
  steadfast: CourierStat;
  found: boolean;
};

export type TagInputRow = {
  total: number | null;
  customer_note?: string | null;
  notes?: string | null;
  shipping_city?: string | null;
  call_attempt_count?: number | null;
  created_at?: string;
  /** Status used to detect "stale" — pass web_status for web orders, status otherwise. */
  status?: string | null;
  itemCount?: number;
  totalQty?: number;
};

const PRIORITY_AMOUNT = 3000;
const PRIORITY_ITEM_COUNT = 3;
const PRIORITY_TOTAL_QTY = 4;

export function computeAutoTags(
  row: TagInputRow,
  breakdown?: CustomerBreakdown | null,
  courier?: CourierBreakdown | null,
): AutoTag[] {
  const tags: AutoTag[] = [];

  // Courier success rate is the strongest signal — use it when present.
  const cTotal = (courier?.pathao.total ?? 0) + (courier?.steadfast.total ?? 0);
  const cSuccess = (courier?.pathao.success ?? 0) + (courier?.steadfast.success ?? 0);
  const cCancelled = (courier?.pathao.cancelled ?? 0) + (courier?.steadfast.cancelled ?? 0);
  const cancelRate = cTotal > 0 ? cCancelled / cTotal : 0;

  if (cTotal >= 5 && cSuccess === 0) {
    tags.push({
      key: "fraud",
      label: "Fraud Risk",
      icon: "🚫",
      chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 ring-red-500/30",
      accent: "bg-red-500",
      priority: 1,
      reason: `${cTotal} courier orders, 0 successful delivery`,
    });
  } else if (cTotal >= 3 && cancelRate > 0.3) {
    tags.push({
      key: "risky",
      label: "Risky",
      icon: "⚠️",
      chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 ring-rose-500/30",
      accent: "bg-rose-500",
      priority: 2,
      reason: `Cancel rate ${Math.round(cancelRate * 100)}% (${cCancelled}/${cTotal})`,
    });
  }

  // Priority Customer — based on the CURRENT order's value or size.
  const itemCount = row.itemCount ?? 0;
  const totalQty = row.totalQty ?? 0;
  const amount = typeof row.total === "number" ? row.total : 0;
  const priorityReasons: string[] = [];
  if (amount > PRIORITY_AMOUNT) priorityReasons.push(`৳${amount.toLocaleString()}`);
  if (itemCount >= PRIORITY_ITEM_COUNT) priorityReasons.push(`${itemCount} items`);
  if (totalQty >= PRIORITY_TOTAL_QTY) priorityReasons.push(`${totalQty} qty`);
  if (priorityReasons.length > 0) {
    tags.push({
      key: "priority",
      label: "Priority Customer",
      icon: "⭐",
      chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 ring-amber-500/30",
      accent: "bg-amber-500",
      priority: 3,
      reason: `High-value order · ${priorityReasons.join(" · ")}`,
    });
  }

  // Old Customer — has at least one previously delivered order.
  // Repeat   — has ordered before but nothing delivered yet.
  // Counts subtract the current order so "prior" history is what matters.
  const histDelivered = (breakdown?.delivered ?? 0) + (cSuccess ?? 0);
  const histTotal = breakdown?.total ?? 0;
  const priorOrders = Math.max(0, histTotal - 1); // current order is in histTotal

  if (histDelivered >= 1) {
    tags.push({
      key: "old_customer",
      label: "Old Customer",
      icon: "🏅",
      chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ring-emerald-500/30",
      accent: "bg-emerald-500",
      priority: 4,
      reason: `${histDelivered} previously delivered order${histDelivered === 1 ? "" : "s"}`,
    });
  } else if (priorOrders >= 1) {
    tags.push({
      key: "repeat",
      label: "Repeat",
      icon: "🔁",
      chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 ring-violet-500/30",
      accent: "bg-violet-500",
      priority: 5,
      reason: `${priorOrders} prior order${priorOrders === 1 ? "" : "s"} from this customer`,
    });
  }

  if ((row.call_attempt_count ?? 0) >= 3) {
    tags.push({
      key: "no_response",
      label: "No Response",
      icon: "📞",
      chip: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 ring-orange-500/30",
      accent: "bg-orange-500",
      priority: 6,
      reason: `${row.call_attempt_count} failed call attempts`,
    });
  }

  if ((row.customer_note ?? "").trim() || (row.notes ?? "").trim()) {
    tags.push({
      key: "has_note",
      label: "Has Note",
      icon: "🎁",
      chip: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300 ring-pink-500/30",
      accent: "bg-pink-500",
      priority: 7,
      reason: "Customer left a note",
    });
  }

  return tags.sort((a, b) => a.priority - b.priority);
}

export function topTag(tags: AutoTag[]): AutoTag | null {
  return tags.length > 0 ? tags[0] : null;
}

/** Mapping for the manual `tags` column — deterministic chip color from string. */
const MANUAL_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 ring-rose-500/30",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 ring-sky-500/30",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 ring-emerald-500/30",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 ring-violet-500/30",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 ring-amber-500/30",
];

export function manualTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return MANUAL_PALETTE[hash % MANUAL_PALETTE.length];
}

// Re-export OrderRow-compatible helper so consumers can convert easily
export function rowToTagInput(
  o: Pick<
    OrderRow,
    "total" | "customer_note" | "admin_notes" | "shipping_city" | "call_attempt_count" | "created_at" | "status"
  > & { items?: { quantity: number }[] },
): TagInputRow {
  const items = o.items ?? [];
  return {
    total: o.total,
    customer_note: o.customer_note,
    notes: o.admin_notes,
    shipping_city: o.shipping_city,
    call_attempt_count: o.call_attempt_count,
    created_at: o.created_at,
    status: o.status,
    itemCount: items.length,
    totalQty: items.reduce((s, i) => s + (i.quantity ?? 0), 0),
  };
}