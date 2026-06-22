import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import {
  Download, RotateCcw, Repeat, Search, ChevronRight, Plus,
  Inbox, ExternalLink, X, Package, ArrowRight, Filter, SlidersHorizontal,
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
  productImage?: string | null;
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
      productImage: r.product?.image ?? null,
      status: r.return_status, qc: r.qc_condition, amount: Number(r.refund_amount ?? 0),
      createdAt: r.created_at,
    }));
    const excs: Row[] = (excQ.data ?? []).map((r: any) => ({
      id: r.id, type: "exchange" as const, caseNumber: r.case_number ?? r.id.slice(0, 8),
      orderNumber: r.original_order_id ? String(r.original_order_id).slice(0, 8) : null,
      customer: r.order?.shipping_name ?? "—",
      productTitle: r.product?.title ?? "—", productSku: r.product?.sku,
      productImage: r.product?.image ?? null,
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
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-background">
      {/* Refined light header */}
      <header className="bg-white/70 dark:bg-card/40 backdrop-blur-sm border-b border-stone-200/70 dark:border-border sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-medium">ERP · Reverse Logistics</div>
            <div className="flex items-baseline gap-3 mt-0.5">
              <h1 className="text-[22px] md:text-[26px] font-semibold tracking-tight text-[#1C1917] dark:text-foreground truncate"
                style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}>
                Returns <span className="italic text-[#B8893F]">&amp;</span> Exchanges
              </h1>
              <span className="hidden md:inline text-[11px] text-stone-500 tabular-nums">
                {counts.all} cases
                {lastUpdated && <> · Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}</>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" onClick={() => setNewReturnOpen(true)}
              className="bg-[#0D4F4C] hover:bg-[#0A3F3D] text-white shadow-sm h-8 px-3">
              <Plus className="h-3.5 w-3.5 mr-1" />Return
            </Button>
            <Button size="sm" onClick={() => setNewExchangeOpen(true)}
              className="bg-[#B8893F] hover:bg-[#A0762E] text-white shadow-sm h-8 px-3">
              <Plus className="h-3.5 w-3.5 mr-1" />Exchange
            </Button>
            <Button variant="ghost" size="sm" onClick={exportCsv}
              className="text-stone-600 hover:bg-stone-100 h-8 w-8 p-0" aria-label="Export">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 space-y-5">
        {/* Status pipeline KPI strip — premium */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <PipelineCard label="All Cases" value={counts.all} active={tab === "all"}
            onClick={() => setTab("all")} accent="#1C1917" sub={`${counts.returns} returns · ${counts.exchanges} exchanges`} />
          <PipelineCard label="Pending QC" value={counts.pending_qc} active={tab === "pending_qc"}
            onClick={() => setTab("pending_qc")} accent="#D97706" pulse={counts.pending_qc > 0}
            sub="Action required" />
          <PipelineCard label="Restocked" value={counts.restocked} active={tab === "restocked"}
            onClick={() => setTab("restocked")} accent="#059669" sub="Back in stock" />
          <PipelineCard label="Closed" value={counts.closed} active={tab === "closed"}
            onClick={() => setTab("closed")} accent="#64748B" sub="Resolved" />
          <PipelineCard label="Refunds Total" value={`৳${totalRefunds.toLocaleString("en-IN")}`}
            onClick={() => {}} accent="#E11D48" sub="This view" mono />
        </section>

        {/* Type segment + filters row */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex items-center rounded-xl bg-white dark:bg-card p-1 border border-stone-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)] w-full md:w-auto">
            <SegBtn active={tab === "all"} onClick={() => setTab("all")} label="All" count={counts.all} />
            <SegBtn active={tab === "returns"} onClick={() => setTab("returns")} label="Returns" count={counts.returns}
              icon={<RotateCcw className="h-3 w-3" />} color="#0D4F4C" />
            <SegBtn active={tab === "exchanges"} onClick={() => setTab("exchanges")} label="Exchanges" count={counts.exchanges}
              icon={<Repeat className="h-3 w-3" />} color="#B8893F" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
              <Input className="pl-8 h-9 w-full md:w-[260px] text-xs bg-white dark:bg-card border-stone-200 rounded-lg"
                placeholder="Search case, order, customer, product…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Input type="date" className="h-9 w-[140px] text-xs rounded-lg" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <Input type="date" className="h-9 w-[140px] text-xs rounded-lg" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        </div>

        {/* Split: list + preview */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className={cn("space-y-2", selectedId ? "lg:col-span-3" : "lg:col-span-5")}>
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium">
                {rows.length} {rows.length === 1 ? "case" : "cases"}
              </span>
              <span className="text-[10px] text-stone-400 hidden md:flex items-center gap-1">
                <SlidersHorizontal className="h-3 w-3" /> Sorted newest first
              </span>
            </div>
            {(retQ.isLoading || excQ.isLoading) ? (
              <div className="py-20 text-center text-sm text-stone-500 bg-white rounded-2xl border border-stone-200">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-200">
                <EmptyState onNew={() => setNewReturnOpen(true)} />
              </div>
            ) : (
              <ul className="space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-1 -mr-1">
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

function PipelineCard({ label, value, sub, onClick, active, accent, pulse, mono }: {
  label: string; value: React.ReactNode; sub?: string; onClick: () => void;
  active?: boolean; accent: string; pulse?: boolean; mono?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-2xl bg-white dark:bg-card border px-4 py-3.5 transition-all overflow-hidden",
        "hover:-translate-y-[1px] hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,0.15)]",
        active ? "border-stone-900 dark:border-foreground shadow-[0_4px_14px_-6px_rgba(0,0,0,0.12)]" : "border-stone-200 dark:border-border",
      )}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium">{label}</div>
        {pulse && <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: accent }} />}
      </div>
      <div className={cn(
        "mt-1.5 text-[26px] leading-none tracking-tight tabular-nums font-semibold",
        mono ? "text-[#1C1917]" : "",
      )} style={{ color: active ? accent : undefined }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[10.5px] text-stone-500 truncate">{sub}</div>}
    </button>
  );
}

function SegBtn({ active, onClick, label, count, icon, color }: {
  active: boolean; onClick: () => void; label: string; count: number;
  icon?: React.ReactNode; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all whitespace-nowrap flex-1 md:flex-none justify-center",
        active
          ? "bg-[#1C1917] text-white shadow-sm"
          : "text-stone-600 hover:text-[#1C1917]",
      )}
    >
      {icon && <span style={{ color: active ? (color ?? "currentColor") : (color ?? "currentColor") }}>{icon}</span>}
      {label}
      <span className={cn(
        "tabular-nums text-[10px] px-1.5 py-0.5 rounded-md",
        active ? "bg-white/15 text-white" : "bg-stone-100 text-stone-600",
      )}>{count}</span>
    </button>
  );
}

