import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, PackageCheck, FileText, Loader2, Receipt, Send, Ban, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getLocalPoDetail, receiveLocalPo, updateLocalPoStatus, createBillFromLocalPo } from "@/lib/erp/local-po/local-po.functions";
import { LOCAL_PO_STATUS, fmtBdt, type LocalPoStatus } from "@/lib/erp/local-po/types";

export const Route = createFileRoute("/_authenticated/erp/purchase-orders/$poId")({
  head: () => ({ meta: [{ title: "Purchase Order — ERP" }] }),
  component: LocalPoDetailPage,
});

function LocalPoDetailPage() {
  const { poId } = useParams({ from: "/_authenticated/erp/purchase-orders/$poId" });
  const qc = useQueryClient();
  const detailFn = useServerFn(getLocalPoDetail);
  const statusFn = useServerFn(updateLocalPoStatus);
  const billFn = useServerFn(createBillFromLocalPo);

  const { data, isLoading } = useQuery({
    queryKey: ["local-po", poId],
    queryFn: () => detailFn({ data: { poId } }),
  });

  const [receiveOpen, setReceiveOpen] = useState(false);

  const statusMut = useMutation({
    mutationFn: (status: "sent" | "cancelled") => statusFn({ data: { poId, status } }),
    onSuccess: (_d, s) => {
      toast.success(`Marked as ${s}`);
      qc.invalidateQueries({ queryKey: ["local-po", poId] });
      qc.invalidateQueries({ queryKey: ["local-pos"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const billMut = useMutation({
    mutationFn: () => billFn({ data: { poId } }),
    onSuccess: (res: any) => {
      toast.success(`Bill ${res.bill_no} created`);
      qc.invalidateQueries({ queryKey: ["local-po", poId] });
      qc.invalidateQueries({ queryKey: ["local-pos"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create bill"),
  });

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const po = (data as any).po;
  const items = (data as any).items as any[];
  const receipts = (data as any).receipts as any[];

  const totalOrdered = items.reduce((s, i) => s + (i.ordered_qty || 0), 0);
  const totalReceived = items.reduce((s, i) => s + (i.received_qty || 0), 0);
  const hasPending = items.some((i) => (i.ordered_qty || 0) > (i.received_qty || 0));
  const isActionable = po.status !== "cancelled" && po.status !== "received";

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto pb-12">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/erp/purchase-orders"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 font-mono">
              <ClipboardList className="h-5 w-5 text-primary" />{po.po_number}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className={LOCAL_PO_STATUS[po.status as LocalPoStatus]?.tone}>
                {LOCAL_PO_STATUS[po.status as LocalPoStatus]?.label ?? po.status}
              </Badge>
              <span className="text-xs text-muted-foreground">{po.supplier?.name ?? "—"} · {po.order_date}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {po.status === "draft" && (
            <Button size="sm" variant="outline" onClick={() => statusMut.mutate("sent")} disabled={statusMut.isPending}>
              <Send className="h-4 w-4 mr-1" />Mark Sent
            </Button>
          )}
          {isActionable && hasPending && (
            <Button size="sm" onClick={() => setReceiveOpen(true)}>
              <PackageCheck className="h-4 w-4 mr-1" />Receive Items
            </Button>
          )}
          {!po.bill_id && po.status !== "cancelled" && (
            <Button size="sm" variant="outline" onClick={() => billMut.mutate()} disabled={billMut.isPending}>
              <Receipt className="h-4 w-4 mr-1" />Create Bill
            </Button>
          )}
          {po.bill_id && <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" />Billed</Badge>}
          {isActionable && (
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Cancel this PO?")) statusMut.mutate("cancelled"); }}>
              <Ban className="h-4 w-4 mr-1 text-red-500" />Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5 min-w-0">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Items · received {totalReceived} / {totalOrdered}</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const pending = (it.ordered_qty || 0) - (it.received_qty || 0);
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{it.product?.title || it.description || "—"}</div>
                        {it.product?.sku && <div className="text-[11px] text-muted-foreground font-mono">{it.product.sku}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{it.ordered_qty}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{it.received_qty || 0}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pending > 0 ? <span className="text-amber-600 font-medium">{pending}</span> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBdt(Number(it.unit_cost))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(Number(it.total_cost || it.ordered_qty * it.unit_cost))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {receipts.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Receipts ({receipts.length})</h3>
              <div className="space-y-3">
                {receipts.map((r) => (
                  <div key={r.id} className="rounded-md border border-border p-3 bg-card/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">{r.received_date}</div>
                      <Badge variant="outline" className="text-[10px]">{(r.items || []).length} items</Badge>
                    </div>
                    {r.notes && <div className="text-xs text-muted-foreground mb-1">{r.notes}</div>}
                    <div className="text-xs text-muted-foreground">
                      Qty received: {(r.items || []).reduce((s: number, x: any) => s + (x.received_qty || 0), 0)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card className="p-4 space-y-2 text-sm">
          <h3 className="font-semibold mb-2">Totals</h3>
          <Row label="Subtotal" value={fmtBdt(Number(po.subtotal))} />
          <Row label="Discount" value={`- ${fmtBdt(Number(po.discount))}`} />
          <Row label="Tax" value={fmtBdt(Number(po.tax))} />
          <Row label="Shipping" value={fmtBdt(Number(po.shipping_cost))} />
          <div className="border-t border-border pt-2 flex justify-between items-baseline">
            <span className="text-muted-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums">{fmtBdt(Number(po.total))}</span>
          </div>
          <Row label="Paid" value={fmtBdt(Number(po.amount_paid))} />
          <Row label="Due" value={fmtBdt(Number(po.balance_due ?? po.total - po.amount_paid))} />
          {po.notes && (
            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{po.notes}</div>
            </div>
          )}
        </Card>
      </div>

      <ReceiveDialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        poId={poId}
        items={items}
        onReceived={() => {
          qc.invalidateQueries({ queryKey: ["local-po", poId] });
          qc.invalidateQueries({ queryKey: ["local-pos"] });
          qc.invalidateQueries({ queryKey: ["inventory"] });
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

function ReceiveDialog({
  open, onClose, poId, items, onReceived,
}: { open: boolean; onClose: () => void; poId: string; items: any[]; onReceived: () => void }) {
  const receiveFn = useServerFn(receiveLocalPo);
  const pendingItems = useMemo(() =>
    items.filter((i) => (i.ordered_qty || 0) > (i.received_qty || 0)),
    [items]);

  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    pendingItems.forEach((i) => { m[i.id] = (i.ordered_qty || 0) - (i.received_qty || 0); });
    return m;
  });
  const [costs, setCosts] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    pendingItems.forEach((i) => { m[i.id] = Number(i.unit_cost) || 0; });
    return m;
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        po_id: poId,
        received_date: receivedDate,
        notes: notes || undefined,
        items: pendingItems
          .filter((i) => (qtys[i.id] ?? 0) > 0)
          .map((i) => ({
            po_item_id: i.id,
            received_qty: qtys[i.id],
            unit_cost: costs[i.id] || 0,
          })),
      };
      if (payload.items.length === 0) throw new Error("Enter at least one quantity");
      return await receiveFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Items received & stock updated");
      onReceived();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Receive failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" />Receive Items</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Received date</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right w-24">Pending</TableHead>
                  <TableHead className="text-right w-28">Receive</TableHead>
                  <TableHead className="text-right w-28">Unit Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingItems.map((it) => {
                  const pending = (it.ordered_qty || 0) - (it.received_qty || 0);
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{it.product?.title || it.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">{pending}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min={0} max={pending} value={qtys[it.id] ?? 0} className="h-8 text-right"
                          onChange={(e) => setQtys((m) => ({ ...m, [it.id]: Math.min(pending, Math.max(0, Number(e.target.value) || 0)) }))} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" min={0} value={costs[it.id] ?? 0} className="h-8 text-right"
                          onChange={(e) => setCosts((m) => ({ ...m, [it.id]: Number(e.target.value) || 0 }))} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="text-[11px] text-muted-foreground">
            Stock automatically update hobe (movement source: <span className="font-mono">local_po</span>) and WAC recalculate hobe.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Receiving…</> : <><PackageCheck className="h-4 w-4 mr-2" />Confirm Receipt</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}