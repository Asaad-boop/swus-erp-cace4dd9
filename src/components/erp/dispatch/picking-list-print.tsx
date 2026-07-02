import { format } from "date-fns";

type Item = { name: string; variant_label?: string | null; quantity: number; sku?: string | null };
type Order = { invoice_no: string | null; shipping_name?: string | null; guest_name?: string | null; items?: Item[] };

export function PickingListPrint({ orders }: { orders: Order[] }) {
  // Group by product name; each product has variant sub-rows and a total.
  type Row = { sku: string | null; variant: string | null; qty: number };
  const byProduct = new Map<string, { name: string; total: number; rows: Row[] }>();
  for (const o of orders) {
    for (const it of o.items ?? []) {
      const g = byProduct.get(it.name) ?? { name: it.name, total: 0, rows: [] };
      const existing = g.rows.find(
        (r) => (r.sku ?? "") === (it.sku ?? "") && (r.variant ?? "") === (it.variant_label ?? ""),
      );
      if (existing) existing.qty += it.quantity;
      else g.rows.push({ sku: it.sku ?? null, variant: it.variant_label ?? null, qty: it.quantity });
      g.total += it.quantity;
      byProduct.set(it.name, g);
    }
  }
  const groups = Array.from(byProduct.values()).sort((a, b) => b.total - a.total);
  const totalQty = groups.reduce((s, g) => s + g.total, 0);
  const totalSkus = groups.reduce((s, g) => s + g.rows.length, 0);
  const invoices = orders.map((o) => o.invoice_no).filter(Boolean) as string[];
  const genId = `PICK-${format(new Date(), "yyMMdd-HHmm")}`;

  return (
    <div
      className="bg-white text-black font-sans"
      style={{ padding: "18mm 14mm", fontSize: 12, lineHeight: 1.35 }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottom: "2px solid #000",
          paddingBottom: 10,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, fontWeight: 700, color: "#555" }}>
            WAREHOUSE · PICK SHEET
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "4px 0 0", letterSpacing: -0.5 }}>
            Picking List
          </h1>
        </div>
        <div style={{ textAlign: "right", fontSize: 11 }}>
          <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700 }}>{genId}</div>
          <div style={{ color: "#555" }}>{format(new Date(), "PPP · p")}</div>
          <div style={{ marginTop: 6, fontSize: 10, color: "#555" }}>
            Picker: ______________ &nbsp;·&nbsp; Checker: ______________
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Orders", value: orders.length },
          { label: "Unique SKUs", value: totalSkus },
          { label: "Total Units", value: totalQty },
          { label: "Products", value: groups.length },
        ].map((k) => (
          <div
            key={k.label}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: "8px 10px" }}
          >
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#666", fontWeight: 700 }}>
              {k.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#111", color: "#fff" }}>
            <th style={th(28)}>✓</th>
            <th style={th(40)}>#</th>
            <th style={{ ...th(), textAlign: "left" }}>Product / Variant</th>
            <th style={{ ...th(120), textAlign: "left" }}>SKU</th>
            <th style={{ ...th(60), textAlign: "right" }}>Qty</th>
            <th style={{ ...th(70), textAlign: "left" }}>Bin</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <>
              {g.rows.map((r, ri) => {
                const isFirst = ri === 0;
                const isLast = ri === g.rows.length - 1;
                return (
                  <tr
                    key={`${gi}-${ri}`}
                    style={{
                      background: gi % 2 === 0 ? "#fff" : "#fafafa",
                      borderTop: isFirst ? "1px solid #bbb" : "1px dashed #eee",
                      borderBottom: isLast ? "1px solid #bbb" : undefined,
                    }}
                  >
                    <td style={td("center")}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 14,
                          height: 14,
                          border: "1.5px solid #111",
                          borderRadius: 3,
                        }}
                      />
                    </td>
                    <td style={{ ...td("center"), fontFamily: "ui-monospace, Menlo, monospace", color: "#555" }}>
                      {isFirst ? gi + 1 : ""}
                    </td>
                    <td style={td()}>
                      {isFirst && (
                        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25 }}>{g.name}</div>
                      )}
                      {r.variant && (
                        <div style={{ color: "#444", fontSize: 11, marginTop: isFirst ? 2 : 0 }}>
                          ↳ {r.variant}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td(), fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>
                      {r.sku ?? "—"}
                    </td>
                    <td style={{ ...td("right"), fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {r.qty}
                    </td>
                    <td style={td()}>
                      <span
                        style={{
                          display: "inline-block",
                          minWidth: 50,
                          borderBottom: "1px solid #999",
                          height: 14,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {g.rows.length > 1 && (
                <tr style={{ background: "#f2f2f2" }}>
                  <td colSpan={4} style={{ ...td("right"), fontSize: 10, color: "#333", fontWeight: 700 }}>
                    Product total
                  </td>
                  <td style={{ ...td("right"), fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {g.total}
                  </td>
                  <td style={td()} />
                </tr>
              )}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #000" }}>
            <td colSpan={4} style={{ ...td("right"), fontWeight: 800, fontSize: 12 }}>
              GRAND TOTAL
            </td>
            <td style={{ ...td("right"), fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
              {totalQty}
            </td>
            <td style={td()} />
          </tr>
        </tfoot>
      </table>

      {/* Included invoices */}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid #ddd" }}>
        <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#666", fontWeight: 700, marginBottom: 4 }}>
          ORDERS INCLUDED ({invoices.length})
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 10,
          }}
        >
          {invoices.map((inv) => (
            <span
              key={inv}
              style={{
                border: "1px solid #ccc",
                borderRadius: 3,
                padding: "2px 6px",
                background: "#fafafa",
              }}
            >
              {inv}
            </span>
          ))}
        </div>
      </div>

      {/* Signatures */}
      <div
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
          fontSize: 10,
          color: "#555",
        }}
      >
        {["Picked by", "Checked by", "Dispatched by"].map((l) => (
          <div key={l} style={{ borderTop: "1px solid #000", paddingTop: 4, textAlign: "center" }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

const th = (w?: number): React.CSSProperties => ({
  padding: "8px 8px",
  textAlign: "center",
  fontSize: 10,
  letterSpacing: 1,
  fontWeight: 700,
  width: w,
});

const td = (align: "left" | "right" | "center" = "left"): React.CSSProperties => ({
  padding: "8px 8px",
  textAlign: align,
  verticalAlign: "top",
});

// Keep JSX Fragment import unnecessary — using shorthand <></>.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ = React.ReactNode;
import * as React from "react";
}