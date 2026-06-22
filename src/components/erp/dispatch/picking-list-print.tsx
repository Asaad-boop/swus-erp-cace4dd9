import { useBrand } from "@/contexts/brand-context";

type PickingItem = { name: string; sku?: string | null; quantity: number; location?: string | null };
type PickingOrder = {
  id: string;
  invoice_no?: string | null;
  shipping_name?: string | null;
  guest_name?: string | null;
  total?: number | null;
  items: PickingItem[];
};

export function PickingListPrint({ orders, visible }: { orders: PickingOrder[]; visible?: boolean }) {
  const { activeBrand } = useBrand();
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return (
    <div
      id="print-picking-list"
      className={visible ? "" : "hidden print:block"}
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      {orders.map((o, idx) => (
        <div
          key={o.id}
          style={{
            padding: "16px",
            borderBottom: "1px dashed #999",
            pageBreakAfter: idx === orders.length - 1 ? "auto" : "always",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>PICKING LIST</div>
            <div style={{ fontSize: 12 }}>{activeBrand?.name ?? "Brand"} — {today}</div>
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>Order:</strong> #{o.invoice_no || o.id.slice(0, 8).toUpperCase()}
          </div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            <strong>Customer:</strong> {o.shipping_name || o.guest_name || "—"}
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              {o.items.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ width: 24, padding: "6px 4px", verticalAlign: "top" }}>☐</td>
                  <td style={{ padding: "6px 4px" }}>
                    <div style={{ fontWeight: 600 }}>{it.name} × {it.quantity}</div>
                    {it.sku && <div style={{ color: "#666", fontSize: 11 }}>SKU: {it.sku}</div>}
                    {it.location && <div style={{ color: "#666", fontSize: 11 }}>Location: {it.location}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {typeof o.total === "number" && (
            <div style={{ marginTop: 10, fontSize: 13, textAlign: "right" }}>
              <strong>COD: ৳{Math.round(o.total).toLocaleString()}</strong>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}