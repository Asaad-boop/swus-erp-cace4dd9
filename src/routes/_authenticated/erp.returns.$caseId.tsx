import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, Package, Truck, Copy, ExternalLink, CheckCircle2, XCircle,
  AlertTriangle, ClipboardCheck, User, Loader2, Repeat, RotateCcw, ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ReturnStatusBadge } from "@/components/erp/returns/return-status-badge";
import {
  getCaseDetail, completeQC, updateReturnStatus, createExchangeOrder,
} from "@/lib/erp/returns/returns.functions";
import { CaseActionButton } from "@/components/erp/returns/case-action-button";

export const Route = createFileRoute("/_authenticated/erp/returns/$caseId")({
  head: () => ({ meta: [{ title: "Case Detail — Returns" }] }),
  component: CaseDetailPage,
});

function bdt(n: number) { return (n || 0).toLocaleString("en-IN"); }

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getDetail = useServerFn(getCaseDetail);
  const completeQcFn = useServerFn(completeQC);
  const updateStatusFn = useServerFn(updateReturnStatus);
  const createOrderFn = useServerFn(createExchangeOrder);

  const { data, isLoading, error } = useQuery({
    queryKey: ["case-detail", caseId],
    queryFn: () => getDetail({ data: { caseId } }),
  });

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error || !data) return <div className="p-6 text-sm text-rose-600">Case not found</div>;

  const c: any = data.case;
  const isExchange = data.type === "exchange";
  const status = isExchange ? c.exchange_status : c.return_status;
  const showQC = false; // handled by CaseActionButton dialog

  const closeCase = () => {
    if (!confirm("Close this case?")) return;
    updateStatusFn({ data: { caseId, status: "closed", note: "Case closed", isExchange } })
      .then(() => { toast.success("Case closed"); qc.invalidateQueries({ queryKey: ["case-detail", caseId] }); })
      .catch((e) => toast.error(e.message));
  };

  return (
    <div className="p-4 md:p-6 max-w-[1300px] mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/erp/returns" })}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back
        </Button>
        <div className="flex items-center gap-2">
          {isExchange
            ? <Badge variant="outline" className="bg-indigo-50 text-indigo-700"><Repeat className="h-3 w-3 mr-1" />Exchange</Badge>
            : <Badge variant="outline" className="bg-emerald-50 text-emerald-700"><RotateCcw className="h-3 w-3 mr-1" />Return</Badge>}
          <span className="font-mono text-sm font-semibold">{c.case_number ?? caseId.slice(0, 8)}</span>
          <ReturnStatusBadge status={status} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <CaseActionButton caseId={caseId} type={isExchange ? "exchange" : "return"} status={status} size="default" />
          {status !== "closed" && status !== "completed" && (
            <Button variant="outline" size="sm" onClick={closeCase}>Close Case</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT — Timeline + QC + Product */}
        <div className="lg:col-span-2 space-y-4">
          {/* Timeline */}
          <Section title="Timeline" icon={<ClipboardCheck className="h-4 w-4" />}>
            {data.timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No history yet</p>
            ) : (
              <ol className="relative pl-5 space-y-3 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-border">
                {data.timeline.map((e: any) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[14px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-card bg-sky-500" />
                    <div className="flex items-center gap-2 text-xs">
                      <ReturnStatusBadge status={e.status} />
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{e.created_by ? "Staff" : "System"}</span>
                      <span>·</span>
                      <span>{format(new Date(e.created_at), "dd MMM, hh:mm a")}</span>
                    </div>
                    {e.note && <p className="text-[11px] mt-1 rounded-md bg-muted/40 px-2 py-1">{e.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {/* QC Section */}
          {showQC && <QcPanel caseId={caseId} completeQcFn={completeQcFn} />}

          {/* Product Info */}
          <Section title="Product" icon={<Package className="h-4 w-4" />}>
            <div className="flex items-start gap-3">
              {c.product?.image
                ? <img src={c.product.image} alt="" className="h-16 w-16 rounded-md object-cover ring-1 ring-border" />
                : <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground" /></div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.product?.title ?? "—"}</div>
                {c.product?.sku && <div className="text-[11px] text-muted-foreground font-mono">{c.product.sku}</div>}
                <div className="mt-1 text-xs text-muted-foreground">
                  Qty: <span className="text-foreground font-medium">{c.qty ?? c.replacement_qty ?? 1}</span>
                </div>
              </div>
              {c.order && (
                <Link to="/erp/orders/$orderId" params={{ orderId: c.order.id }} className="text-xs text-sky-600 hover:underline inline-flex items-center gap-1">
                  Order #{String(c.order.id).slice(0, 8)} <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            {isExchange && c.replacement && (
              <div className="mt-4 pt-3 border-t">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Replacement</div>
                <div className="text-sm font-medium">{c.replacement.title}</div>
                {c.replacement.sku && <div className="text-[11px] text-muted-foreground font-mono">{c.replacement.sku}</div>}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT — Summary + Financial + Courier */}
        <div className="space-y-4">
          <Section title="Case Summary">
            <KV label="Type">{isExchange ? "Exchange" : c.return_type?.replace(/_/g, " ")}</KV>
            <KV label="Status"><ReturnStatusBadge status={status} /></KV>
            <KV label="Created">{format(new Date(c.created_at), "dd MMM yyyy, hh:mm a")}</KV>
            {c.qc_done_at && <KV label="QC Done">{format(new Date(c.qc_done_at), "dd MMM, hh:mm a")}</KV>}
            {c.qc_condition && <KV label="QC Condition"><Badge variant="outline" className="text-[10px] capitalize">{c.qc_condition}</Badge></KV>}
          </Section>

          <Section title="Financial Impact">
            {!isExchange && <KV label="Refund Amount">৳{bdt(Number(c.refund_amount ?? 0))}</KV>}
            {isExchange && <KV label="Exchange Charge">৳{bdt(Number(c.exchange_charge_collected ?? 0))}</KV>}
            <KV label="Return Delivery">৳{bdt(Number(c.return_delivery_cost ?? 0))}</KV>
            {!isExchange && <KV label="Outbound Delivery">৳{bdt(Number(c.outbound_delivery_cost ?? 0))}</KV>}
            <KV label="Product Cost Loss">৳{bdt(Number(c.product_cost_loss ?? 0))}</KV>
            <div className="pt-2 mt-2 border-t flex items-center justify-between text-sm">
              <span className="font-semibold">Total Impact</span>
              <span className="font-bold text-rose-600">
                ৳{bdt(Number(c.refund_amount ?? 0) + Number(c.return_delivery_cost ?? 0) + Number(c.outbound_delivery_cost ?? 0) + Number(c.product_cost_loss ?? 0))}
              </span>
            </div>
          </Section>

          {(c.courier_name || c.courier_tracking_id) && (
            <Section title="Courier" icon={<Truck className="h-4 w-4" />}>
              {c.courier_name && <KV label="Courier"><span className="capitalize">{c.courier_name}</span></KV>}
              {c.courier_tracking_id && (
                <KV label="Tracking">
                  <button onClick={() => { navigator.clipboard.writeText(c.courier_tracking_id); toast.success("Copied"); }}
                    className="inline-flex items-center gap-1 font-mono text-[11px] hover:text-foreground">
                    {c.courier_tracking_id}<Copy className="h-3 w-3" />
                  </button>
                </KV>
              )}
            </Section>
          )}

          {isExchange && (
            <Section title="Exchange Action">
              {c.new_order_id ? (
                <div className="text-xs space-y-1">
                  <p className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Exchange order created</p>
                  <Link to="/erp/orders/$orderId" params={{ orderId: c.new_order_id }}
                    className="inline-flex items-center gap-1 text-sky-600 hover:underline">
                    View Order #{String(c.new_order_id).slice(0, 8)} <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : c.exchange_type_detail !== "refund_only" && c.replacement_product_id ? (
                <Button size="sm" className="w-full" onClick={() => {
                  createOrderFn({ data: { caseId } })
                    .then((r: any) => { toast.success(`Order ${r.orderNumber} created`); qc.invalidateQueries({ queryKey: ["case-detail", caseId] }); })
                    .catch((e) => toast.error(e.message));
                }}>
                  <ShoppingCart className="h-4 w-4 mr-1" />Create Exchange Order
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Refund-only — no order to create</p>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <header className="px-4 py-2.5 border-b flex items-center gap-2">
        {icon}
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </header>
      <div className="p-4 space-y-2 text-xs">{children}</div>
    </section>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function QcPanel({ caseId, completeQcFn }: { caseId: string; completeQcFn: any }) {
  const qc = useQueryClient();
  const [condition, setCondition] = useState<"sellable" | "damaged" | "missing">("sellable");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () => completeQcFn({ data: { caseId, condition, notes: notes || undefined } }),
    onSuccess: (r: any) => {
      toast.success(r?.restocked ? "Restocked successfully" : "QC completed");
      qc.invalidateQueries({ queryKey: ["case-detail", caseId] });
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border bg-amber-50/30 dark:bg-amber-500/5 border-amber-300/40 overflow-hidden">
      <header className="px-4 py-2.5 border-b border-amber-300/40 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-amber-600" />
        <h3 className="text-[13px] font-semibold">Quality Check</h3>
      </header>
      <div className="p-4 space-y-3">
        <div>
          <div className="text-xs font-medium mb-1.5">Condition</div>
          <div className="grid grid-cols-3 gap-2">
            <ConditionBtn active={condition === "sellable"} onClick={() => setCondition("sellable")} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Sellable" />
            <ConditionBtn active={condition === "damaged"} onClick={() => setCondition("damaged")} icon={<XCircle className="h-4 w-4 text-rose-600" />} label="Damaged" />
            <ConditionBtn active={condition === "missing"} onClick={() => setCondition("missing")} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Missing" />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium mb-1.5">QC Notes</div>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="text-xs" />
        </div>
        {condition === "sellable" && (
          <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
            ✓ Stock will be auto-incremented on completion
          </p>
        )}
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="w-full">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete QC"}
        </Button>
      </div>
    </section>
  );
}

function ConditionBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={
      "flex items-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors " +
      (active ? "border-amber-500 bg-amber-100/60 text-amber-900" : "border-border bg-card hover:bg-muted/50")
    }>
      {icon}{label}
    </button>
  );
}