function initials(name: string) {
  return (name || "—")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "").join("") || "—";
}

function CaseRow({ r, index, onOpen, selected }: { r: Row; index: number; onOpen: () => void; selected?: boolean }) {
  const isReturn = r.type === "return";
  const accent = isReturn ? "#0D4F4C" : "#B8893F";
  return (
    <li
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      className={cn(
        "group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:gap-4 pl-3 pr-2.5 py-3 cursor-pointer animate-fade-in rounded-xl",
        "bg-white dark:bg-card border border-stone-200/70 dark:border-border",
        "hover:border-stone-300 hover:shadow-[0_4px_14px_-8px_rgba(0,0,0,0.1)] transition-all",
        selected && "ring-2 ring-offset-1 ring-[#1C1917]/90 dark:ring-foreground",
      )}
    >
      <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: accent }} />

      {/* Product thumb */}
      <div className="relative shrink-0 ml-1">
        {r.productImage ? (
          <img src={r.productImage} alt=""
            className="h-12 w-12 rounded-lg object-cover ring-1 ring-stone-200 bg-stone-50" />
        ) : (
          <div className="h-12 w-12 rounded-lg flex items-center justify-center bg-stone-100 text-stone-400 ring-1 ring-stone-200">
            <Package className="h-5 w-5" />
          </div>
        )}
        <span className={cn(
          "absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-2 ring-white dark:ring-card flex items-center justify-center text-white",
        )} style={{ background: accent }}>
          {isReturn ? <RotateCcw className="h-2.5 w-2.5" /> : <Repeat className="h-2.5 w-2.5" />}
        </span>
      </div>

      {/* Main */}
      <div className="min-w-0 grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] items-center gap-2 md:gap-5">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate text-[#1C1917] dark:text-foreground leading-tight">
            {r.productTitle}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-muted-foreground truncate mt-1 flex items-center gap-1.5">
            <span className="font-mono text-stone-700">{r.caseNumber}</span>
            <span className="text-stone-300">·</span>
            <span className="truncate">{initials(r.customer) !== "—" ? r.customer : "Unknown"}</span>
            {r.orderNumber && <><span className="text-stone-300 hidden md:inline">·</span>
              <span className="font-mono hidden md:inline">#{r.orderNumber}</span></>}
          </div>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <ReturnStatusBadge status={r.status} />
          <span className="text-[11px] text-stone-400 hidden lg:inline truncate">
            {format(new Date(r.createdAt), "dd MMM")}
          </span>
        </div>

        <div className="text-right tabular-nums hidden md:block">
          {r.amount > 0 ? (
            <div className="text-[16px] leading-none font-semibold" style={{ color: accent }}>
              ৳{r.amount.toLocaleString("en-IN")}
            </div>
          ) : (
            <span className="text-stone-300 text-sm">—</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        <CaseActionButton caseId={r.id} type={r.type} status={r.status} compact />
        <Link to="/erp/returns/$caseId" params={{ caseId: r.id }}
          className="text-stone-300 hover:text-[#1C1917] p-1.5 rounded-md hover:bg-stone-100 transition-colors">
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
  const serif = { fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' };
  return (
    <aside className="sticky top-4 rounded-2xl overflow-hidden bg-white dark:bg-card border border-stone-200 dark:border-border shadow-[0_4px_12px_-4px_rgba(13,79,76,0.12),0_24px_48px_-16px_rgba(13,79,76,0.16)] animate-fade-in">
      {/* Editorial header */}
      <header className="relative bg-[#0D4F4C] text-[#FBF8F3] px-5 pt-5 pb-6">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#D4A574]">
            {isReturn ? "Return Case" : "Exchange Case"}
          </div>
          <button onClick={onClose} className="p-1 -m-1 text-[#FBF8F3]/60 hover:text-[#FBF8F3]" aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="font-mono text-[12px] mt-1.5 text-[#FBF8F3]/70">{row.caseNumber}</div>
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#FBF8F3]/50">
            {isReturn ? "Refund amount" : "Exchange charge"}
          </div>
          <div className="mt-1 text-[44px] leading-none tracking-tight" style={serif}>
            {row.amount > 0 ? (
              <>৳{row.amount.toLocaleString("en-IN")}</>
            ) : (
              <span className="text-[#FBF8F3]/40">—</span>
            )}
          </div>
        </div>
        <div className="mt-4"><ReturnStatusBadge status={row.status} /></div>
      </header>

      <div className="p-5 space-y-4 text-xs bg-[#FBF8F3]/40 dark:bg-transparent">
        <PreviewRow label="Customer" value={row.customer} />
        <PreviewRow label="Product" value={
          <div>
            <div className="text-[13px] font-medium text-[#1C1917] leading-snug">{row.productTitle}</div>
            {row.productSku && <div className="text-[10px] font-mono text-stone-500 mt-0.5">{row.productSku}</div>}
          </div>
        } />
        <PreviewRow label="Order" value={row.orderNumber ? <span className="font-mono">#{row.orderNumber}</span> : "—"} />
        <PreviewRow label="Created" value={format(new Date(row.createdAt), "dd MMM yyyy, hh:mm a")} />

        <div className="flex items-center gap-2 pt-3 border-t border-stone-200">
          <CaseActionButton caseId={caseId} type={row.type} status={row.status} />
          <Button onClick={onOpenFull} size="sm"
            className="ml-auto bg-[#0D4F4C] hover:bg-[#0A3F3D] text-white">
            Open case <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

function PreviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 pt-0.5">{label}</div>
      <div className="text-[12px] text-[#1C1917] dark:text-foreground min-w-0">{value}</div>
    </div>
  );
}