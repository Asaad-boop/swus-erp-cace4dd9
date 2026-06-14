export type ProductRow = {
  id: string;
  title: string;
  slug: string;
  image: string | null;
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
};

export type StockMovementRow = {
  id: string;
  created_at: string;
  product_id: string;
  user_id: string | null;
  delta: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  note: string | null;
  brand_id: string | null;
};

export const STOCK_REASONS = [
  { value: "opening_stock", label: "Opening Stock" },
  { value: "stock_in", label: "Stock In (Purchase)" },
  { value: "stock_out", label: "Stock Out (Manual)" },
  { value: "correction", label: "Correction" },
  { value: "damage", label: "Damaged" },
  { value: "return", label: "Customer Return" },
] as const;

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