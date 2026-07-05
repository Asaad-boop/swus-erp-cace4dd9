import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Truck, Warehouse as WarehouseIcon, Plane, CheckCircle2,
  AlertTriangle, Wallet, ClipboardCheck, ChevronDown, Loader2, ShoppingCart,
  PackageCheck, Receipt, Send, Trash2, Package,
} from "lucide-react";
import { toast } from "sonner";
import { useAccounts } from "@/hooks/erp/use-finance-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AmountPercentInput } from "@/components/erp/amount-percent-input";
import {
  getPurchaseOrderDetail, updateCartonStage, markArrivedInBd,
  releaseCarton, postCartonToInventory, recordImportPayment, listWarehouses,
  deleteImportPo,
} from "@/lib/erp/imports/imports.functions";
import {
  PO_STATUS_LABEL, CARTON_STATUS_LABEL, fmtBdt, newIdemKey,
  type ImpPoStatus, type ImpCartonStatus,
} from "@/lib/erp/imports/types";
import { LandedCostCard } from "@/components/erp/imports/landed-cost-card";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/$orderId")({
  head: () => ({ meta: [{ title: "Purchase Order — Imports" }] }),
  component: PoDetailPage,
});

/* ============== Pipeline stages config (matches video) ============== */

const PIPELINE_STAGES: { key: ImpCartonStatus; label: string; icon: any; bg: string; ring: string; text: string }[] = [
  { key: "ordered",            label: "ORDERED",    icon: ShoppingCart,  bg: "bg-blue-500",    ring: "ring-blue-200 dark:ring-blue-900",    text: "text-blue-600" },
  { key: "at_china_warehouse", label: "CHINA WH",   icon: WarehouseIcon, bg: "bg-cyan-500",    ring: "ring-cyan-200 dark:ring-cyan-900",    text: "text-cyan-600" },
  { key: "in_transit",         label: "IN TRANSIT", icon: Plane,         bg: "bg-indigo-500",  ring: "ring-indigo-200 dark:ring-indigo-900","text": "text-indigo-600" } as any,
  { key: "arrived_bd",         label: "ARRIVED BD", icon: Truck,         bg: "bg-orange-500",  ring: "ring-orange-200 dark:ring-orange-900","text": "text-orange-600" } as any,
  { key: "released",           label: "RELEASED",   icon: PackageCheck,  bg: "bg-violet-500",  ring: "ring-violet-200 dark:ring-violet-900","text": "text-violet-600" } as any,
  { key: "in_stock",           label: "IN STOCK",   icon: CheckCircle2,  bg: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-900","text": "text-emerald-600" } as any,
];

function PoDetailPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const detailFn = useServerFn(getPurchaseOrderDetail);
  const stageFn = useServerFn(updateCartonStage);
  const navigate = useNavigate();
  const deleteFn = useServerFn(deleteImportPo);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { poId: orderId, confirm: "DELETE" } }),
    onSuccess: () => {
      toast.success("Purchase Order deleted; transactions reversed");
      qc.invalidateQueries({ queryKey: ["imp-pos"] });
      navigate({ to: "/erp/imports/orders" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["imp-po", orderId],
    queryFn: () => detailFn({ data: { poId: orderId } }),
  });

  const [arrivedOpen, setArrivedOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const stageMut = useMutation({
    mutationFn: (vars: { carton_id: string; new_stage: ImpCartonStatus }) =>
      stageFn({ data: { ...vars, idempotency_key: newIdemKey("stage") } as any }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["imp-po", orderId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [selectedCartons, setSelectedCartons] = useState<Set<string>>(new Set());
  const [bulkReleaseOpen, setBulkReleaseOpen] = useState(false);
  const bulkMarkSelected = async (stage: ImpCartonStatus, cartons: any[]) => {
    const targets = cartons.filter((c) => selectedCartons.has(c.id) && ["ordered", "at_china_warehouse", "in_transit"].includes(c.status));
    if (targets.length === 0) { toast.info("No selected cartons can move to this stage"); return; }
    try {
      await Promise.all(targets.map((c) => stageFn({ data: { carton_id: c.id, new_stage: stage, idempotency_key: newIdemKey("stage") } as any })));
      toast.success(`Marked ${targets.length} cartons as ${CARTON_STATUS_LABEL[stage].label}`);
      setSelectedCartons(new Set());
      qc.invalidateQueries({ queryKey: ["imp-po", orderId] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data?.po) return <div className="p-6 text-sm text-muted-foreground">Purchase order not found.</div>;

  const po: any = data.po;
  // Always derive brand from the PO row — works in single-brand and All-Brands mode.
  const brandId: string | null = po?.brand_id ?? null;
  const items: any[] = data.items;
  const cartons: any[] = data.cartons;
  const payments: any[] = data.payments;

  const totalCartons = cartons.length;
  const totalPieces = cartons.reduce((s, c) => s + Number(c.expected_quantity || 0), 0);
  const deliveredCartons = cartons.filter((c) => c.status === "in_stock").length;
  const deliveredPieces = cartons.filter((c) => c.status === "in_stock")
    .reduce((s, c) => s + Number(c.expected_quantity || 0), 0);
  const deliveredPct = totalPieces > 0 ? Math.round((deliveredPieces / totalPieces) * 100) : 0;

  const paidPct = Number(po.grand_total_bdt) > 0 ? Math.round((Number(po.paid_bdt) / Number(po.grand_total_bdt)) * 100) : 0;

  // pipeline counts
  const stageCounts = PIPELINE_STAGES.map((s) => {
    const list = cartons.filter((c) => c.status === s.key);
    return { ...s, count: list.length, pieces: list.reduce((sum, c) => sum + Number(c.expected_quantity || 0), 0) };
  });

  // 4 summary boxes below pipeline (matches video)
  const deliveredBox = { c: deliveredCartons, p: deliveredPieces };
  const arrivedReleasedBox = cartons.filter((c) => ["arrived_bd", "released"].includes(c.status));
  const inTransitBox = cartons.filter((c) => ["at_china_warehouse", "in_transit"].includes(c.status));
  const remainingBox = cartons.filter((c) => c.status !== "in_stock" && c.status !== "cancelled");

  // Landed cost should appear only after goods reach Bangladesh.
  const LANDED_PO_STATUSES = new Set(["arrived_bd", "partially_received", "completed"]);
  const LANDED_CARTON_STATUSES = new Set(["arrived_bd", "released", "in_stock"]);
  const showLandedCost =
    LANDED_PO_STATUSES.has(po.status) ||
    cartons.some((c) => LANDED_CARTON_STATUSES.has(c.status));

  // Show simplified shipping cost card once the PO (or any carton) has arrived in BD.

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <Card className="p-5 bg-gradient-to-br from-primary/5 via-card to-card border-primary/10">
        <div className="flex items-start gap-3 flex-wrap">
          <Link to="/erp/imports/orders"><Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" />Purchase Orders</Button></Link>
        </div>
        <div className="mt-2 flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium tracking-wider text-muted-foreground">IMPORTS / ORDER</div>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <h1 className="text-2xl font-bold font-mono">{po.po_number}</h1>
              <Badge variant="secondary" className={PO_STATUS_LABEL[po.status as ImpPoStatus]?.tone}>
                {PO_STATUS_LABEL[po.status as ImpPoStatus]?.label ?? po.status}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{po.supplier?.name ?? "—"}</span>
              <span>📅 {po.order_date}</span>
              <span>$ FX {Number(po.fx_rate)} · {po.currency}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPaymentOpen(true)}><Wallet className="h-4 w-4 mr-1" />Record Payment</Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Delete PO
            </Button>
          </div>
        </div>

        {/* 4 KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <KpiTile icon="$" label="Grand Total" value={fmtBdt(po.grand_total_bdt)} />
          <KpiTile icon={<PackageCheck className="h-4 w-4 text-emerald-600" />} label="Paid" value={fmtBdt(po.paid_bdt)} valueClass="text-emerald-600" />
          <KpiTile icon={<AlertTriangle className="h-4 w-4 text-orange-600" />} label="Due" value={fmtBdt(po.due_bdt)} valueClass="text-orange-600" />
          <KpiTile
            icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
            label="Delivered"
            value={`${deliveredCartons} / ${totalCartons}`}
            hint={`${deliveredPieces} / ${totalPieces} pcs · ${deliveredPct}%`}
          />
        </div>
      </Card>

      {/* Order Pipeline */}
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold">Order Pipeline</h3>
            <p className="text-xs text-muted-foreground">Track the journey of this purchase order from China to your warehouse.</p>
          </div>
          <div className="text-right text-xs">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Delivered</span>{" "}
            <span className="font-medium">{deliveredCartons}/{totalCartons} cartons · {deliveredPieces}/{totalPieces} pcs</span>
          </div>
        </div>
        <PipelineStrip stages={stageCounts} activeStatus={po.status as ImpPoStatus} />
        {!showLandedCost && (
          <div className="mt-4 rounded-md border border-dashed border-orange-300/70 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20 px-3 py-2 text-[12px] text-orange-800 dark:text-orange-200 flex items-center gap-2">
            <Truck className="h-3.5 w-3.5" />
            <span>
              <span className="font-semibold">Arrived BD</span> stage e pouchhaleI FX rate + freight + customs enter korte parben — tarpor inventory te post hobe.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <SummaryBox tone="emerald" label="DELIVERED" cartons={deliveredBox.c} pieces={deliveredBox.p} />
          <SummaryBox tone="orange" label="ARRIVED / RELEASED" cartons={arrivedReleasedBox.length} pieces={arrivedReleasedBox.reduce((s, c) => s + Number(c.expected_quantity || 0), 0)} />
          <SummaryBox tone="indigo" label="IN TRANSIT" cartons={inTransitBox.length} pieces={inTransitBox.reduce((s, c) => s + Number(c.expected_quantity || 0), 0)} />
          <SummaryBox tone="slate" label="REMAINING" cartons={remainingBox.length} pieces={remainingBox.reduce((s, c) => s + Number(c.expected_quantity || 0), 0)} />
        </div>
      </Card>

      {/* Payment Progress */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="font-semibold inline-flex items-center gap-2"><Wallet className="h-4 w-4" />Payment Progress</h3>
          <div className="text-sm">
            <span className="text-emerald-600 font-semibold tabular-nums">{fmtBdt(po.paid_bdt)}</span>
            <span className="text-muted-foreground"> / {fmtBdt(po.grand_total_bdt)}</span>
            <span className="ml-2 text-xs text-muted-foreground">({paidPct}%)</span>
          </div>
        </div>
        <Progress value={paidPct} className="h-2 [&>div]:bg-emerald-500" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
          <Mini label="SUBTOTAL" value={fmtBdt(po.product_subtotal_bdt)} />
          <Mini label="SHIPPING CN→BD" value={fmtBdt(po.shipping_total_bdt)} />
          <Mini label="LOCAL COURIER" value={fmtBdt(po.local_courier_total_bdt)} />
          <Mini label="OUTSTANDING DUE" value={fmtBdt(po.due_bdt)} valueClass="text-orange-600" />
        </div>
      </Card>

      {/* Products */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Products</h3>
          <Badge variant="outline" className="text-[11px]">{items.length} items</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[64px]"></TableHead>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit {po.currency}</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it: any) => {
              const liveImg = it.product?.image ?? it.image_snapshot;
              const liveName = it.product?.title ?? it.name_snapshot;
              const liveSku = it.product?.sku ?? it.sku_snapshot;
              return (
              <TableRow key={it.id}>
                <TableCell className="py-2">
                  {liveImg ? (
                    <img
                      src={liveImg}
                      alt={liveName ?? ""}
                      className="h-12 w-12 rounded-md object-cover border border-border bg-muted"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted border border-dashed border-border flex items-center justify-center text-muted-foreground/60 text-[10px]">
                      No img
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium max-w-[420px]">
                  <div className="truncate" title={liveName ?? ""}>{liveName}</div>
                  {it.product_id && (
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">Inventory linked</div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{liveSku ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(it.unit_cost_foreign).toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtBdt(it.subtotal_bdt)}</TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
      </Card>

      {brandId && items.length > 0 && showLandedCost && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>💡 Enter landed costs after goods arrive in Bangladesh — FX rate, freight & customs lock here before posting to inventory.</span>
          </div>
          <LandedCostCard
          brandId={brandId}
          poId={po.id}
          items={items.map((it: any) => ({
            id: it.id,
            name: it.name_snapshot ?? "—",
            quantity: Number(it.quantity) || 0,
            unit_cost_cny: Number(it.unit_cost_cny ?? it.unit_cost_foreign) || 0,
          }))}
          initialFxRate={Number(po.fx_rate_cny_bdt ?? po.fx_rate) || 14}
          initialFreight={Number(po.freight_cost_bdt) || 0}
          initialCustoms={Number(po.customs_duty_bdt) || 0}
          initialOther={Number(po.other_charges_bdt) || 0}
          initialAgentCommissionCny={Number(po.agent_commission_cny) || 0}
          fxLockedAt={po.fx_rate_locked_at}
          fxSource={po.fx_rate_source}
          />
        </div>
      )}

      {/* "Goods arrived in BD?" alert — only when PO has not yet been received in BD */}
      {!["arrived_bd", "completed", "cancelled"].includes(po.status) && (
        <Card className="p-4 border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-900/40">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
              <Truck className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Goods arrived in BD?</div>
              <p className="text-xs text-muted-foreground">Enter shipping bill (weight × rate) — auto-distributes to cartons</p>
            </div>
            <Button onClick={() => setArrivedOpen(true)}><Truck className="h-4 w-4 mr-1" />Receive at BD</Button>
          </div>
        </Card>
      )}

      {/* Cartons */}
      <Card className="overflow-hidden">
        <CartonsHeader
          cartons={cartons}
          selected={selectedCartons}
          setSelected={setSelectedCartons}
          onBulkStage={(s) => bulkMarkSelected(s, cartons)}
          onBulkRelease={() => setBulkReleaseOpen(true)}
          poPaid={payments
            .filter((p: any) => !p.is_reversed && ["supplier_advance", "supplier_payment", "supplier_balance"].includes(p.payment_type))
            .reduce((s: number, p: any) => s + Number(p.amount_bdt || 0), 0)}
          poSupplierTotal={Number(po.product_subtotal_bdt ?? 0)}
        />
        <div className="divide-y divide-border">
          {cartons.map((c) => (
            <CartonRow
              key={c.id}
              carton={c}
              poId={po.id}
              poNumber={po.po_number}
              poItems={items}
              brandId={brandId}
              poDue={Number(po.due_bdt)}
              poPaid={payments
                .filter((p: any) => !p.is_reversed && ["supplier_advance", "supplier_payment", "supplier_balance"].includes(p.payment_type))
                .reduce((s: number, p: any) => s + Number(p.amount_bdt || 0), 0)}
              poSupplierTotal={Number(po.product_subtotal_bdt ?? 0)}
              onStage={(stage) => stageMut.mutate({ carton_id: c.id, new_stage: stage })}
              selected={selectedCartons.has(c.id)}
              onToggleSelect={() => {
                setSelectedCartons((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                  return n;
                });
              }}
            />
          ))}
        </div>
      </Card>

      {/* Payments */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold inline-flex items-center gap-2"><Receipt className="h-4 w-4" />Payments</h3>
          <Badge variant="outline" className="text-[11px]">{payments.length}</Badge>
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
                  <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{p.payment_type.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="text-sm">{p.wallet?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{fmtBdt(p.amount_bdt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Dialogs */}
      {arrivedOpen && brandId && (
        <ArrivedDialog poId={po.id} onClose={() => setArrivedOpen(false)} brandId={brandId} />
      )}
      {paymentOpen && brandId && (
        <PaymentDialog
          poId={po.id}
          brandId={brandId}
          grandTotal={Number(po.grand_total_bdt) || 0}
          dueAmount={Number(po.due_bdt) || 0}
          onClose={() => setPaymentOpen(false)}
        />
      )}

      {bulkReleaseOpen && brandId && (
        <BulkReleaseDialog
          poId={po.id}
          brandId={brandId}
          cartons={cartons.filter((c) => selectedCartons.has(c.id) && c.status === "arrived_bd")}
          poPaid={payments
            .filter((p: any) => !p.is_reversed && ["supplier_advance", "supplier_payment", "supplier_balance"].includes(p.payment_type))
            .reduce((s: number, p: any) => s + Number(p.amount_bdt || 0), 0)}
          poSupplierTotal={Number(po.product_subtotal_bdt ?? 0)}
          onClose={() => setBulkReleaseOpen(false)}
          onDone={() => { setBulkReleaseOpen(false); setSelectedCartons(new Set()); }}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeleteConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete this Purchase Order?</DialogTitle>
            <DialogDescription>
              This permanently deletes <b>{po.po_number}</b>, all its cartons & items,
              reverses every recorded payment (wallet balance restored, journal entries removed),
              and rolls back any stock that was posted to inventory from this PO. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Type <code className="font-mono font-bold text-foreground">DELETE</code> to confirm</Label>
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== "DELETE" || deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============== Header + KPI tiles ============== */

function KpiTile({ icon, label, value, valueClass, hint }: { icon: React.ReactNode; label: string; value: string; valueClass?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-wider text-muted-foreground">
        <span className="h-5 w-5 inline-flex items-center justify-center rounded-md bg-muted">{typeof icon === "string" ? icon : icon}</span>
        {label}
      </div>
      <div className={cn("text-xl font-bold tabular-nums mt-1", valueClass)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Mini({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={cn("font-bold tabular-nums text-sm mt-0.5", valueClass)}>{value}</div>
    </div>
  );
}

function SummaryBox({ tone, label, cartons, pieces }: { tone: "emerald" | "orange" | "indigo" | "slate"; label: string; cartons: number; pieces: number }) {
  const toneMap = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    orange:  "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/40 text-orange-700 dark:text-orange-300",
    indigo:  "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-300",
    slate:   "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300",
  };
  return (
    <div className={cn("rounded-lg border p-3", toneMap[tone])}>
      <div className="text-[10px] tracking-wider font-semibold opacity-80">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{cartons} <span className="text-[11px] font-medium opacity-70">cartons</span></div>
      <div className="text-[11px] opacity-70 mt-0.5">{pieces} pcs</div>
    </div>
  );
}

/* ============== Pipeline horizontal strip ============== */

function PipelineStrip({ stages, activeStatus }: { stages: any[]; activeStatus: ImpPoStatus }) {
  const activeIdx = useMemo(() => {
    const map: Partial<Record<ImpPoStatus, number>> = {
      ordered: 0, at_china_warehouse: 1, in_transit: 2, arrived_bd: 3, partially_received: 4, completed: 5,
    };
    return map[activeStatus] ?? 0;
  }, [activeStatus]);

  return (
    <div className="relative">
      <div className="absolute left-8 right-8 top-6 h-0.5 bg-gradient-to-r from-primary/40 via-primary/40 to-primary/40" />
      <div className="grid grid-cols-6 gap-2 relative">
        {stages.map((s, i) => {
          const isActive = i <= activeIdx;
          const isCurrent = i === activeIdx;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex flex-col items-center text-center">
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center border-2 transition-all",
                isActive ? `${s.bg} text-white border-transparent shadow-md` : "bg-background border-border text-muted-foreground",
                isCurrent && `ring-4 ${s.ring}`,
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div className={cn("mt-2 text-[10px] tracking-wider font-semibold", isActive ? s.text : "text-muted-foreground")}>{s.label}</div>
              <div className={cn("text-base font-bold tabular-nums", isActive ? "" : "text-muted-foreground/60")}>{s.count}</div>
              <div className="text-[10px] text-muted-foreground">{s.pieces} pcs</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============== Carton row (inline accordion: STEP 1 / STEP 2) ============== */

function CartonRow({ carton, poId, poNumber, poItems, brandId, poDue, poPaid, poSupplierTotal, onStage, selected, onToggleSelect }: {
  carton: any; poId: string; poNumber: string; poItems: any[]; brandId: string | null; poDue: number; poPaid: number; poSupplierTotal: number;
  onStage: (s: ImpCartonStatus) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const status = carton.status as ImpCartonStatus;
  const meta = CARTON_STATUS_LABEL[status];

  // expand by default if action is required (arrived_bd or released)
  const needsAction = status === "arrived_bd" || status === "released";
  const selectable = ["ordered", "at_china_warehouse", "in_transit", "arrived_bd"].includes(status);

  return (
    <div className={cn("transition-colors", needsAction && "bg-orange-50/30 dark:bg-orange-950/10", selected && "bg-primary/5")}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-accent/40 text-left cursor-pointer"
      >
        {selectable && onToggleSelect && (
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="inline-flex"
          >
            <Checkbox
              checked={!!selected}
              onCheckedChange={(checked) => {
                if (checked !== selected) onToggleSelect();
              }}
              aria-label="Select carton"
            />
          </span>
        )}
        <Badge variant="secondary" className={cn("font-medium", meta?.tone)}>{meta?.label}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-semibold">{poNumber}-C{carton.carton_number}</div>
          <div className="text-[11px] text-muted-foreground">{carton.expected_quantity} pcs · landed {fmtBdt(carton.total_landed_bdt)}</div>
        </div>
        <div className="hidden md:block text-right text-xs">
          <div>Product: <span className="tabular-nums font-medium">{fmtBdt(carton.supplier_cost_bdt)}</span></div>
          <div className="text-muted-foreground">Ship: <span className="tabular-nums font-medium">{fmtBdt(carton.shipping_charge_bdt)}</span></div>
        </div>
        {["ordered", "at_china_warehouse", "in_transit"].includes(status) && (
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={status} onValueChange={(v) => onStage(v as ImpCartonStatus)}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="at_china_warehouse">At China WH</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-background/50">
          {status === "arrived_bd" && brandId && (
            <InlineReleaseForm carton={carton} brandId={brandId} poId={poId} poPaid={poPaid} poSupplierTotal={poSupplierTotal} />
          )}
          {status === "released" && brandId && (
            <InlineQcForm carton={carton} brandId={brandId} poItems={poItems} poId={poId} poDue={poDue} />
          )}
          {!needsAction && (
            <div className="text-xs text-muted-foreground py-2">
              {status === "in_stock" && carton.posted_at ? `Posted to inventory on ${carton.posted_at}` : "No action required at this stage."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============== Inline Release form (STEP 1) ============== */

function InlineReleaseForm({ carton, brandId, poId, poPaid, poSupplierTotal }: { carton: any; brandId: string; poId: string; poPaid: number; poSupplierTotal: number }) {
  const fn = useServerFn(releaseCarton);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  // Prorate PO advance against this carton's supplier share — user pays only the remaining due + this carton's shipping
  const supplierCost = Number(carton.supplier_cost_bdt ?? 0);
  const shippingCost = Number(carton.shipping_charge_bdt ?? 0);
  const advanceShare = poSupplierTotal > 0 ? (poPaid * supplierCost) / poSupplierTotal : 0;
  const supplierDueShare = Math.max(0, supplierCost - advanceShare);
  const defaultPay = Math.round((supplierDueShare + shippingCost) * 100) / 100;
  const [amount, setAmount] = useState<number>(defaultPay);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");
  const [withoutPay, setWithoutPay] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = { carton_id: carton.id, idempotency_key: newIdemKey("rel") };
      if (withoutPay) payload.release_without_payment = true;
      else {
        if (amount <= 0) throw new Error("Pay amount required");
        if (!walletId) throw new Error("Pick a wallet");
        payload.payment = { amount, wallet_id: walletId, payment_date: new Date().toISOString().slice(0, 10), reference: ref || undefined, idempotency_key: newIdemKey("pay") };
      }
      return await fn({ data: payload });
    },
    onSuccess: () => { toast.success("Carton released"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-3 py-3">
      <div className="text-[11px] tracking-wider font-semibold text-muted-foreground">STEP 1 — RELEASE (PAY &amp; CONFIRM)</div>
      <div className="text-xs text-muted-foreground">
        Supplier: <span className="tabular-nums">{fmtBdt(supplierCost)}</span>
        {advanceShare > 0 && <> − Advance share: <span className="tabular-nums text-green-600">{fmtBdt(advanceShare)}</span> = Due: <span className="tabular-nums font-medium">{fmtBdt(supplierDueShare)}</span></>}
        {" · "}Shipping: <span className="tabular-nums">{fmtBdt(shippingCost)}</span>
        {" · "}<span className="font-semibold">To pay: <span className="tabular-nums">{fmtBdt(defaultPay)}</span></span>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div><Label className="text-xs">Pay amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} disabled={withoutPay} /></div>
        <div>
          <Label className="text-xs">Wallet</Label>
          <Select value={walletId} onValueChange={setWalletId} disabled={withoutPay}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" disabled={withoutPay} /></div>
      </div>
      <label className="inline-flex items-center gap-2 text-xs">
        <Checkbox checked={withoutPay} onCheckedChange={(v) => setWithoutPay(!!v)} />
        Release without payment (carry as PO due)
      </label>
      <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<Send className="h-4 w-4 mr-1" />Release carton
      </Button>
    </div>
  );
}

/* ============== Inline QC form (STEP 2 — full accounting preview) ============== */

function InlineQcForm({ carton, brandId, poItems, poId, poDue }: { carton: any; brandId: string; poItems: any[]; poId: string; poDue: number }) {
  const fn = useServerFn(postCartonToInventory);
  const whFn = useServerFn(listWarehouses);
  const qc = useQueryClient();
  const { data: warehouses = [] } = useQuery({ queryKey: ["imp-wh", brandId], queryFn: () => whFn({ data: { brandId } }) });
  const { data: wallets = [] } = useAccounts([brandId]);

  const [rows, setRows] = useState<Record<string, { ok: number; damaged: number; missing: number }>>(() => {
    const init: any = {};
    (carton?.items ?? []).forEach((it: any) => {
      init[it.id] = { ok: it.quantity_expected, damaged: 0, missing: 0 };
    });
    return init;
  });
  const [warehouseId, setWarehouseId] = useState("");
  const [courierBdt, setCourierBdt] = useState<number>(0);
  const [courierWalletId, setCourierWalletId] = useState("");
  const [qcNotes, setQcNotes] = useState("");

  const totalExpected = (carton.items ?? []).reduce((s: number, it: any) => s + Number(it.quantity_expected || 0), 0);
  const totalDamaged = Object.values(rows).reduce((s, r) => s + Number(r.damaged || 0), 0);
  const totalMissing = Object.values(rows).reduce((s, r) => s + Number(r.missing || 0), 0);
  const totalOk = Object.values(rows).reduce((s, r) => s + Number(r.ok || 0), 0);

  const productCost = Number(carton.supplier_cost_bdt || 0);
  const shipCost = Number(carton.shipping_charge_bdt || 0);
  const courierCost = Number(courierBdt || 0);
  const totalLanded = productCost + shipCost + courierCost;
  const perPieceTotal = totalExpected > 0 ? totalLanded / totalExpected : 0;
  const lossCount = totalDamaged + totalMissing;
  const lossValue = lossCount * perPieceTotal;
  const okValueAbs = totalOk * perPieceTotal;
  const finalInventoryCost = totalLanded; // loss absorbed in ok
  const perOkPiece = totalOk > 0 ? finalInventoryCost / totalOk : 0;

  const rowErrors = useMemo(() => (carton.items ?? []).flatMap((it: any) => {
    const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
    if (r.ok < 0 || r.damaged < 0 || r.missing < 0) return [`Negative quantities not allowed`];
    return [];
  }), [rows, carton]);

  const validationErrors: string[] = [];
  if (!warehouseId) validationErrors.push("Pick warehouse");
  if (courierBdt > 0 && !courierWalletId) validationErrors.push("Pick local courier wallet");

  const selectedCourierWallet = wallets.find((w) => w.id === courierWalletId);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        carton_id: carton.id,
        warehouse_id: warehouseId,
        qc: Object.entries(rows).map(([carton_item_id, v]) => ({ carton_item_id, quantity_ok: v.ok, quantity_damaged: v.damaged, quantity_missing: v.missing })),
        idempotency_key: newIdemKey("post"),
        notes: qcNotes || undefined,
      };
      if (courierBdt > 0 && courierWalletId) {
        payload.local_courier_payment = { amount: courierBdt, wallet_id: courierWalletId, payment_date: new Date().toISOString().slice(0, 10), idempotency_key: newIdemKey("crp") };
      }
      return await fn({ data: payload });
    },
    onSuccess: (res: any) => {
      const unit = Number(res?.unit_landed ?? 0);
      if (unit > 0) {
        toast.success(`✅ Posted ${totalOk} pcs — landed cost ৳${unit.toFixed(2)}/unit`);
      } else if (res?.idempotent_replay) {
        toast.success("Already posted (idempotent replay)");
      } else {
        toast.warning(`⚠️ Posted ${totalOk} pcs without cost (no FX/extras set)`);
      }
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4 py-3">
      <div className="text-[11px] tracking-wider font-semibold text-muted-foreground">STEP 2 — QC &amp; POST TO INVENTORY</div>

      {/* Landed Cost Breakdown */}
      <Card className="p-3 bg-muted/30">
        <div className="text-[10px] tracking-wider text-muted-foreground font-semibold mb-2">LANDED COST BREAKDOWN</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <Mini label="Product" value={fmtBdt(productCost)} />
          <Mini label="Shipping (CN→BD)" value={fmtBdt(shipCost)} />
          <Mini label="Local courier" value={fmtBdt(courierCost)} />
          <Mini label="Total landed" value={fmtBdt(totalLanded)} />
          <Mini label={`Per piece (${totalExpected})`} value={fmtBdt(perPieceTotal)} valueClass="text-primary" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          <Mini label="OK pieces" value={String(totalOk)} />
          <Mini label="Per OK piece" value={fmtBdt(perOkPiece)} valueClass="text-primary" />
          <Mini label={`Loss (${lossCount} pcs)`} value={fmtBdt(lossValue)} valueClass="text-orange-600" />
          <Mini label="Final inventory cost" value={fmtBdt(finalInventoryCost)} valueClass="text-emerald-600" />
        </div>
      </Card>

      {/* SKU rows */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right w-24">Damaged</TableHead>
              <TableHead className="text-right w-24">Missing</TableHead>
              <TableHead className="text-right w-20">OK</TableHead>
              <TableHead className="text-right">OK unit ৳</TableHead>
              <TableHead className="text-right">OK value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(carton.items ?? []).map((it: any) => {
              const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
              const itemUnit = totalOk > 0 ? perOkPiece : 0;
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.sku_snapshot ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.quantity_expected}</TableCell>
                  <TableCell><Input type="number" min={0} value={r.damaged} className="h-8 text-right" onChange={(e) => setRows((s) => ({ ...s, [it.id]: { ...r, damaged: Number(e.target.value) } }))} /></TableCell>
                  <TableCell><Input type="number" min={0} value={r.missing} className="h-8 text-right" onChange={(e) => setRows((s) => ({ ...s, [it.id]: { ...r, missing: Number(e.target.value) } }))} /></TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{r.ok}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{fmtBdt(itemUnit)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{fmtBdt(r.ok * itemUnit)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {/* Recompute OK = expected - damaged - missing on each render */}
      <RowsAutoCompute rows={rows} setRows={setRows} carton={carton} />

      {rowErrors.length > 0 && (
        <div className="text-xs text-orange-600 flex items-start gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/30">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <div>{rowErrors.join(" · ")}</div>
        </div>
      )}

      {/* Warehouse + local courier */}
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Warehouse *</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
            <SelectContent>{(warehouses as any[]).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? " (default)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Local courier ৳ (optional)</Label><Input type="number" step="0.01" value={courierBdt} onChange={(e) => setCourierBdt(Number(e.target.value))} /></div>
        <div>
          <Label className="text-xs">Local courier wallet</Label>
          <Select value={courierWalletId} onValueChange={setCourierWalletId} disabled={courierBdt <= 0}>
            <SelectTrigger><SelectValue placeholder="Wallet" /></SelectTrigger>
            <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">QC notes</Label>
        <Textarea value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} placeholder="Optional" className="min-h-[60px]" />
      </div>

      {/* Accounting preview */}
      <Card className="p-3 bg-muted/30">
        <div className="text-[10px] tracking-wider text-muted-foreground font-semibold mb-2">ACCOUNTING PREVIEW</div>
        <div className="space-y-1.5 text-xs">
          <Row left={`Inventory in (${totalOk} OK pcs @ ${fmtBdt(perOkPiece)})`} right={`+${fmtBdt(finalInventoryCost - lossValue)}`} rightClass="text-emerald-600 font-semibold" />
          {lossCount > 0 && (
            <Row left={`Loss expense (${lossCount} pcs damaged/missing)`} right={`${fmtBdt(lossValue)} absorbed in OK unit cost`} rightClass="text-orange-600" />
          )}
          {courierCost > 0 && selectedCourierWallet && (
            <Row left={`Local courier paid from ${selectedCourierWallet.name}`} right={`-${fmtBdt(courierCost)}`} rightClass="text-red-600" />
          )}
          {courierCost > 0 && selectedCourierWallet ? (
            <div className="pt-2 border-t border-border/60 mt-2">
              <div className="text-[10px] tracking-wider text-muted-foreground font-semibold mb-1">WALLET OUTFLOW SUMMARY</div>
              {selectedCourierWallet && courierCost > 0 && (
                <Row left={selectedCourierWallet.name} right={`-${fmtBdt(courierCost)} (bal ${fmtBdt(selectedCourierWallet.current_balance)} → ${fmtBdt(Number(selectedCourierWallet.current_balance) - courierCost)})`} rightClass="text-xs" />
              )}
            </div>
          ) : null}
        </div>
      </Card>

      <Button
        size="lg"
        disabled={mut.isPending || rowErrors.length > 0 || validationErrors.length > 0}
        onClick={() => mut.mutate()}
      >
        {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        <ClipboardCheck className="h-4 w-4 mr-1" />Approve &amp; post {totalOk} pcs to inventory
      </Button>
      {validationErrors.length > 0 && <div className="text-[11px] text-orange-600">{validationErrors.join(" · ")}</div>}
    </div>
  );
}

function Row({ left, right, rightClass }: { left: string; right: string; rightClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{left}</span>
      <span className={cn("tabular-nums", rightClass)}>{right}</span>
    </div>
  );
}

/* helper component to auto-update OK = expected - damaged - missing */
function RowsAutoCompute({ rows, setRows, carton }: { rows: any; setRows: any; carton: any }) {
  useEffect(() => {
    let changed = false;
    const next = { ...rows };
    (carton.items ?? []).forEach((it: any) => {
      const r = rows[it.id] ?? { ok: 0, damaged: 0, missing: 0 };
      const newOk = Math.max(0, Number(it.quantity_expected) - Number(r.damaged || 0) - Number(r.missing || 0));
      if (r.ok !== newOk) { next[it.id] = { ...r, ok: newOk }; changed = true; }
    });
    if (changed) setRows(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]: any) => [k, { d: v.damaged, m: v.missing }])))]);
  return null;
}

/* ============== Dialogs ============== */

function ArrivedDialog({ poId, onClose, brandId }: { poId: string; onClose: () => void; brandId: string }) {
  const fn = useServerFn(markArrivedInBd);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  const [weight, setWeight] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [payNow, setPayNow] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");

  const total = weight * rate;
  useMemo(() => { if (payNow && amount === 0) setAmount(total); /* eslint-disable-next-line */ }, [total, payNow]);

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = { po_id: poId, total_weight_kg: weight, rate_per_kg_bdt: rate, idempotency_key: newIdemKey("arr") };
      if (payNow && walletId && amount > 0) {
        payload.shipping_payment = { amount, wallet_id: walletId, payment_date: new Date().toISOString().slice(0, 10), reference: ref || undefined, idempotency_key: newIdemKey("pay") };
      }
      return await fn({ data: payload });
    },
    onSuccess: () => { toast.success("Marked as arrived in BD"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive at BD Warehouse</DialogTitle>
          <DialogDescription>Enter actual shipped weight and rate. Shipping is auto-distributed across cartons by weight.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Total weight (kg) *</Label><Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></div>
            <div><Label>Rate ৳/kg *</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
          </div>
          <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/40">
            <span className="text-muted-foreground">Shipping total:</span><span className="font-semibold tabular-nums">{fmtBdt(total)}</span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-[11px] tracking-wider font-semibold text-muted-foreground mb-2">PAY SHIPPING NOW (OPTIONAL)</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => { setAmount(Number(e.target.value)); setPayNow(true); }} /></div>
              <div>
                <Label>From Wallet</Label>
                <Select value={walletId} onValueChange={(v) => { setWalletId(v); setPayNow(true); }}>
                  <SelectTrigger><SelectValue placeholder="Wallet" /></SelectTrigger>
                  <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2"><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={weight <= 0 || rate <= 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save &amp; Distribute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ poId, brandId, grandTotal, dueAmount, onClose }: { poId: string; brandId: string; grandTotal: number; dueAmount: number; onClose: () => void }) {
  const fn = useServerFn(recordImportPayment);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);
  const [amount, setAmount] = useState<number>(0);
  const [walletId, setWalletId] = useState("");
  const [type, setType] = useState("supplier_payment");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");

  const mut = useMutation({
    mutationFn: () => fn({ data: { brand_id: brandId, po_id: poId, payment_type: type as any, amount_bdt: amount, wallet_id: walletId, payment_date: date, reference: ref || undefined, idempotency_key: newIdemKey("pay") } }),
    onSuccess: () => { toast.success("Payment recorded"); qc.invalidateQueries({ queryKey: ["imp-po", poId] }); onClose(); },
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
          <AmountPercentInput
            total={dueAmount > 0 ? dueAmount : grandTotal}
            amount={amount}
            onChange={setAmount}
            label={`Amount (BDT) — ${dueAmount > 0 ? `due ${fmtBdt(dueAmount)}` : `total ${fmtBdt(grandTotal)}`}`}
          />
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={amount <= 0 || !walletId || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== Cartons header with bulk selection + total bill ============== */

function CartonsHeader({
  cartons, selected, setSelected, onBulkStage, onBulkRelease, poPaid, poSupplierTotal,
}: {
  cartons: any[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onBulkStage: (s: ImpCartonStatus) => void;
  onBulkRelease: () => void;
  poPaid: number;
  poSupplierTotal: number;
}) {
  const SELECTABLE = ["ordered", "at_china_warehouse", "in_transit", "arrived_bd"];
  const eligible = cartons.filter((c) => SELECTABLE.includes(c.status));
  const selCartons = cartons.filter((c) => selected.has(c.id));
  const anyMovable = selCartons.some((c) => ["ordered", "at_china_warehouse", "in_transit"].includes(c.status));
  const arrived = selCartons.filter((c) => c.status === "arrived_bd");

  // Bill for selected arrived_bd cartons (prorated supplier advance)
  const supplierCost = arrived.reduce((s, c) => s + Number(c.supplier_cost_bdt || 0), 0);
  const shipping = arrived.reduce((s, c) => s + Number(c.shipping_charge_bdt || 0), 0);
  const advanceShare = poSupplierTotal > 0 ? (poPaid * supplierCost) / poSupplierTotal : 0;
  const supplierDue = Math.max(0, supplierCost - advanceShare);
  const totalBill = Math.round((supplierDue + shipping) * 100) / 100;

  const allSelected = eligible.length > 0 && eligible.every((c) => selected.has(c.id));
  const movableAll = cartons.filter((c) => ["ordered", "at_china_warehouse", "in_transit"].includes(c.status));

  return (
    <div className="border-b border-border">
      <div className="p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(v) => {
              if (v) setSelected(new Set(eligible.map((c) => c.id)));
              else setSelected(new Set());
            }}
            aria-label="Select all cartons"
          />
          <h3 className="font-semibold inline-flex items-center gap-2">
            Cartons <Badge variant="outline" className="text-[11px]">{cartons.length}</Badge>
          </h3>
          {selected.size > 0 && (
            <Badge variant="secondary" className="text-[11px]">{selected.size} selected</Badge>
          )}
        </div>
        {selected.size === 0 && eligible.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Select cartons to bulk update stage or release
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="px-4 pb-4 -mt-1 space-y-3">
          {arrived.length > 0 && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-orange-600" />
                <div className="text-[11px] font-semibold tracking-wider text-orange-800 dark:text-orange-200 uppercase">
                  Bulk Release Bill — {arrived.length} arrived carton{arrived.length > 1 ? "s" : ""}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <BillTile label="Supplier cost" value={fmtBdt(supplierCost)} />
                <BillTile label="Advance share" value={`− ${fmtBdt(advanceShare)}`} valueClass="text-emerald-700 dark:text-emerald-400" />
                <BillTile label="Shipping (CN→BD)" value={fmtBdt(shipping)} />
                <BillTile label="Total to pay" value={fmtBdt(totalBill)} valueClass="text-orange-700 dark:text-orange-300 text-base" />
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button size="sm" onClick={onBulkRelease} className="bg-orange-600 hover:bg-orange-700 text-white shadow-md">
                  <Send className="h-4 w-4 mr-1" />
                  Pay {fmtBdt(totalBill)} & Release {arrived.length}
                </Button>
              </div>
            </div>
          )}
          {anyMovable && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-muted-foreground">Bulk stage:</span>
              <Button size="sm" variant="outline" onClick={() => onBulkStage("ordered")}>Ordered</Button>
              <Button size="sm" variant="outline" onClick={() => onBulkStage("at_china_warehouse")}>At China WH</Button>
              <Button size="sm" variant="outline" onClick={() => onBulkStage("in_transit")}>In Transit</Button>
              {arrived.length === 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BillTile({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-md bg-background/60 border border-border/60 px-3 py-2">
      <div className="text-[10px] tracking-wider font-semibold text-muted-foreground uppercase">{label}</div>
      <div className={cn("font-bold tabular-nums text-sm mt-0.5", valueClass)}>{value}</div>
    </div>
  );
}

/* ============== Bulk Release Dialog — pay once, release many ============== */

function BulkReleaseDialog({
  poId, brandId, cartons, poPaid, poSupplierTotal, onClose, onDone,
}: {
  poId: string; brandId: string; cartons: any[];
  poPaid: number; poSupplierTotal: number;
  onClose: () => void; onDone: () => void;
}) {
  const fn = useServerFn(releaseCarton);
  const qc = useQueryClient();
  const { data: wallets = [] } = useAccounts([brandId]);

  const supplierCost = cartons.reduce((s, c) => s + Number(c.supplier_cost_bdt || 0), 0);
  const shipping = cartons.reduce((s, c) => s + Number(c.shipping_charge_bdt || 0), 0);
  const advanceShare = poSupplierTotal > 0 ? (poPaid * supplierCost) / poSupplierTotal : 0;
  const supplierDue = Math.max(0, supplierCost - advanceShare);
  const defaultTotal = Math.round((supplierDue + shipping) * 100) / 100;

  const [amount, setAmount] = useState<number>(defaultTotal);
  const [walletId, setWalletId] = useState("");
  const [ref, setRef] = useState("");
  const [withoutPay, setWithoutPay] = useState(false);

  // per-carton bill for proportional split
  const perCarton = cartons.map((c) => {
    const sc = Number(c.supplier_cost_bdt || 0);
    const sh = Number(c.shipping_charge_bdt || 0);
    const adv = poSupplierTotal > 0 ? (poPaid * sc) / poSupplierTotal : 0;
    const bill = Math.max(0, sc - adv) + sh;
    return { carton: c, bill };
  });
  const billSum = perCarton.reduce((s, r) => s + r.bill, 0);

  const mut = useMutation({
    mutationFn: async () => {
      if (!withoutPay) {
        if (amount <= 0) throw new Error("Pay amount required");
        if (!walletId) throw new Error("Pick a wallet");
      }
      // Split the payment amount proportionally by each carton's bill share.
      let assigned = 0;
      for (let i = 0; i < perCarton.length; i++) {
        const { carton, bill } = perCarton[i];
        const payload: any = { carton_id: carton.id, idempotency_key: newIdemKey("brel") };
        if (withoutPay) {
          payload.release_without_payment = true;
        } else {
          const isLast = i === perCarton.length - 1;
          const share = isLast
            ? Math.max(0, Math.round((amount - assigned) * 100) / 100)
            : Math.round(((billSum > 0 ? (bill / billSum) * amount : amount / perCarton.length)) * 100) / 100;
          assigned += share;
          if (share > 0) {
            payload.payment = {
              amount: share,
              wallet_id: walletId,
              payment_date: new Date().toISOString().slice(0, 10),
              reference: ref || undefined,
              idempotency_key: newIdemKey("pay"),
            };
          } else {
            payload.release_without_payment = true;
          }
        }
        await fn({ data: payload });
      }
    },
    onSuccess: () => {
      toast.success(`Released ${cartons.length} carton${cartons.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk release failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Release — {cartons.length} carton{cartons.length > 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>Pay once from a single wallet — payment auto-splits across selected cartons by their bill share.</DialogDescription>
        </DialogHeader>

        <Card className="p-3 bg-muted/30 border-0">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <BillTile label="Supplier cost" value={fmtBdt(supplierCost)} />
            <BillTile label="Advance share" value={`− ${fmtBdt(advanceShare)}`} valueClass="text-emerald-700 dark:text-emerald-400" />
            <BillTile label="Shipping (CN→BD)" value={fmtBdt(shipping)} />
            <BillTile label="Total to pay" value={fmtBdt(defaultTotal)} valueClass="text-orange-700 dark:text-orange-300 text-base" />
          </div>
        </Card>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pay amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} disabled={withoutPay} />
            </div>
            <div>
              <Label className="text-xs">Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId} disabled={withoutPay}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{wallets.filter((w) => w.is_active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({fmtBdt(w.current_balance)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Reference</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" disabled={withoutPay} />
          </div>
          <label className="inline-flex items-center gap-2 text-xs">
            <Checkbox checked={withoutPay} onCheckedChange={(v) => setWithoutPay(!!v)} />
            Release without payment (carry as PO due)
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Send className="h-4 w-4 mr-1" />Release {cartons.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
