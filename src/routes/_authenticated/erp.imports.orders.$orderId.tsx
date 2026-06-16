import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft, Package, Truck, Warehouse, Plane, CheckCircle2, AlertTriangle,
  Wallet, ClipboardCheck, ChevronDown, ChevronRight, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import {
  getPurchaseOrderDetail, updateCartonStage, markArrivedInBd,
  releaseCarton, postCartonToInventory, recordImportPayment, listWarehouses,
} from "@/lib/erp/imports/imports.functions";
import {
  PO_STATUS_LABEL, CARTON_STATUS_LABEL, fmtBdt, newIdemKey,
  type ImpPoStatus, type ImpCartonStatus,
} from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/$orderId")({
  head: () => ({ meta: [{ title: "Purchase Order — Imports" }] }),
  component: PoDetailPage,
});

function PoDetailPage() {
  const { orderId } = Route.useParams();
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const qc = useQueryClient();
  const detailFn = useServerFn(getPurchaseOrderDetail);
  const stageFn = useServerFn(updateCartonStage);

  const { data, isLoading } = useQuery({
    queryKey: ["imp-po", orderId],
    queryFn: () => detailFn({ data: { poId: orderId } }),
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [arrivedOpen, setArrivedOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [releaseCartonId, setReleaseCartonId] = useState<string | null>(null);
  const [qcCartonId, setQcCartonId] = useState<string | null>(null);

  const stageMut = useMutation({
    mutationFn: (vars: { carton_id: string; new_stage: ImpCartonStatus }) =>
      stageFn({ data: { ...vars, idempotency_key: newIdemKey("stage") } as any }),
    onSuccess: () => { toast.success("Stage updated"); qc.invalidateQueries({ queryKey: ["imp-po", orderId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data?.po) return <div className="p-6 text-sm text-muted-foreground">Purchase order not found.</div>;

  const po: any = data.po;
  const items: any[] = data.items;
  const cartons: any[] = data.cartons;
  const payments: any[] = data.payments;
  const history: any[] = data.history;

  const totalCartons = cartons.length;
  const inStockCartons = cartons.filter((c) => c.status === "in_stock").length;
  const totalPieces = cartons.reduce((s, c) => s + Number(c.expected_quantity || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/erp/imports/orders"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold font-mono">{po.po_number}</h2>
            <Badge variant="secondary" className={PO_STATUS_LABEL[po.status as ImpPoStatus]?.tone}>
              {PO_STATUS_LABEL[po.status as ImpPoStatus]?.label ?? po.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {po.order_date} · {po.supplier?.name ?? "—"} · {po.agent?.name ?? "No agent"}
          </p>
        </div>
        <div className="flex gap-2">
          {po.status !== "arrived_bd" && po.status !== "completed" && po.status !== "cancelled" && (
            <Button variant="outline" onClick={() => setArrivedOpen(true)}><Plane className="h-4 w-4 mr-1" />Mark Arrived BD</Button>
          )}
          <Button variant="outline" onClick={() => setPaymentOpen(true)}><Wallet className="h-4 w-4 mr-1" />Record Payment</Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryStat label="Grand Total" value={fmtBdt(po.grand_total_bdt)} />
        <SummaryStat label="Paid" value={fmtBdt(po.paid_bdt)} tone="text-emerald-600" />
        <SummaryStat label="Due" value={fmtBdt(po.due_bdt)} tone="text-orange-600" />
        <SummaryStat label="Cartons" value={`${inStockCartons} / ${totalCartons}`} hint="in stock" />
        <SummaryStat label="Pieces" value={totalPieces.toLocaleString()} />
      </div>

      {/* Cost breakdown */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 text-sm">Cost Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Product Subtotal</div><div className="font-semibold tabular-nums">{fmtBdt(po.product_subtotal_bdt)}</div></div>
          <div><div className="text-xs text-muted-foreground">Shipping</div><div className="font-semibold tabular-nums">{fmtBdt(po.shipping_total_bdt)}</div></div>
          <div><div className="text-xs text-muted-foreground">Local Courier</div><div className="font-semibold tabular-nums">{fmtBdt(po.local_courier_total_bdt)}</div></div>
          <div><div className="text-xs text-muted-foreground">FX Rate</div><div className="font-semibold tabular-nums">{po.fx_rate} {po.currency}/BDT</div></div>
        </div>
      </Card>

      {/* Items */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold"><Package className="h-4 w-4 inline mr-2" />Items ({items.length})</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit ({po.currency})</TableHead>
              <TableHead className="text-right">Unit (BDT)</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.name_snapshot}</TableCell>
                <TableCell className="font-mono text-xs">{it.sku_snapshot ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(it.unit_cost_foreign).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtBdt(it.unit_cost_bdt)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtBdt(it.subtotal_bdt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Cartons */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold"><Truck className="h-4 w-4 inline mr-2" />Cartons ({cartons.length})</h3>
        </div>
        <div className="divide-y divide-border">
          {cartons.map((c) => {
            const exp = expanded[c.id];
            return (
              <div key={c.id} className="p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => setExpanded((s) => ({ ...s, [c.id]: !s[c.id] }))} className="p-1 rounded hover:bg-accent">
                    {exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="font-mono text-sm font-semibold px-2 py-1 rounded bg-primary/10 text-primary">CTN-{c.carton_number}</div>
                  <Badge variant="secondary" className={CARTON_STATUS_LABEL[c.status as ImpCartonStatus]?.tone}>
                    {CARTON_STATUS_LABEL[c.status as ImpCartonStatus]?.label}
                  </Badge>
                  <div className="text-xs text-muted-foreground">{c.expected_quantity} pcs · {c.weight_kg ?? 0} kg</div>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="text-right text-xs">
                      <div className="text-muted-foreground">Landed</div>
                      <div className="font-semibold tabular-nums">{fmtBdt(c.total_landed_bdt)}</div>
                    </div>
                    <CartonActions
                      carton={c}
                      onStage={(stage) => stageMut.mutate({ carton_id: c.id, new_stage: stage })}
                      onRelease={() => setReleaseCartonId(c.id)}
                      onQc={() => setQcCartonId(c.id)}
                    />
                  </div>
                </div>
                {exp && (
                  <div className="mt-3 pl-8 grid md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-muted-foreground mb-1">Contents</div>
                      {(c.items ?? []).map((ci: any) => (
                        <div key={ci.id} className="flex justify-between py-0.5">
                          <span className="truncate">{ci.sku_snapshot ?? items.find((it) => it.id === ci.po_item_id)?.name_snapshot ?? "Item"}</span>
                          <span className="tabular-nums">{ci.quantity_expected} pcs</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Supplier cost</span><span className="tabular-nums">{fmtBdt(c.supplier_cost_bdt)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span className="tabular-nums">{fmtBdt(c.shipping_charge_bdt)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Local courier</span><span className="tabular-nums">{fmtBdt(c.local_courier_bdt)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Total landed</span><span className="tabular-nums">{fmtBdt(c.total_landed_bdt)}</span></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Payments */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold"><Wallet className="h-4 w-4 inline mr-2" />Payments ({payments.length})</h3>
        </div>
        {payments.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No payments recorded.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id} className={p.is_reversed ? "opacity-50 line-through" : ""}>
                  <TableCell className="text-sm">{p.payment_date}</TableCell>
                  <TableCell className="text-xs capitalize">{p.payment_type.replace("_", " ")}</TableCell>
                  <TableCell className="text-sm">{p.wallet?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(p.amount_bdt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Activity</h3>
          <div className="space-y-2 text-xs">
            {history.slice(0, 20).map((h) => (
              <div key={h.id} className="flex gap-3 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">{h.action}</span>
                  {h.previous_status && h.new_status && (
                    <span className="text-muted-foreground"> · {h.previous_status} → {h.new_status}</span>
                  )}
                  {h.notes && <span className="text-muted-foreground"> · {h.notes}</span>}
                </div>
                <div className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Dialogs */}
      {arrivedOpen && brandId && (
        <ArrivedDialog poId={po.id} agent={po.agent} onClose={() => setArrivedOpen(false)} brandId={brandId} />
      )}
      {paymentOpen && brandId && (
        <PaymentDialog poId={po.id} brandId={brandId} onClose={() => setPaymentOpen(false)} />
      )}
      {releaseCartonId && brandId && (
        <ReleaseDialog
          cartonId={releaseCartonId}
          carton={cartons.find((c) => c.id === releaseCartonId)}
          brandId={brandId}
          onClose={() => setReleaseCartonId(null)}
        />
      )}
      {qcCartonId && brandId && (
        <QcDialog
          carton={cartons.find((c) => c.id === qcCartonId)}
          brandId={brandId}
          poItems={items}
          onClose={() => setQcCartonId(null)}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-1 ${tone ?? ""}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function CartonActions({ carton, onStage, onRelease, onQc }: { carton: any; onStage: (s: ImpCartonStatus) => void; onRelease: () => void; onQc: () => void }) {
  const status = carton.status as ImpCartonStatus;
  if (status === "ordered") return <Button size="sm" variant="outline" onClick={() => onStage("at_china_warehouse")}>→ At China WH</Button>;
  if (status === "at_china_warehouse") return <Button size="sm" variant="outline" onClick={() => onStage("in_transit")}>→ In Transit</Button>;
  if (status === "arrived_bd") return <Button size="sm" variant="outline" onClick={onRelease}>Release</Button>;
  if (status === "released") return <Button size="sm" onClick={onQc}><ClipboardCheck className="h-3.5 w-3.5 mr-1" />QC & Post</Button>;
  return null;
}

/* -------------- Dialogs -------------- */

function useInvalidateOrder() {
  const qc = useQueryClient();
  return (orderId: string) => qc.invalidateQueries({ queryKey: ["imp-po", orderId] });
}

function ArrivedDialog({ poId, agent, onClose, brandId }: { poId: string; agent: any; onClose: () => void; brandId: string }) {
  const fn = useServerFn(markArrivedInBd);
  const invalidate = useInvalidateOrder();
  const { data: wallets = [] } = useAccounts(brandId);
  const [weight, setWeight] = useState<number>(0);
  const [rate, setRate] = useState<number>(Number(agent?.default_shipping_rate_per_kg_bdt ?? 0));
  const [payNow, setPayNow] = useState(false);
  const [walletId, setWalletId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const total = weight * rate;

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        po_id: poId, total_weight_kg: weight, rate_per_kg_bdt: rate,
        idempotency_key: newIdemKey("arr"),
      };
      if (payNow && walletId && total > 0) {
        payload.shipping_payment = {
          amount: total, wallet_id: walletId, payment_date: date,
          idempotency_key: newIdemKey("pay"),
        };
      }
      return await fn({ data: payload });
    },
    onSuccess: () => { toast.success("Marked as arrived in BD"); invalidate(poId); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Arrived in Bangladesh</DialogTitle>
          <DialogDescription>Enter actual shipped weight and rate. Shipping is prorated across cartons by weight.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Total weight (kg)</Label><Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></div>
            <div><Label>Rate (BDT/kg)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
          </div>
          <div className="p-3 rounded-md bg-muted/50 text-sm flex justify-between">
            <span className="text-muted-foreground">Total shipping cost</span>
            <span className="font-bold tabular-nums">{fmtBdt(total)}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} className="rounded" />
            Pay shipping now
          </label>
          {payNow && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Wallet</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={weight <= 0 || rate <= 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm Arrival
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ poId, brandId, onClose }: { poId: string; brandId: string; onClose: () => void }) {
  const fn = useServerFn(recordImportPayment);
  const invalidate = useInvalidateOrder();
  const { data: wallets = [] } = useAccounts(brandId);
  const [amount, setAmount] = useState<number>(0);
  const [walletId, setWalletId] = useState("");
  const [type, setType] = useState("supplier_payment");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");

  const mut = useMutation({
    mutationFn: () => fn({ data: {
      brand_id: brandId, po_id: poId, payment_type: type as any,
      amount_bdt: amount, wallet_id: walletId, payment_date: date, reference: ref || undefined,
      idempotency_key: newIdemKey("pay"),
    } }),
    onSuccess: () => { toast.success("Payment recorded"); invalidate(poId); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payment type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier_advance">Supplier Advance</SelectItem>
                <SelectItem value="supplier_payment">Supplier Payment</SelectItem>
                <SelectItem value="shipping">Shipping</SelectItem>
                <SelectItem value="supplier_balance">Supplier Balance</SelectItem>
                <SelectItem value="local_courier">Local Courier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount (BDT)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div>
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={amount <= 0 || !walletId || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDialog({ cartonId, carton, brandId, onClose }: { cartonId: string; carton: any; brandId: string; onClose: () => void }) {
  const fn = useServerFn(releaseCarton);
  const invalidate = useInvalidateOrder();
  const { data: wallets = [] } = useAccounts(brandId);
  const [payNow, setPayNow] = useState(true);
  const [amount, setAmount] = useState<number>(Number(carton?.local_courier_bdt ?? 0));
  const [walletId, setWalletId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [releaseWithoutPay, setReleaseWithoutPay] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = { carton_id: cartonId, idempotency_key: newIdemKey("rel") };
      if (releaseWithoutPay) payload.release_without_payment = true;
      else if (payNow && amount > 0 && walletId) {
        payload.payment = { amount, wallet_id: walletId, payment_date: date, idempotency_key: newIdemKey("pay") };
      }
      return await fn({ data: payload });
    },
    onSuccess: () => { toast.success("Carton released"); invalidate(carton?.po_id); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Release Carton CTN-{carton?.carton_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={releaseWithoutPay} onChange={(e) => setReleaseWithoutPay(e.target.checked)} className="rounded" />
            Release without payment (admin)
          </label>
          {!releaseWithoutPay && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount (BDT)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
                <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              </div>
              <div>
                <Label>Wallet</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending || (!releaseWithoutPay && (amount <= 0 || !walletId))} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QcDialog({ carton, brandId, poItems, onClose }: { carton: any; brandId: string; poItems: any[]; onClose: () => void }) {
  const fn = useServerFn(postCartonToInventory);
  const whFn = useServerFn(listWarehouses);
  const invalidate = useInvalidateOrder();
  const { data: warehouses = [] } = useQuery({ queryKey: ["imp-wh", brandId], queryFn: () => whFn({ data: { brandId } }) });
  const [qc, setQc] = useState<Record<string, { ok: number; damaged: number; missing: number }>>(() => {
    const init: any = {};
    (carton?.items ?? []).forEach((it: any) => {
      init[it.id] = { ok: it.quantity_expected, damaged: 0, missing: 0 };
    });
    return init;
  });
  const [warehouseId, setWarehouseId] = useState<string>("");

  const errors = useMemo(() => {
    return (carton?.items ?? []).flatMap((it: any) => {
      const q = qc[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
      const sum = q.ok + q.damaged + q.missing;
      if (sum !== it.quantity_expected) return [`${it.sku_snapshot ?? "Item"}: sum ${sum} ≠ expected ${it.quantity_expected}`];
      return [];
    });
  }, [qc, carton]);

  const mut = useMutation({
    mutationFn: () => fn({ data: {
      carton_id: carton.id,
      warehouse_id: warehouseId || undefined,
      qc: Object.entries(qc).map(([carton_item_id, v]) => ({ carton_item_id, quantity_ok: v.ok, quantity_damaged: v.damaged, quantity_missing: v.missing })),
      idempotency_key: newIdemKey("post"),
    } as any }),
    onSuccess: () => { toast.success("Posted to inventory"); invalidate(carton?.po_id); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>QC & Post to Inventory — CTN-{carton?.carton_number}</DialogTitle>
          <DialogDescription>Confirm OK / damaged / missing quantities. Sum must equal expected qty.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          <div>
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Default warehouse" /></SelectTrigger>
              <SelectContent>
                {(warehouses as any[]).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? " (default)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {(carton?.items ?? []).map((it: any) => {
              const q = qc[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
              const item = poItems.find((p) => p.id === it.po_item_id);
              return (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-end p-2 rounded-md border border-border">
                  <div className="col-span-12 md:col-span-4">
                    <div className="text-sm font-medium truncate">{item?.name_snapshot ?? it.sku_snapshot ?? "Item"}</div>
                    <div className="text-xs text-muted-foreground">Expected: {it.quantity_expected}</div>
                  </div>
                  <div className="col-span-4 md:col-span-2"><Label className="text-xs">OK</Label><Input type="number" min={0} value={q.ok} onChange={(e) => setQc((s) => ({ ...s, [it.id]: { ...q, ok: Number(e.target.value) } }))} /></div>
                  <div className="col-span-4 md:col-span-2"><Label className="text-xs">Damaged</Label><Input type="number" min={0} value={q.damaged} onChange={(e) => setQc((s) => ({ ...s, [it.id]: { ...q, damaged: Number(e.target.value) } }))} /></div>
                  <div className="col-span-4 md:col-span-2"><Label className="text-xs">Missing</Label><Input type="number" min={0} value={q.missing} onChange={(e) => setQc((s) => ({ ...s, [it.id]: { ...q, missing: Number(e.target.value) } }))} /></div>
                  <div className="col-span-12 md:col-span-2 text-right text-xs">
                    Sum: <span className={q.ok + q.damaged + q.missing === it.quantity_expected ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>{q.ok + q.damaged + q.missing}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {errors.length > 0 && (
            <div className="text-xs text-orange-600 flex items-start gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/30">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <div>{errors.join(" · ")}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={errors.length > 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Post to Inventory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}