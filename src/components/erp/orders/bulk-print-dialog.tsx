import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Printer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/brand-context";
import { useInvoiceConfig } from "@/hooks/erp/use-invoice-config";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { customerName, customerPhone, invoiceDisplay } from "@/lib/erp/orders";
import { DEFAULT_INVOICE_CONFIG, formatMoney, type InvoiceConfig } from "@/lib/erp/invoice-config";

export type PrintMode = "invoice" | "sticker" | "picking" | "sheet";

const MODE_LABEL: Record<PrintMode, string> = {
  invoice: "Invoices",
  sticker: "Shipping stickers",
  picking: "Picking list",
  sheet: "Order sheet",
};

export function BulkPrintDialog({
  open,
  onOpenChange,
  mode,
  orderIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: PrintMode;
  orderIds: string[];
}) {
  const { activeBrand, brands } = useBrand();
  const { data: cfg } = useInvoiceConfig(activeBrand?.id);
  const config = cfg ?? DEFAULT_INVOICE_CONFIG;

  const { data, isLoading } = useQuery({
    queryKey: ["bulk-print", mode, orderIds.sort().join(",")],
    enabled: open && orderIds.length > 0,
    queryFn: async () => {
      const [oRes, iRes] = await Promise.all([
        supabase.from("orders").select("*").in("id", orderIds),
        supabase.from("order_items").select("*").in("order_id", orderIds),
      ]);
      if (oRes.error) throw oRes.error;
      if (iRes.error) throw iRes.error;
      const orders = oRes.data ?? [];
      const items = iRes.data ?? [];
      // fetch SKUs for variants present in these items
      const variantIds = Array.from(new Set(items.map((i) => i.variant_id).filter(Boolean))) as string[];
      const skuByVariant = new Map<string, string>();
      if (variantIds.length) {
        const { data: vrows } = await supabase
          .from("product_variants")
          .select("id,sku")
          .in("id", variantIds);
        for (const v of vrows ?? []) skuByVariant.set(v.id, v.sku ?? "");
      }
      const itemsByOrder = new Map<string, any[]>();
      for (const it of items) {
        const enriched = { ...it, sku: it.variant_id ? skuByVariant.get(it.variant_id) ?? "" : "" };
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(enriched);
        itemsByOrder.set(it.order_id, arr);
      }
      // preserve original selection order
      orders.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
      return { orders, itemsByOrder };
    },
  });

  const orders = data?.orders ?? [];
  const itemsByOrder = data?.itemsByOrder ?? new Map<string, any[]>();
  const ready = !isLoading && orders.length > 0;

  // Per-brand breakdown of selected orders (works across "All brands" view too)
  const brandBreakdown = (() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const key = (o as any).brand_id ?? "unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([id, count]) => ({
      id,
      count,
      name: brands.find((b) => b.id === id)?.name ?? "Unknown",
    })).sort((a, b) => b.count - a.count);
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> Print {MODE_LABEL[mode]}
            </DialogTitle>
            <DialogDescription>
              {orderIds.length} order{orderIds.length === 1 ? "" : "s"} selected.
              {mode === "invoice" && " Each invoice prints on its own page using the active brand's invoice settings."}
              {mode === "sticker" && " 4 stickers per A4 page — fold and attach to parcel."}
              {mode === "picking" && " Packer-friendly list grouped per order."}
              {mode === "sheet" && " One condensed table of all selected orders."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-2">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground pt-0.5">Brands</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {isLoading && <span className="text-muted-foreground">…</span>}
                {!isLoading && brandBreakdown.length === 0 && <span className="font-medium">—</span>}
                {!isLoading && brandBreakdown.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-medium"
                  >
                    {b.name}
                    <span className="tabular-nums text-muted-foreground">× {b.count}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">
                {isLoading ? "Loading order data…" : `${orders.length} order${orders.length === 1 ? "" : "s"} ready`}
              </span>
            </div>
            {!isLoading && brandBreakdown.length > 1 && (
              <div className="text-[10px] text-muted-foreground pt-1 border-t">
                Each invoice uses its own brand's invoice settings.
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" disabled={!ready} onClick={() => window.print()}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              Print {orders.length || ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden print payload — only visible at print time via .print-area CSS */}
      {open && ready && (
        <div className="print-area" style={{ display: "none" }}>
          {mode === "invoice" && orders.map((o) => (
            <div key={o.id} className="print-page">
              <PrintableInvoice
                order={o as any}
                items={(itemsByOrder.get(o.id) ?? []) as any}
                visible
                bulk
              />
            </div>
          ))}
          {mode === "sticker" && (
            <StickerSheet orders={orders} brandName={activeBrand?.name ?? ""} cfg={config} />
          )}
          {mode === "picking" && (
            <PickingList orders={orders} itemsByOrder={itemsByOrder} brandName={activeBrand?.name ?? ""} />
          )}
          {mode === "sheet" && (
            <OrderSheet orders={orders} itemsByOrder={itemsByOrder} brandName={activeBrand?.name ?? ""} cfg={config} />
          )}
        </div>
      )}
    </>
  );
}

/* ---------------------------- Sticker Sheet ---------------------------- */

function StickerSheet({ orders, brandName, cfg }: { orders: any[]; brandName: string; cfg: InvoiceConfig }) {
  // 2 columns × 2 rows per A4 page (4 stickers / page)
  const pages: any[][] = [];
  for (let i = 0; i < orders.length; i += 4) pages.push(orders.slice(i, i + 4));
  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 8mm; } }`}</style>
      {pages.map((pageOrders, idx) => (
        <div
          key={idx}
          className="print-page"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 6, width: "100%", minHeight: "270mm" }}
        >
          {pageOrders.map((o) => (
            <div key={o.id} style={{ border: "1.5px dashed #444", padding: 10, fontSize: 11, color: "#000", background: "#fff", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${cfg.accentColor}`, paddingBottom: 4, marginBottom: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: cfg.accentColor }}>{brandName}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11 }}>#{invoiceDisplay(o)}</div>
              </div>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>DELIVER TO</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{customerName(o)}</div>
              <div style={{ fontSize: 12 }}>{customerPhone(o)}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{o.shipping_address}</div>
              <div style={{ fontSize: 11 }}>{[o.shipping_thana, o.shipping_city, o.shipping_district].filter(Boolean).join(", ")}</div>
              <div style={{ marginTop: "auto", paddingTop: 6, borderTop: "1px dashed #999", display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span>{o.courier_name ?? "Courier"}</span>
                <span>COD: <strong>{formatMoney(Number(o.total ?? 0) - Number(o.advance_amount ?? 0), cfg.items)}</strong></span>
              </div>
              {o.shipping_note && (
                <div style={{ fontSize: 9, fontStyle: "italic", marginTop: 3, color: "#b45309" }}>Note: {o.shipping_note}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/* ---------------------------- Picking List ---------------------------- */

function PickingList({ orders, itemsByOrder, brandName }: { orders: any[]; itemsByOrder: Map<string, any[]>; brandName: string }) {
  // Build flat lines: one per order_item, enriched with order context
  type Line = {
    sku: string;
    name: string;
    variant: string;
    qty: number;
    order: any;
  };
  const lines: Line[] = [];
  for (const o of orders) {
    for (const it of itemsByOrder.get(o.id) ?? []) {
      lines.push({
        sku: (it.sku || "").trim(),
        name: it.name ?? "",
        variant: it.variant_label ?? "",
        qty: Number(it.quantity || 0),
        order: o,
      });
    }
  }

  // Group by SKU (fallback to name+variant when SKU missing)
  const groupKey = (l: Line) => l.sku || `${l.name}::${l.variant}`;
  const groups = new Map<string, { key: string; sku: string; name: string; variant: string; lines: Line[]; totalQty: number }>();
  for (const l of lines) {
    const k = groupKey(l);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, sku: l.sku, name: l.name, variant: l.variant, lines: [], totalQty: 0 };
      groups.set(k, g);
    }
    g.lines.push(l);
    g.totalQty += l.qty;
  }
  // Sort SKU groups by total qty desc, then SKU asc for stability
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
    return (a.sku || a.name).localeCompare(b.sku || b.name);
  });
  // Within each group split by qty>=2 (multi) and qty==1 (single); multi first, sorted qty desc
  for (const g of sortedGroups) {
    g.lines.sort((a, b) => b.qty - a.qty);
  }

  const grandQty = sortedGroups.reduce((s, g) => s + g.totalQty, 0);
  let serial = 0;

  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 10mm; } .pk-row{break-inside:avoid;} .pk-group{break-inside:avoid;} }`}</style>
      <div style={{ color: "#000", background: "#fff", padding: 14, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #000", paddingBottom: 6, marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{brandName} — Picking List</div>
            <div style={{ fontSize: 11, color: "#555" }}>
              {orders.length} orders · {sortedGroups.length} SKUs · {grandQty} pcs · {format(new Date(), "dd MMM yyyy HH:mm")}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#555", textAlign: "right" }}>
            Grouped by SKU · sorted by quantity (high → low)<br />
            Multi-qty rows printed before single-qty rows in each group.
          </div>
        </div>

        {sortedGroups.map((g) => {
          const multi = g.lines.filter((l) => l.qty >= 2);
          const single = g.lines.filter((l) => l.qty < 2);
          return (
            <div key={g.key} className="pk-group" style={{ marginBottom: 10, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ background: "#111", color: "#fff", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 13 }}>{g.sku || "—"}</span>
                  <span style={{ fontSize: 12 }}>{g.name}</span>
                  {g.variant && <span style={{ fontSize: 11, opacity: 0.8 }}>({g.variant})</span>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  Total: {g.totalQty} pc · {g.lines.length} order{g.lines.length === 1 ? "" : "s"}
                </div>
              </div>

              {renderBucket("Multi-Qty (2+)", multi)}
              {renderBucket("Single Qty", single)}
            </div>
          );
        })}
      </div>
    </>
  );

  function renderBucket(label: string, bucket: Line[]) {
    if (!bucket.length) return null;
    return (
      <div>
        <div style={{ background: "#f3f4f6", padding: "3px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#444", borderTop: "1px solid #ddd" }}>
          {label} · {bucket.length} order{bucket.length === 1 ? "" : "s"} · {bucket.reduce((s, l) => s + l.qty, 0)} pcs
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ ...th, width: 30 }}>#</th>
              <th style={{ ...th, width: 110 }}>Invoice</th>
              <th style={th}>Customer</th>
              <th style={th}>Phone</th>
              <th style={th}>Area</th>
              <th style={{ ...th, textAlign: "center", width: 50 }}>Qty</th>
              <th style={{ ...th, width: 28 }}>✓</th>
            </tr>
          </thead>
          <tbody>
            {bucket.map((l) => {
              serial += 1;
              return (
                <tr key={`${l.order.id}-${serial}`} className="pk-row" style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}>{serial}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>#{invoiceDisplay(l.order)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{customerName(l.order)}</td>
                  <td style={td}>{customerPhone(l.order)}</td>
                  <td style={{ ...td, fontSize: 10, color: "#555" }}>
                    {[l.order.shipping_thana, l.order.shipping_city].filter(Boolean).join(", ")}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 800, fontSize: 13 }}>{l.qty}</td>
                  <td style={td}>
                    <div style={{ width: 14, height: 14, border: "1.5px solid #000", borderRadius: 2 }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}

/* ---------------------------- Order Sheet ---------------------------- */

function OrderSheet({ orders, itemsByOrder, brandName, cfg }: { orders: any[]; itemsByOrder: Map<string, any[]>; brandName: string; cfg: InvoiceConfig }) {
  return (
    <>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } }`}</style>
      <div style={{ color: "#000", background: "#fff", padding: 12, fontSize: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `2px solid ${cfg.accentColor}`, paddingBottom: 6, marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: cfg.accentColor }}>{brandName} — Order Sheet</div>
          <div style={{ fontSize: 11, color: "#555" }}>{orders.length} orders · {format(new Date(), "dd MMM yyyy HH:mm")}</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: cfg.accentColor, color: "#fff" }}>
              <th style={th}>#</th>
              <th style={th}>Invoice</th>
              <th style={th}>Date</th>
              <th style={th}>Customer</th>
              <th style={th}>Phone</th>
              <th style={th}>Address</th>
              <th style={{ ...th, textAlign: "center" }}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={{ ...th, textAlign: "right" }}>Advance</th>
              <th style={{ ...th, textAlign: "right" }}>COD</th>
              <th style={th}>Courier</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const items = itemsByOrder.get(o.id) ?? [];
              const qty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
              const total = Number(o.total ?? 0);
              const adv = Number(o.advance_amount ?? 0);
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontFamily: "monospace" }}>#{invoiceDisplay(o)}</td>
                  <td style={td}>{format(new Date(o.created_at), "dd MMM")}</td>
                  <td style={td}>{customerName(o)}</td>
                  <td style={td}>{customerPhone(o)}</td>
                  <td style={{ ...td, maxWidth: 220 }}>
                    {[o.shipping_address, o.shipping_thana, o.shipping_city].filter(Boolean).join(", ")}
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{qty}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formatMoney(total, cfg.items)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{formatMoney(adv, cfg.items)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(total - adv, cfg.items)}</td>
                  <td style={td}>{o.courier_name ?? "—"}</td>
                  <td style={td}>{String(o.status ?? "").replace(/_/g, " ")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${cfg.accentColor}`, background: "#f3f4f6" }}>
              <td style={td} colSpan={6}><strong>Total ({orders.length} orders)</strong></td>
              <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{orders.reduce((s, o) => s + (itemsByOrder.get(o.id) ?? []).reduce((x, it) => x + Number(it.quantity || 0), 0), 0)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(orders.reduce((s, o) => s + Number(o.total ?? 0), 0), cfg.items)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(orders.reduce((s, o) => s + Number(o.advance_amount ?? 0), 0), cfg.items)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{formatMoney(orders.reduce((s, o) => s + Number(o.total ?? 0) - Number(o.advance_amount ?? 0), 0), cfg.items)}</td>
              <td style={td} colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "5px 6px", fontSize: 11, fontWeight: 700, borderBottom: "1px solid #999" };
const td: React.CSSProperties = { textAlign: "left", padding: "4px 6px", fontSize: 11, verticalAlign: "top" };