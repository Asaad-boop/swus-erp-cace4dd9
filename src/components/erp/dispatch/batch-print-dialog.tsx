import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer } from "lucide-react";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { PickingListPrint } from "./picking-list-print";
import { PickupManifestPrint } from "./pickup-manifest-print";

type OrderRow = {
  id: string;
  invoice_no: string | null;
  shipping_name?: string | null;
  guest_name?: string | null;
  shipping_phone?: string | null;
  guest_phone?: string | null;
  shipping_thana?: string | null;
  shipping_city?: string | null;
  payment_method?: string | null;
  courier_name?: string | null;
  tracking_number?: string | null;
  total?: number | null;
  items?: Array<{ name: string; variant_label?: string | null; quantity: number; sku?: string | null; price?: number; image?: string | null }>;
};

type Mode = "invoice" | "picking" | "manifest" | "both";

export function BatchPrintDialog({
  open,
  onClose,
  orders,
  onPrinted,
}: {
  open: boolean;
  onClose: () => void;
  orders: OrderRow[];
  onPrinted?: (count: number, mode: Mode) => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    () => Object.fromEntries(orders.map((o) => [o.id, true])),
  );
  const [mode, setMode] = useState<Mode>("both");

  const chosen = orders.filter((o) => selected[o.id]);

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }
  function toggleAll(v: boolean) {
    setSelected(Object.fromEntries(orders.map((o) => [o.id, v])));
  }

  function doPrint() {
    // Render hidden .print-area then trigger window.print
    setTimeout(() => {
      window.print();
      onPrinted?.(chosen.length, mode);
    }, 50);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Print Batch</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">What to print</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2"><RadioGroupItem value="invoice" id="m-inv" /><Label htmlFor="m-inv">Invoices</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="picking" id="m-pk" /><Label htmlFor="m-pk">Picking List</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="manifest" id="m-mf" /><Label htmlFor="m-mf">Pickup Manifest</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="both" id="m-both" /><Label htmlFor="m-both">Invoices + Picking</Label></div>
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Pickup Manifest = single-page handover list for the rider. No pickup-man name, no authority signature.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Orders ({chosen.length}/{orders.length})</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleAll(true)}>All</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>None</Button>
            </div>
          </div>

          <ScrollArea className="h-64 border rounded-md p-2">
            <div className="space-y-1">
              {orders.map((o) => (
                <label key={o.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                  <Checkbox checked={!!selected[o.id]} onCheckedChange={() => toggle(o.id)} />
                  <span className="font-mono text-xs w-24">{o.invoice_no ?? o.id.slice(0, 8)}</span>
                  <span className="text-sm flex-1 truncate">{o.shipping_name ?? o.guest_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{(o.items?.length ?? 0)} items</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={doPrint} disabled={chosen.length === 0}>
            <Printer className="h-4 w-4 mr-2" /> Print {chosen.length}
          </Button>
        </DialogFooter>

        {/* Hidden print area — uses global .print-area + .print-page CSS */}
        <div className="print-area" style={{ display: "none" }}>
          {(mode === "picking" || mode === "both") && chosen.length > 0 && (
            <div className="print-page">
              <PickingListPrint orders={chosen} />
            </div>
          )}
          {mode === "manifest" && chosen.length > 0 && (
            <div className="print-page">
              <PickupManifestPrint orders={chosen as any} />
            </div>
          )}
          {(mode === "invoice" || mode === "both") &&
            chosen.map((o) => (
              <div className="print-page" key={o.id}>
                <PrintableInvoice order={o as any} items={(o.items ?? []) as any} visible bulk />
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}