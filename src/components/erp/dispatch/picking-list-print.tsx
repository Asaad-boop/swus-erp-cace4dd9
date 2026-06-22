import { format } from "date-fns";

type Item = { name: string; variant_label?: string | null; quantity: number; sku?: string | null };
type Order = { invoice_no: string | null; shipping_name?: string | null; guest_name?: string | null; items?: Item[] };

export function PickingListPrint({ orders }: { orders: Order[] }) {
  // Aggregate qty per SKU+name+variant across orders
  const agg = new Map<string, { name: string; variant?: string | null; sku?: string | null; qty: number }>();
  for (const o of orders) {
    for (const it of o.items ?? []) {
      const key = `${it.sku ?? ""}|${it.name}|${it.variant_label ?? ""}`;
      const prev = agg.get(key);
      if (prev) prev.qty += it.quantity;
      else agg.set(key, { name: it.name, variant: it.variant_label, sku: it.sku, qty: it.quantity });
    }
  }
  const rows = Array.from(agg.values()).sort((a, b) => a.name.localeCompare(b.name));
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="bg-white text-black p-8 font-sans">
      <div className="flex items-baseline justify-between border-b pb-3 mb-4">
        <h1 className="text-2xl font-bold">Picking List</h1>
        <span className="text-sm">{format(new Date(), "PPP p")}</span>
      </div>
      <div className="text-sm mb-4">
        {orders.length} orders · {totalQty} total units
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2 pr-2">✔</th>
            <th className="text-left py-2 pr-2">SKU</th>
            <th className="text-left py-2 pr-2">Product</th>
            <th className="text-left py-2 pr-2">Variant</th>
            <th className="text-right py-2">Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="py-2 pr-2">☐</td>
              <td className="py-2 pr-2 font-mono text-xs">{r.sku ?? "—"}</td>
              <td className="py-2 pr-2">{r.name}</td>
              <td className="py-2 pr-2">{r.variant ?? "—"}</td>
              <td className="py-2 text-right font-bold">{r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6 pt-4 border-t text-xs">
        <strong>Orders included:</strong>{" "}
        {orders.map((o) => o.invoice_no).filter(Boolean).join(", ")}
      </div>
    </div>
  );
}