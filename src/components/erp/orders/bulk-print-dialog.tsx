import { useEffect, useMemo, useState } from "react";
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
  const { activeBrand } = useBrand();
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
      const itemsByOrder = new Map<string, any[]>();
      for (const it of iRes.data ?? []) {
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push(it);
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
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Brand</span>
              <span className="font-medium">{activeBrand?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">
                {isLoading ? "Loading order data…" : `${orders.length} order${orders.length === 1 ? "" : "s"} ready`}
              </span>
            </div>
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
  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <div style={{ color: "#000", background: "#fff", padding: 16, fontSize: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 6, marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{brandName} — Picking List</div>
            <div style={{ fontSize: 11, color: "#555" }}>{orders.length} orders · {format(new Date(), "dd MMM yyyy HH:mm")}</div>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f3f4f6" }}>
              <th style={th}>#</th>
              <th style={th}>Invoice</th>
              <th style={th}>Customer</th>
              <th style={th}>Items</th>
              <th style={{ ...th, textAlign: "center" }}>Qty</th>
              <th style={th}>✓</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const items = itemsByOrder.get(o.id) ?? [];
              const qty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
              return (
                <tr key={o.id} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>#{invoiceDisplay(o)}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{customerName(o)}</div>
                    <div style={{ fontSize: 10, color: "#666" }}>{customerPhone(o)}</div>
                  </td>
                  <td style={td}>
                    {items.map((it, k) => (
                      <div key={k} style={{ fontSize: 11 }}>
                        • {it.name}
                        {it.variant_label && <span style={{ color: "#666" }}> ({it.variant_label})</span>}
                        <strong> × {it.quantity}</strong>
                      </div>
                    ))}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{qty}</td>
                  <td style={{ ...td, width: 28 }}>
                    <div style={{ width: 16, height: 16, border: "1.5px solid #000", borderRadius: 2 }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
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