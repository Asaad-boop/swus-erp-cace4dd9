import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, Package, Truck, Copy, ExternalLink, CheckCircle2, XCircle,
  AlertTriangle, ClipboardCheck, User, Loader2, Repeat, RotateCcw, ShoppingCart,
  Printer, Receipt, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ReturnStatusBadge } from "@/components/erp/returns/return-status-badge";
import {
  getCaseDetail, completeQC, updateReturnStatus, createExchangeOrder,
} from "@/lib/erp/returns/returns.functions";
import { CaseActionButton } from "@/components/erp/returns/case-action-button";

export const Route = createFileRoute("/_authenticated/erp/returns/")({
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
  const showQC = !isExchange && (status === "received" || status === "qc_pending");
  const totalImpact = Number(c.refund_amount ?? 0) + Number(c.return_delivery_cost ?? 0)
    + Number(c.outbound_delivery_cost ?? 0) + Number(c.product_cost_loss ?? 0);

  const closeCase = () => {
    if (!confirm("Close this case?")) return;
    updateStatusFn({ data: { caseId, status: "closed", note: "Case closed", isExchange } })
      .then(() => { toast.success("Case closed"); qc.invalidateQueries({ queryKey: ["case-detail", caseId] }); })
      .catch((e) => toast.error(e.message));
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-background">
      <div className="p-4 md:p-8 max-w-[1300px] mx-auto space-y-5">
        {/* Header */}
        <div className="space-y-3">
          <button onClick={() => navigate({ to: "/erp/returns" })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />Returns
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
              isExchange ? "bg-violet-100 text-violet-600" : "bg-amber-100 text-amber-600",
            )}>
              {isExchange ? <Repeat className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono text-lg font-bold tracking-tight">{c.case_number ?? caseId.slice(0, 8)}</h1>
                <button onClick={() => { navigator.clipboard.writeText(c.case_number ?? caseId); toast.success("Copied"); }}
                  className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <ReturnStatusBadge status={status} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {c.product?.title ?? c.replacement?.title ?? "—"}
                {c.order && <> · Order #{String(c.order.id).slice(0, 8)}</>}
                {" · "}{format(new Date(c.created_at), "dd MMM yyyy")}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <CaseActionButton caseId={caseId} type={isExchange ? "exchange" : "return"} status={status} size="default" />
              {status !== "closed" && status !== "completed" && (
                <Button variant="outline" size="sm" onClick={closeCase}>Close Case</Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-4">
            <Timeline timeline={data.timeline} currentStatus={status} accent={isExchange ? "violet" : "amber"} />

            {showQC && <QcPanel caseId={caseId} completeQcFn={completeQcFn} qty={c.qty ?? 1} productTitle={c.product?.title ?? "Item"} />}

            <Section title="Product Details" icon={<Package className="h-4 w-4 text-muted-foreground" />}>
              <div className="flex items-start gap-3">
                {c.product?.image
                  ? <img src={c.product.image} alt="" className="h-16 w-16 rounded-md object-cover ring-1 ring-border" />
                  : <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.product?.title ?? "—"}</div>
                  {c.product?.sku && <div className="text-[11px] text-muted-foreground font-mono">{c.product.sku}</div>}
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="text-muted-foreground">Qty:</span>
                    <span className="text-foreground font-medium">{c.qty ?? c.replacement_qty ?? 1} unit</span>
                    {c.item?.unit_price != null && (<>
                      <span className="text-muted-foreground">Original price:</span>
                      <span className="text-foreground font-medium">৳{bdt(Number(c.item.unit_price))}</span>
                    </>)}
                    {c.product?.weighted_avg_cost != null && (<>
                      <span className="text-muted-foreground">WAC:</span>
                      <span className="text-foreground font-medium">৳{bdt(Number(c.product.weighted_avg_cost))}</span>
                    </>)}
                  </div>
                </div>
                {c.order && (
                  <Link to="/erp/orders/$orderId" params={{ orderId: c.order.id }} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 shrink-0">
                    Order <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-muted-foreground">Return Type:</span>
                <span className="font-medium capitalize">{(c.return_type ?? "—").toString().replace(/_/g, " ")}</span>
                {c.qc_condition && (<>
                  <span className="text-muted-foreground">Condition:</span>
                  <span className="font-medium capitalize">{c.qc_condition}</span>
                </>)}
              </div>
              {isExchange && c.replacement && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Replacement</div>
                  <div className="text-sm font-medium">{c.replacement.title}</div>
                  {c.replacement.sku && <div className="text-[11px] text-muted-foreground font-mono">{c.replacement.sku}</div>}
                </div>
              )}
            </Section>
          </div>

          {/* RIGHT */}
          <div className="space-y-4">
            <Section title="Case Summary">
              <KV label="Case #"><span className="font-mono text-[11px]">{c.case_number ?? caseId.slice(0, 8)}</span></KV>
              <KV label="Type">
                <span className="inline-flex items-center gap-1">
                  {isExchange ? <Repeat className="h-3 w-3 text-violet-600" /> : <RotateCcw className="h-3 w-3 text-amber-600" />}
                  {isExchange ? "Exchange" : "Return"}
                </span>
              </KV>
              <KV label="Status"><ReturnStatusBadge status={status} /></KV>
              <KV label="Created">{format(new Date(c.created_at), "dd MMM yyyy")}</KV>
              {c.qc_done_at && <KV label="QC Done">{format(new Date(c.qc_done_at), "dd MMM, hh:mm a")}</KV>}
              {c.order && (
                <KV label="Order">
                  <Link to="/erp/orders/$orderId" params={{ orderId: c.order.id }} className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-mono text-[11px]">
                    #{String(c.order.id).slice(0, 8)} <ExternalLink className="h-3 w-3" />
                  </Link>
                </KV>
              )}
            </Section>

            <Section title="Financial Impact" icon={<Receipt className="h-4 w-4 text-muted-foreground" />}>
              {!isExchange && <KV label="Refund Amount">৳{bdt(Number(c.refund_amount ?? 0))}</KV>}
              {isExchange && <KV label="Exchange Charge">৳{bdt(Number(c.exchange_charge_collected ?? 0))}</KV>}
              <KV label="Return Delivery">৳{bdt(Number(c.return_delivery_cost ?? 0))}</KV>
              {!isExchange && <KV label="Outbound Delivery">৳{bdt(Number(c.outbound_delivery_cost ?? 0))}</KV>}
              <KV label="Product Cost Loss">৳{bdt(Number(c.product_cost_loss ?? 0))}</KV>
              <div className="pt-2 mt-1 border-t flex items-center justify-between text-sm">
                <span className="font-semibold">Total Impact</span>
                <span className="font-bold text-rose-600">৳{bdt(totalImpact)}</span>
              </div>
            </Section>

            {(c.courier_name || c.courier_tracking_id) && (
              <Section title="Courier Tracking" icon={<Truck className="h-4 w-4 text-muted-foreground" />}>
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
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                      View Order #{String(c.new_order_id).slice(0, 8)} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                ) : c.exchange_type_detail !== "refund_only" && c.replacement_product_id ? (
                  <Button size="sm" className="w-full bg-violet-600 hover:bg-violet-700 text-white" onClick={() => {
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

            <Section title="Quick Actions" icon={<FileText className="h-4 w-4 text-muted-foreground" />}>
              <div className="space-y-1">
                {c.order && (
                  <Link to="/erp/orders/$orderId" params={{ orderId: c.order.id }}
                    className="flex items-center justify-between text-xs px-2 py-2 rounded-md hover:bg-muted/60 transition-colors">
                    <span className="inline-flex items-center gap-2"><ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />View Original Order</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                )}
                <button onClick={() => window.print()}
                  className="w-full flex items-center text-xs px-2 py-2 rounded-md hover:bg-muted/60 transition-colors">
                  <Printer className="h-3.5 w-3.5 text-muted-foreground mr-2" />Print Return Label
                </button>
                {status !== "closed" && status !== "completed" && (
                  <button onClick={closeCase}
                    className="w-full flex items-center text-xs px-2 py-2 rounded-md hover:bg-rose-50 text-rose-600 transition-colors">
                    <XCircle className="h-3.5 w-3.5 mr-2" />Close Case
                  </button>
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white dark:bg-card overflow-hidden shadow-sm">
      <header className="px-4 py-2.5 border-b flex items-center gap-2 bg-gray-50/60 dark:bg-muted/20">
        {icon}
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </header>
      <div className="p-4 space-y-2.5 text-xs">{children}</div>
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

function Timeline({ timeline, currentStatus, accent }: { timeline: any[]; currentStatus: string; accent: "amber" | "violet" }) {
  const accentDot = accent === "violet" ? "bg-violet-500" : "bg-amber-500";
  return (
    <Section title="Timeline" icon={<ClipboardCheck className="h-4 w-4 text-muted-foreground" />}>
      {timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No history yet</p>
      ) : (
        <ol className="relative pl-6 space-y-4 before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-border">
          {timeline.map((e: any, idx: number) => {
            const isCurrent = e.status === currentStatus && idx === timeline.length - 1;
            return (
              <li key={e.id} className="relative animate-fade-in" style={{ animationDelay: `${idx * 80}ms` }}>
                <span className={cn(
                  "absolute -left-[19px] top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white dark:ring-card",
                  isCurrent ? cn(accentDot, "animate-pulse") : "bg-emerald-500",
                )} />
                <div className="flex items-center gap-2">
                  <ReturnStatusBadge status={e.status} />
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{e.created_by ? "Staff" : "System"}</span>
                  <span>·</span>
                  <span>{format(new Date(e.created_at), "dd MMM, hh:mm a")}</span>
                </div>
                {e.note && <p className="text-[11px] mt-1.5 rounded-md bg-muted/40 px-2.5 py-1.5 leading-relaxed">{e.note}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function QcPanel({ caseId, completeQcFn, qty, productTitle }: { caseId: string; completeQcFn: any; qty: number; productTitle: string }) {
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
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-500/5 overflow-hidden shadow-sm animate-fade-in">
      <header className="px-4 py-3 border-b border-amber-200 flex items-center gap-2 bg-amber-100/50">
        <ClipboardCheck className="h-4 w-4 text-amber-600" />
        <h3 className="text-[13px] font-semibold text-amber-900">Quality Check Required</h3>
        <span className="ml-auto text-[10px] text-amber-700 inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />Awaiting decision
        </span>
      </header>
      <div className="p-4 space-y-3">
        <div className="text-xs text-amber-900/80">
          Product: <span className="font-semibold">{productTitle}</span> × {qty}
        </div>
        <div>
          <div className="text-xs font-medium mb-1.5">What is the condition of the item?</div>
          <div className="grid grid-cols-3 gap-2">
            <ConditionBtn active={condition === "sellable"} onClick={() => setCondition("sellable")}
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} label="Good — Restock" tone="emerald" />
            <ConditionBtn active={condition === "damaged"} onClick={() => setCondition("damaged")}
              icon={<XCircle className="h-5 w-5 text-rose-600" />} label="Damaged" tone="rose" />
            <ConditionBtn active={condition === "missing"} onClick={() => setCondition("missing")}
              icon={<AlertTriangle className="h-5 w-5 text-amber-600" />} label="Missing" tone="amber" />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium mb-1.5">Notes</div>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="text-xs bg-white" />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98] transition-transform">
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm QC"}
        </Button>
      </div>
    </section>
  );
}

function ConditionBtn({ active, onClick, icon, label, tone }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; tone: "emerald" | "rose" | "amber";
}) {
  const ring = tone === "emerald" ? "border-emerald-500 bg-emerald-50" : tone === "rose" ? "border-rose-500 bg-rose-50" : "border-amber-500 bg-amber-100";
  return (
    <button type="button" onClick={onClick} className={cn(
      "flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-3 text-[11px] font-semibold transition-all active:scale-[0.98] text-center",
      active ? ring : "border-border bg-white hover:bg-muted/30",
    )}>
      {icon}{label}
    </button>
  );
}

// Quiet unused-import lint while keeping the symbol available for future use
void Badge;
