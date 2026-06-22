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

  const accent = isExchange ? "#7C3AED" : "#D97706";
  const accentInk = isExchange ? "#4C1D95" : "#78350F";
  const accentSoft = isExchange ? "#F5F3FF" : "#FFFBEB";
  const accentBorder = isExchange ? "#EDE9FE" : "#FEF3C7";

  return (
    <div className="bg-[#FAFAF9] dark:bg-background min-h-screen pb-24 md:pb-6 text-zinc-900 dark:text-foreground">
      {/* === Sticky breadcrumb / action bar === */}
      <div className="bg-white/85 dark:bg-card/70 backdrop-blur-md border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-[1300px] mx-auto px-4 md:px-6 h-12 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/erp/returns" })}
            className="h-7 px-2 text-zinc-600 hover:bg-zinc-100 text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />Tickets
          </Button>
          <span className="text-zinc-300">/</span>
          <span className="font-mono text-[11px] text-zinc-700 font-semibold">{c.case_number ?? caseId.slice(0, 8)}</span>
          <span
            className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] uppercase tracking-wider font-mono font-bold"
            style={{ background: accentSoft, color: accentInk, border: `1px solid ${accentBorder}` }}
          >
            {isExchange ? <Repeat className="h-2.5 w-2.5" /> : <RotateCcw className="h-2.5 w-2.5" />}
            {isExchange ? "Exchange" : "Return"}
          </span>
          <div className="ml-auto hidden md:flex items-center gap-2">
            {status !== "closed" && status !== "completed" && (
              <Button variant="outline" size="sm" onClick={closeCase}
                className="text-xs h-8 border-zinc-200 text-zinc-600 hover:bg-zinc-50">Close case</Button>
            )}
            <CaseActionButton caseId={caseId} type={isExchange ? "exchange" : "return"} status={status} size="default" />
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-[1300px] mx-auto space-y-4">
        {/* === Hero ticket card === */}
        <section className="rounded-xl overflow-hidden bg-white dark:bg-card border border-zinc-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex">
            <span className="w-1.5 shrink-0" style={{ background: accent }} />
            <div className="flex-1 p-5 md:p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <ReturnStatusBadge status={status} />
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-500 font-medium">
                    Created {format(new Date(c.created_at), "dd MMM yyyy, hh:mm a")}
                  </span>
                  <span className="text-zinc-300">·</span>
                  <span className="text-zinc-500">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                </div>
                <h1 className="mt-3 text-[22px] md:text-[26px] leading-tight tracking-tight font-semibold text-zinc-900">
                  {c.product?.title ?? "—"}
                </h1>
                <div className="mt-1.5 flex items-center gap-2 text-[12.5px] text-zinc-600">
                  <span className="inline-grid h-5 w-5 place-items-center rounded-full bg-zinc-100 text-[9px] font-bold text-zinc-600">
                    {(c.order?.shipping_name ?? "—").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-medium">{c.order?.shipping_name ?? "Unknown customer"}</span>
                  {c.order && (
                    <>
                      <span className="text-zinc-300">·</span>
                      <Link to="/erp/orders/$orderId" params={{ orderId: c.order.id }}
                        className="font-mono text-[11px] text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-0.5">
                        #{String(c.order.id).slice(0, 8)} <ExternalLink className="h-3 w-3" />
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div className="md:text-right md:border-l md:pl-6 md:border-zinc-100">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">
                  {isExchange ? "Exchange charge" : "Refund amount"}
                </div>
                <div className="mt-1 text-[36px] md:text-[42px] leading-none tracking-tight font-semibold tabular-nums" style={{ color: accentInk }}>
                  ৳{bdt(Number(isExchange ? c.exchange_charge_collected ?? 0 : c.refund_amount ?? 0))}
                </div>
              </div>
            </div>
          </div>

          {/* Status progress strip */}
          <StatusProgress status={status} isExchange={isExchange} accent={accent} />
        </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT — Timeline + QC + Product */}
        <div className="lg:col-span-2 space-y-4">
          {/* Timeline */}
          <Section title="Timeline" icon={<ClipboardCheck className="h-4 w-4" />}>
            {data.timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No history yet</p>
            ) : (
              <ol className="relative pl-5 space-y-3 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-zinc-200">
                {data.timeline.map((e: any) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[14px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: accent }} />
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
                <Link to="/erp/orders/$orderId" params={{ orderId: c.order.id }}
                  className="text-xs hover:underline inline-flex items-center gap-1" style={{ color: accentInk }}>
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
              <span className="font-bold text-[#E11D48]">
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
                  <p className="inline-flex items-center gap-1" style={{ color: accentInk }}><CheckCircle2 className="h-3.5 w-3.5" />Exchange order created</p>
                  <Link to="/erp/orders/$orderId" params={{ orderId: c.new_order_id }}
                    className="inline-flex items-center gap-1 hover:underline" style={{ color: accentInk }}>
                    View Order #{String(c.new_order_id).slice(0, 8)} <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : c.exchange_type_detail !== "refund_only" && c.replacement_product_id ? (
                <Button size="sm" className="w-full text-white" style={{ background: accent }} onClick={() => {
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

      {/* Mobile sticky action bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-zinc-200 p-3 flex items-center gap-2 shadow-[0_-4px_14px_-4px_rgba(0,0,0,0.08)]">
        <CaseActionButton caseId={caseId} type={isExchange ? "exchange" : "return"} status={status} size="default" />
        {status !== "closed" && status !== "completed" && (
          <Button variant="outline" size="sm" onClick={closeCase} className="ml-auto">Close</Button>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <header className="px-4 py-2.5 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/40">
        <span className="text-zinc-400">{icon}</span>
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{title}</h3>
      </header>
      <div className="p-4 space-y-2 text-xs">{children}</div>
    </section>
  );
}

/* === Status progress (visual pipeline) === */
function StatusProgress({ status, isExchange, accent }: { status: string; isExchange: boolean; accent: string }) {
  const steps = isExchange
    ? ["requested", "approved", "received", "completed"]
    : ["requested", "approved", "received", "restocked", "closed"];
  const idx = Math.max(0, steps.findIndex((s) => s === status));
  const labels: Record<string, string> = {
    requested: "Requested", approved: "Approved", received: "Received",
    restocked: "Restocked", closed: "Closed", completed: "Completed",
  };
  return (
    <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 md:px-6 py-3">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {steps.map((s, i) => {
          const done = i <= idx;
          const current = i === idx;
          return (
            <div key={s} className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-4 w-4 rounded-full grid place-items-center text-[8px] font-bold transition-colors",
                    done ? "text-white" : "text-zinc-400 bg-white ring-1 ring-zinc-200",
                  )}
                  style={done ? { background: accent } : undefined}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={cn(
                  "text-[10.5px] font-semibold uppercase tracking-wider",
                  current ? "text-zinc-900" : done ? "text-zinc-700" : "text-zinc-400",
                )}>{labels[s] ?? s}</span>
              </div>
              {i < steps.length - 1 && (
                <span className="w-6 h-px" style={{ background: done && i < idx ? accent : "#E4E4E7" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
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