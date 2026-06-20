import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import {
  Download, RotateCcw, Repeat, Search, ChevronRight, Plus,
  Package, ClipboardCheck, Wallet, Inbox,
} from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReturnStatusBadge } from "@/components/erp/returns/return-status-badge";
import { listReturnCases, listExchangeCases } from "@/lib/erp/returns/returns.functions";
import { NewReturnDialog } from "@/components/erp/returns/new-return-dialog";
import { NewExchangeDialog } from "@/components/erp/returns/new-exchange-dialog";
import { CaseActionButton } from "@/components/erp/returns/case-action-button";

export const Route = createFileRoute("/_authenticated/erp/returns/")({
  head: () => ({ meta: [{ title: "Returns & Exchanges — ERP" }] }),
  component: ReturnsListPage,
});

type Tab = "all" | "returns" | "exchanges" | "pending_qc" | "restocked" | "closed";

type Row = {
  id: string;
  type: "return" | "exchange";
  caseNumber: string;
  orderNumber?: string | number | null;
  customer: string;
  productTitle: string;
  productSku?: string | null;
  status: string;
  qc: string | null;
  amount: number;
  createdAt: string;
};

function ReturnsListPage() {
  const { brandIds } = useBrand();
  const navigate = useNavigate();
  const listRet = useServerFn(listReturnCases);
  const listExc = useServerFn(listExchangeCases);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newReturnOpen, setNewReturnOpen] = useState(false);
  const [newExchangeOpen, setNewExchangeOpen] = useState(false);

  const retQ = useQuery({
    queryKey: ["returns-list", brandIds, from, to],
    enabled: brandIds.length > 0,
    queryFn: () => listRet({ data: { brandIds, from: from || undefined, to: to || undefined } }),
  });
  const excQ = useQuery({
    queryKey: ["exchanges-list", brandIds, from, to],
    enabled: brandIds.length > 0,
    queryFn: () => listExc({ data: { brandIds, from: from || undefined, to: to || undefined } }),
  });

  const rows = useMemo(() => {
    const rets: Row[] = (retQ.data ?? []).map((r: any) => ({
      id: r.id, type: "return" as const, caseNumber: r.case_number ?? r.id.slice(0, 8),
      orderNumber: r.order_id ? String(r.order_id).slice(0, 8) : null,
      customer: r.order?.shipping_name ?? "—",
      productTitle: r.product?.title ?? "—", productSku: r.product?.sku,
      status: r.return_status, qc: r.qc_condition, amount: Number(r.refund_amount ?? 0),
      createdAt: r.created_at,
    }));
    const excs: Row[] = (excQ.data ?? []).map((r: any) => ({
      id: r.id, type: "exchange" as const, caseNumber: r.case_number ?? r.id.slice(0, 8),
      orderNumber: r.original_order_id ? String(r.original_order_id).slice(0, 8) : null,
      customer: r.order?.shipping_name ?? "—",
      productTitle: r.product?.title ?? "—", productSku: r.product?.sku,
      status: r.exchange_status, qc: null,
      amount: Number(r.exchange_charge_collected ?? r.refund_amount ?? 0),
      createdAt: r.created_at,
    }));
    let all: Row[] = [...rets, ...excs];
    if (tab === "returns") all = rets;
    else if (tab === "exchanges") all = excs;
    else if (tab === "pending_qc") all = rets.filter((r) => r.status === "received");
    else if (tab === "restocked") all = rets.filter((r) => r.status === "restocked");
    else if (tab === "closed") all = all.filter((r) => r.status === "closed" || r.status === "completed");
    if (q.trim()) {
      const needle = q.toLowerCase();
      all = all.filter((r) =>
        r.caseNumber?.toString().toLowerCase().includes(needle) ||
        r.orderNumber?.toString().toLowerCase().includes(needle) ||
        r.customer?.toLowerCase().includes(needle) ||
        r.productTitle?.toLowerCase().includes(needle),
      );
    }
    return all.sort((a: Row, b: Row) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [retQ.data, excQ.data, tab, q]);

  const counts = {
    all: (retQ.data?.length ?? 0) + (excQ.data?.length ?? 0),
    returns: retQ.data?.length ?? 0,
    exchanges: excQ.data?.length ?? 0,
    pending_qc: (retQ.data ?? []).filter((r: any) => r.return_status === "received").length,
    restocked: (retQ.data ?? []).filter((r: any) => r.return_status === "restocked").length,
    closed: (retQ.data ?? []).filter((r: any) => r.return_status === "closed").length
      + (excQ.data ?? []).filter((r: any) => r.exchange_status === "completed").length,
  };

  const totalRefunds = (retQ.data ?? []).reduce((s: number, r: any) => s + Number(r.refund_amount ?? 0), 0);
  const lastUpdated = (retQ.dataUpdatedAt && excQ.dataUpdatedAt)
    ? new Date(Math.max(retQ.dataUpdatedAt, excQ.dataUpdatedAt))
    : null;

  const exportCsv = () => {
    const header = ["Case#", "Type", "Order#", "Customer", "Product", "Status", "Amount", "Date"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.caseNumber, r.type, r.orderNumber ?? "", `"${(r.customer ?? "").replace(/"/g, '""')}"`,
        `"${(r.productTitle ?? "").replace(/"/g, '""')}"`, r.status, r.amount,
        format(new Date(r.createdAt), "yyyy-MM-dd HH:mm"),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `returns-${format(new Date(), "yyyyMMdd-HHmm")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-background">
      <div className="p-4 md:p-8 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Returns &amp; Exchanges</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {counts.all} total cases
              {lastUpdated && <> · Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setNewReturnOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="h-4 w-4 mr-1" />New Return
            </Button>
            <Button size="sm" onClick={() => setNewExchangeOpen(true)} className="bg-violet-600 hover:bg-violet-700 text-white">
              <Plus className="h-4 w-4 mr-1" />New Exchange
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard accent="amber" icon={<Package className="h-4 w-4" />} label="Total Returns" value={counts.returns} />
          <KpiCard accent="violet" icon={<Repeat className="h-4 w-4" />} label="Exchanges" value={counts.exchanges} />
          <KpiCard accent="amber" pulse icon={<ClipboardCheck className="h-4 w-4" />} label="Pending QC" value={counts.pending_qc} />
          <KpiCard accent="emerald" icon={<Wallet className="h-4 w-4" />} label="Refunds" value={`৳${totalRefunds.toLocaleString("en-IN")}`} />
        </div>

        {/* Pill tabs */}
        <div className="flex flex-wrap gap-2">
          <PillTab active={tab === "all"} onClick={() => setTab("all")}>All <Count>{counts.all}</Count></PillTab>
          <PillTab active={tab === "returns"} onClick={() => setTab("returns")}>
            <RotateCcw className="h-3 w-3 mr-1" />Returns <Count>{counts.returns}</Count>
          </PillTab>
          <PillTab active={tab === "exchanges"} onClick={() => setTab("exchanges")}>
            <Repeat className="h-3 w-3 mr-1" />Exchanges <Count>{counts.exchanges}</Count>
          </PillTab>
          <PillTab active={tab === "pending_qc"} onClick={() => setTab("pending_qc")}>
            Pending QC <Count>{counts.pending_qc}</Count>
            {counts.pending_qc > 0 && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />}
          </PillTab>
          <PillTab active={tab === "restocked"} onClick={() => setTab("restocked")}>Restocked <Count>{counts.restocked}</Count></PillTab>
          <PillTab active={tab === "closed"} onClick={() => setTab("closed")}>Closed <Count>{counts.closed}</Count></PillTab>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white dark:bg-card p-2 shadow-sm">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-9 border-0 shadow-none focus-visible:ring-1"
              placeholder="Search order#, customer, product…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" className="h-9 w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" className="h-9 w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        </div>

        {/* Cases list */}
        <div className="rounded-xl border bg-white dark:bg-card overflow-hidden shadow-sm">
          {(retQ.isLoading || excQ.isLoading) ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyState onNew={() => setNewReturnOpen(true)} />
          ) : (
            <ul className="divide-y">
              {rows.map((r, i) => (
                <CaseRow key={r.id} r={r} index={i}
                  onOpen={() => navigate({ to: "/erp/returns/$caseId", params: { caseId: r.id } })} />
              ))}
            </ul>
          )}
        </div>

        <NewReturnDialog open={newReturnOpen} onOpenChange={setNewReturnOpen} />
        <NewExchangeDialog open={newExchangeOpen} onOpenChange={setNewExchangeOpen} />
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

const ACCENTS = {
  amber: "border-l-amber-500 bg-amber-50/40 text-amber-700",
  violet: "border-l-violet-500 bg-violet-50/40 text-violet-700",
  emerald: "border-l-emerald-500 bg-emerald-50/40 text-emerald-700",
  indigo: "border-l-indigo-500 bg-indigo-50/40 text-indigo-700",
} as const;

function KpiCard({ icon, label, value, accent, pulse }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; accent: keyof typeof ACCENTS; pulse?: boolean;
}) {
  return (
    <div className={cn(
      "relative rounded-xl border border-l-4 bg-white dark:bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
      ACCENTS[accent].split(" ")[0],
    )}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md", ACCENTS[accent])}>{icon}</span>
        {label}
        {pulse && Number(value) > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function PillTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
      active
        ? "bg-indigo-600 text-white shadow-sm"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-muted dark:text-foreground",
    )}>{children}</button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 opacity-70 tabular-nums">{children}</span>;
}

function CaseRow({ r, index, onOpen }: { r: Row; index: number; onOpen: () => void }) {
  const isReturn = r.type === "return";
  return (
    <li
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      className={cn(
        "group relative flex items-center gap-4 pl-4 pr-3 py-3 cursor-pointer animate-fade-in",
        "border-l-[3px] hover:bg-gray-50/80 dark:hover:bg-muted/40 transition-colors",
        isReturn ? "border-l-amber-500" : "border-l-violet-500",
      )}
    >
      <span className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
        isReturn ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600",
      )}>
        {isReturn ? <RotateCcw className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1 grid grid-cols-12 items-center gap-3">
        <div className="col-span-12 md:col-span-3 min-w-0">
          <div className="font-mono text-[11px] font-semibold truncate">{r.caseNumber}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {r.orderNumber ? <>#{r.orderNumber}</> : "—"} · {r.customer}
          </div>
        </div>
        <div className="col-span-7 md:col-span-4 min-w-0">
          <div className="text-xs font-medium truncate">{r.productTitle}</div>
          {r.productSku && <div className="text-[10px] font-mono text-muted-foreground truncate">{r.productSku}</div>}
        </div>
        <div className="col-span-5 md:col-span-2"><ReturnStatusBadge status={r.status} /></div>
        <div className="hidden md:block md:col-span-1 text-right tabular-nums text-xs font-semibold">
          {r.amount > 0 ? `৳${r.amount.toLocaleString("en-IN")}` : <span className="text-muted-foreground font-normal">—</span>}
        </div>
        <div className="hidden md:block md:col-span-2 text-[11px] text-muted-foreground text-right">
          {format(new Date(r.createdAt), "dd MMM, hh:mm a")}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <CaseActionButton caseId={r.id} type={r.type} status={r.status} compact />
        <Link to="/erp/returns/$caseId" params={{ caseId: r.id }}
          className="text-muted-foreground hover:text-foreground p-1">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </li>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="py-16 px-6 text-center">
      <div className="mx-auto h-14 w-14 rounded-full bg-gray-100 dark:bg-muted flex items-center justify-center text-muted-foreground">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">No return cases yet</h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
        Returns and exchanges from orders will appear here. Create one to start tracking.
      </p>
      <Button size="sm" onClick={onNew} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white">
        <Plus className="h-4 w-4 mr-1" />New Return
      </Button>
    </div>
  );
}