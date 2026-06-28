export type ProductRow = {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  video_url?: string | null;
  price: number;
  stock: number;
  low_stock_threshold: number | null;
  is_active: boolean;
  brand_id: string | null;
  category_id: string | null;
  updated_at: string;
  cost_price?: number | null;
  sku?: string | null;
  barcode?: string | null;
  reorder_point?: number | null;
  reorder_qty?: number | null;
  reserved_stock?: number | null;
  available_stock?: number | null;
  weighted_avg_cost?: number | null;
  variant_skus?: string[];
  variants?: VariantRow[];
  incoming?: number;
  is_preorder?: boolean | null;
  preorder_expected_date?: string | null;
};

export type VariantRow = {
  id: string;
  product_id: string;
  sku: string | null;
  stock: number;
  reserved_stock: number;
  available_stock: number;
  reorder_point: number;
  weighted_avg_cost: number;
  is_active: boolean;
  label?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image?: string | null;
  display_order?: number;
};

export type StockMovementRow = {
  id: string;
  created_at: string;
  product_id: string;
  variant_id?: string | null;
  user_id: string | null;
  delta: number;
  stock_before: number;
  stock_after: number;
  running_stock?: number | null;
  reason: string;
  note: string | null;
  brand_id: string | null;
  unit_cost_bdt?: number | null;
  total_cost_bdt?: number | null;
  movement_source?: string | null;
};

export const STOCK_REASONS = [
  { value: "opening_stock", label: "Opening Stock" },
  { value: "stock_in", label: "Stock In (Purchase)" },
  { value: "stock_out", label: "Stock Out (Manual)" },
  { value: "correction", label: "Correction" },
  { value: "damage", label: "Damaged" },
  { value: "return", label: "Customer Return" },
] as const;

export const MOVEMENT_SOURCES = [
  { value: "manual", label: "Manual", tone: "bg-zinc-100 text-zinc-700" },
  { value: "order", label: "Order", tone: "bg-blue-100 text-blue-700" },
  { value: "return", label: "Return", tone: "bg-orange-100 text-orange-700" },
  { value: "import", label: "Import", tone: "bg-purple-100 text-purple-700" },
  { value: "transfer", label: "Transfer", tone: "bg-cyan-100 text-cyan-700" },
  { value: "stocktake", label: "Stocktake", tone: "bg-amber-100 text-amber-700" },
  { value: "local_po", label: "Local PO", tone: "bg-emerald-100 text-emerald-700" },
] as const;

export function sourceBadge(src: string | null | undefined) {
  return MOVEMENT_SOURCES.find((m) => m.value === src) ?? { value: src ?? "", label: src ?? "—", tone: "bg-zinc-100 text-zinc-700" };
}

export function stockBadge(stock: number, threshold: number | null) {
  const t = threshold ?? 5;
  if (stock <= 0) return { label: "Out of stock", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" };
  if (stock <= t) return { label: "Low", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" };
  return { label: "In stock", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" };
}

export function exportProductsCsv(rows: ProductRow[]): string {
  const headers = ["Product ID", "Title", "SKU", "Barcode", "Slug", "Price", "Cost", "Stock", "Threshold", "Reorder Point", "Stock Value", "Status"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cost = Number(r.cost_price ?? 0);
    lines.push([
      r.id.slice(0, 8),
      r.title,
      r.sku ?? "",
      r.barcode ?? "",
      r.slug,
      r.price,
      cost,
      r.stock,
      r.low_stock_threshold ?? 5,
      r.reorder_point ?? "",
      (cost * r.stock).toFixed(2),
      r.is_active ? "active" : "inactive",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}