import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, Filter, Package, Wallet, AlertTriangle, TrendingUp, X, ArrowUpDown, Boxes } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listPurchaseOrders } from "@/lib/erp/imports/imports.functions";
import { PO_STATUS_LABEL, fmtBdt, type ImpPoStatus } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/")({
  head: () => ({ meta: [{ title: "Purchase Orders — Imports" }] }),
  component: PoListPage,
});

type SortKey = "date" | "total" | "due" | "status";

function PoListPage() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [payState, setPayState] = useState<"all" | "paid" | "partial" | "unpaid">("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const listFn = useServerFn(listPurchaseOrders);
  const { data = [], isLoading } = useQuery({
    queryKey: ["imp-pos", brandId, status],
    enabled: !!brandId,
    queryFn: () => listFn({ data: { brandId: brandId!, status } }),
  });

  const rows = data as any[];

  // KPIs on the unfiltered list (so users always see the full picture)
  const kpis = useMemo(() => {
    const totalSpend = rows.reduce((s, p) => s + Number(p.grand_total_bdt || 0), 0);
    const totalPaid = rows.reduce((s, p) => s + Number(p.paid_bdt || 0), 0);
    const totalDue = rows.reduce((s, p) => s + Number(p.due_bdt || 0), 0);
    const active = rows.filter((p) => !["completed", "cancelled"].includes(p.status)).length;
    const overdue = rows.filter((p) => Number(p.due_bdt || 0) > 0 && p.status === "completed").length;
    return { totalSpend, totalPaid, totalDue, active, overdue, count: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((p) => {
      if (needle && !(
        p.po_number?.toLowerCase().includes(needle) ||
        p.supplier?.name?.toLowerCase().includes(needle) ||
        p.agent?.name?.toLowerCase().includes(needle)
      )) return false;
      const total = Number(p.grand_total_bdt || 0);
      const paid = Number(p.paid_bdt || 0);
      if (payState === "paid" && (total === 0 || paid < total)) return false;
      if (payState === "partial" && (paid === 0 || paid >= total)) return false;
      if (payState === "unpaid" && paid > 0) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "total": return dir * (Number(a.grand_total_bdt || 0) - Number(b.grand_total_bdt || 0));
        case "due":   return dir * (Number(a.due_bdt || 0) - Number(b.due_bdt || 0));
        case "status":return dir * String(a.status).localeCompare(String(b.status));
        default:      return dir * String(a.order_date || "").localeCompare(String(b.order_date || ""));
      }
    });
    return out;
  }, [rows, q, payState, sortBy, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(k); setSortDir("desc"); }
  };

  const clearFilters = () => { setQ(""); setStatus("all"); setPayState("all"); };
  const hasFilters = q.trim() || status !== "all" || payState !== "all";

  if (!brandId) return <div className="p-6 text-sm text-muted-foreground">Select a brand.</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5 text-primary" />Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} of {(data as any[]).length} POs</p>
        </div>
        <Link to="/erp/imports/orders/new"><Button><Plus className="h-4 w-4 mr-1" />New PO</Button></Link>
      </div>

      {/* KPI strip */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="Total Spend" value={fmtBdt(kpis.totalSpend)} icon={TrendingUp} tone="text-blue-600" />
          <KpiTile label="Paid" value={fmtBdt(kpis.totalPaid)} icon={Wallet} tone="text-emerald-600" />
          <KpiTile label="Outstanding" value={fmtBdt(kpis.totalDue)} icon={AlertTriangle} tone="text-orange-600" />
          <KpiTile label="Active POs" value={String(kpis.active)} icon={Boxes} tone="text-violet-600" />
          <KpiTile label="Total POs" value={String(kpis.count)} icon={Package} tone="text-slate-600" />
        </div>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO number, supplier, agent…" className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><Filter className="h-4 w-4 mr-1" /><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(PO_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={payState} onValueChange={(v) => setPayState(v as any)}>
            <SelectTrigger className="w-[160px]"><Wallet className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="paid">Fully paid</SelectItem>
              <SelectItem value="partial">Partially paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />Clear
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <SortableHead label="Date" k="date" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <TableHead>Supplier / Agent</TableHead>
              <SortableHead label="Status" k="status" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <SortableHead label="Total" k="total" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right" />
              <TableHead className="text-right min-w-[200px]">Payment</TableHead>
              <SortableHead label="Due" k="due" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-16">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground" /></div>
                  <div>
                    <div className="font-semibold text-sm">{hasFilters ? "No POs match your filters" : "No purchase orders yet"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{hasFilters ? "Try clearing filters" : "Create your first PO to get started"}</div>
                  </div>
                  {hasFilters ? (
                    <Button size="sm" variant="outline" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" />Clear filters</Button>
                  ) : (
                    <Link to="/erp/imports/orders/new"><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New PO</Button></Link>
                  )}
                </div>
              </TableCell></TableRow>
            ) : (
              filtered.map((p: any) => {
                const total = Number(p.grand_total_bdt || 0);
                const paid = Number(p.paid_bdt || 0);
                const due = Number(p.due_bdt || 0);
                const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                const supplier = p.supplier?.name ?? "—";
                const initials = supplier.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase() || "?";
                return (
                  <TableRow key={p.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Link to="/erp/imports/orders/$orderId" params={{ orderId: p.id }} className="font-mono text-sm font-semibold text-primary hover:underline">
                        {p.po_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{p.order_date}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{initials}</div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{supplier}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{p.agent?.name ?? "No agent"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={PO_STATUS_LABEL[p.status as ImpPoStatus]?.tone}>
                        {PO_STATUS_LABEL[p.status as ImpPoStatus]?.label ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{fmtBdt(total)}</TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn(
                            "h-full transition-all",
                            pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-muted-foreground/20",
                          )} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={cn("text-xs tabular-nums w-10 text-right font-medium", pct >= 100 ? "text-emerald-600" : "text-muted-foreground")}>{pct}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{fmtBdt(paid)} / {fmtBdt(total)}</div>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium whitespace-nowrap", due > 0 ? "text-orange-600" : "text-muted-foreground")}>
                      {fmtBdt(due)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={cn("h-3.5 w-3.5", tone)} />
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function SortableHead({ label, k, sortBy, sortDir, onClick, align }: {
  label: string; k: SortKey; sortBy: SortKey; sortDir: "asc" | "desc"; onClick: (k: SortKey) => void; align?: "right";
}) {
  const active = sortBy === k;
  return (
    <TableHead className={cn(align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          active ? "text-foreground font-semibold" : "text-muted-foreground",
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && "text-primary")} />
        {active && <span className="text-[10px] text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </TableHead>
  );
}