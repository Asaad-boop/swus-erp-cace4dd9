import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import {
  Download, RotateCcw, Repeat, Search, ChevronRight, Plus,
  Package, ClipboardCheck, Wallet, Inbox, ExternalLink, X,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    <div className="min-h-screen bg-[#FBF8F3] dark:bg-background">
      <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-[#0D4F4C] dark:text-foreground" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
              Returns &amp; Exchanges
            </h1>
            <p className="text-xs text-stone-500 dark:text-muted-foreground mt-1">
              {counts.all} total cases
              {lastUpdated && <> · Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setNewReturnOpen(true)} className="bg-[#0D4F4C] hover:bg-[#0A3F3D] text-white shadow-sm">
              <Plus className="h-4 w-4 mr-1" />New Return
            </Button>
            <Button size="sm" onClick={() => setNewExchangeOpen(true)} className="bg-[#D4A574] hover:bg-[#C49560] text-[#1C1917] shadow-sm">
              <Plus className="h-4 w-4 mr-1" />New Exchange
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} className="border-stone-300 dark:border-border">
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard accent="teal" icon={<Package className="h-4 w-4" />} label="Total Returns" value={counts.returns} />
          <KpiCard accent="sand" icon={<Repeat className="h-4 w-4" />} label="Exchanges" value={counts.exchanges} />
          <KpiCard accent="rose" pulse icon={<ClipboardCheck className="h-4 w-4" />} label="Pending QC" value={counts.pending_qc} />
          <KpiCard accent="ink" icon={<Wallet className="h-4 w-4" />} label="Refunds" value={`৳${totalRefunds.toLocaleString("en-IN")}`} />
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
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 dark:border-border bg-white dark:bg-card p-2 shadow-sm">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input className="pl-9 h-9 border-0 shadow-none focus-visible:ring-1"
              placeholder="Search order#, customer, product…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" className="h-9 w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="text-xs text-stone-400">–</span>
            <Input type="date" className="h-9 w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        </div>

        {/* Split: list + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className={cn(
            "rounded-xl border border-stone-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-sm",
            selectedId ? "lg:col-span-3" : "lg:col-span-5",
          )}>
            {(retQ.isLoading || excQ.isLoading) ? (
              <div className="py-16 text-center text-sm text-stone-500">Loading…</div>
            ) : rows.length === 0 ? (
              <EmptyState onNew={() => setNewReturnOpen(true)} />
            ) : (
              <ul className="divide-y divide-stone-100 dark:divide-border max-h-[calc(100vh-340px)] overflow-y-auto">
                {rows.map((r, i) => (
                  <CaseRow key={r.id} r={r} index={i} selected={selectedId === r.id}
                    onOpen={() => setSelectedId(r.id)} />
                ))}
              </ul>
            )}
          </div>

          {selectedId && (
            <div className="hidden lg:block lg:col-span-2">
              <PreviewPane
                caseId={selectedId}
                row={rows.find((r) => r.id === selectedId)}
                onClose={() => setSelectedId(null)}
                onOpenFull={() => navigate({ to: "/erp/returns/$caseId", params: { caseId: selectedId } })}
              />
            </div>
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
  teal: "border-l-[#0D4F4C] bg-[#0D4F4C]/5 text-[#0D4F4C]",
  sand: "border-l-[#D4A574] bg-[#D4A574]/10 text-[#8B6F3D]",
  rose: "border-l-[#E11D48] bg-[#E11D48]/5 text-[#E11D48]",
  ink: "border-l-[#1C1917] bg-[#1C1917]/5 text-[#1C1917]",
} as const;

function KpiCard({ icon, label, value, accent, pulse }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; accent: keyof typeof ACCENTS; pulse?: boolean;
}) {
  return (
    <div className={cn(
      "relative rounded-xl border border-stone-200 dark:border-border border-l-[3px] bg-white dark:bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
      ACCENTS[accent].split(" ")[0],
    )}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-stone-500 dark:text-muted-foreground font-medium">
        <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md", ACCENTS[accent])}>{icon}</span>
        {label}
        {pulse && Number(value) > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-[#E11D48] animate-pulse" />}
      </div>
      <div className="mt-2 text-[26px] font-bold tabular-nums tracking-tight text-[#1C1917] dark:text-foreground">{value}</div>
    </div>
  );
}

function PillTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      "inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
      active
        ? "bg-[#0D4F4C] text-white shadow-sm"
        : "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-muted dark:text-foreground",
    )}>{children}</button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 opacity-60 tabular-nums">{children}</span>;
}

function CaseRow({ r, index, onOpen, selected }: { r: Row; index: number; onOpen: () => void; selected?: boolean }) {
  const isReturn = r.type === "return";
  return (
    <li
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      className={cn(
        "group relative flex items-center gap-4 pl-4 pr-3 py-3 cursor-pointer animate-fade-in",
        "border-l-[3px] hover:bg-[#FBF8F3] dark:hover:bg-muted/40 transition-colors",
        isReturn ? "border-l-[#0D4F4C]" : "border-l-[#D4A574]",
        selected && "bg-[#0D4F4C]/5 dark:bg-muted/60",
      )}
    >
      <span className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
        isReturn ? "bg-[#0D4F4C]/10 text-[#0D4F4C]" : "bg-[#D4A574]/20 text-[#8B6F3D]",
      )}>
        {isReturn ? <RotateCcw className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1 grid grid-cols-12 items-center gap-3">
        <div className="col-span-12 md:col-span-3 min-w-0">
          <div className="font-mono text-[11px] font-semibold truncate">{r.caseNumber}</div>
          <div className="text-[11px] text-stone-500 dark:text-muted-foreground truncate">
            {r.orderNumber ? <>#{r.orderNumber}</> : "—"} · {r.customer}
          </div>
        </div>
        <div className="col-span-7 md:col-span-4 min-w-0">
          <div className="text-xs font-medium truncate">{r.productTitle}</div>
          {r.productSku && <div className="text-[10px] font-mono text-stone-500 dark:text-muted-foreground truncate">{r.productSku}</div>}
        </div>
        <div className="col-span-5 md:col-span-2"><ReturnStatusBadge status={r.status} /></div>
        <div className="hidden md:block md:col-span-1 text-right tabular-nums text-xs font-semibold">
          {r.amount > 0 ? `৳${r.amount.toLocaleString("en-IN")}` : <span className="text-stone-400 font-normal">—</span>}
        </div>
        <div className="hidden md:block md:col-span-2 text-[11px] text-stone-500 dark:text-muted-foreground text-right">
          {format(new Date(r.createdAt), "dd MMM, hh:mm a")}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <CaseActionButton caseId={r.id} type={r.type} status={r.status} compact />
        <Link to="/erp/returns/$caseId" params={{ caseId: r.id }}
          className="text-stone-400 hover:text-[#0D4F4C] p-1">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </li>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="py-16 px-6 text-center">
      <div className="mx-auto h-14 w-14 rounded-full bg-[#0D4F4C]/10 dark:bg-muted flex items-center justify-center text-[#0D4F4C]">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#1C1917] dark:text-foreground">No return cases yet</h3>
      <p className="mt-1 text-xs text-stone-500 dark:text-muted-foreground max-w-sm mx-auto">
        Returns and exchanges from orders will appear here. Create one to start tracking.
      </p>
      <Button size="sm" onClick={onNew} className="mt-4 bg-[#0D4F4C] hover:bg-[#0A3F3D] text-white">
        <Plus className="h-4 w-4 mr-1" />New Return
      </Button>
    </div>
  );
}

function PreviewPane({ caseId, row, onClose, onOpenFull }: {
  caseId: string; row?: Row; onClose: () => void; onOpenFull: () => void;
}) {
  if (!row) return null;
  const isReturn = row.type === "return";
  return (
    <aside className="sticky top-4 rounded-xl border border-stone-200 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden animate-fade-in">
      <header className={cn(
        "px-4 py-3 flex items-center gap-2 border-b border-stone-200 dark:border-border",
        isReturn ? "bg-[#0D4F4C]/5" : "bg-[#D4A574]/10",
      )}>
        <span className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg",
          isReturn ? "bg-[#0D4F4C] text-white" : "bg-[#D4A574] text-[#1C1917]",
        )}>
          {isReturn ? <RotateCcw className="h-3.5 w-3.5" /> : <Repeat className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-semibold truncate">{row.caseNumber}</div>
          <div className="text-[10px] text-stone-500 truncate">{isReturn ? "Return" : "Exchange"} · {row.customer}</div>
        </div>
        <button onClick={onClose} className="p-1 text-stone-400 hover:text-[#0D4F4C]" aria-label="Close preview">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="p-4 space-y-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Status</div>
          <ReturnStatusBadge status={row.status} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1">Product</div>
          <div className="text-sm font-medium leading-snug">{row.productTitle}</div>
          {row.productSku && <div className="text-[10px] font-mono text-stone-500 mt-0.5">{row.productSku}</div>}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-500">Amount</div>
            <div className="text-base font-bold tabular-nums text-[#0D4F4C]">
              {row.amount > 0 ? `৳${row.amount.toLocaleString("en-IN")}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-500">Order</div>
            <div className="text-sm font-mono">{row.orderNumber ? `#${row.orderNumber}` : "—"}</div>
          </div>
        </div>
        <div className="text-[11px] text-stone-500 pt-2 border-t border-stone-100">
          Created {format(new Date(row.createdAt), "dd MMM yyyy, hh:mm a")}
        </div>
        <div className="flex items-center gap-2 pt-3 border-t border-stone-100">
          <CaseActionButton caseId={caseId} type={row.type} status={row.status} />
          <Button onClick={onOpenFull} variant="outline" size="sm" className="ml-auto border-[#0D4F4C]/30 text-[#0D4F4C] hover:bg-[#0D4F4C]/5">
            Open <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </aside>
  );
}