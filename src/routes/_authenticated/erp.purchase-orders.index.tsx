import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, Filter, ClipboardList, Wallet, TrendingUp, X, Package } from "lucide-react";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listLocalPos } from "@/lib/erp/local-po/local-po.functions";
import { LOCAL_PO_STATUS, fmtBdt, type LocalPoStatus } from "@/lib/erp/local-po/types";

export const Route = createFileRoute("/_authenticated/erp/purchase-orders/")({
  head: () => ({ meta: [{ title: "Purchase Orders — ERP" }] }),
  component: LocalPoListPage,
});

function LocalPoListPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const listFn = useServerFn(listLocalPos);
  const { data = [], isLoading } = useQuery({
    queryKey: ["local-pos", brandId, status],
    enabled: !!brandId,
    queryFn: () => listFn({ data: { brandId: brandId!, status } }),
  });
  const rows = data as any[];

  const kpis = useMemo(() => {
    const totalSpend = rows.reduce((s, p) => s + Number(p.total || 0), 0);
    const totalPaid = rows.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
    const totalDue = rows.reduce((s, p) => s + Number(p.balance_due || 0), 0);
    const open = rows.filter((p) => ["draft", "sent", "partial"].includes(p.status)).length;
    return { totalSpend, totalPaid, totalDue, open, count: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((p) =>
      p.po_number?.toLowerCase().includes(needle) ||
      p.supplier?.name?.toLowerCase().includes(needle));
  }, [rows, q]);

  const hasFilters = q.trim() || status !== "all";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Local Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            {effectiveBrand?.name ?? "—"} · {filtered.length} of {rows.length} POs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {picker}
          <Link to="/erp/purchase-orders/new"><Button><Plus className="h-4 w-4 mr-1" />New PO</Button></Link>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="Total Spend" value={fmtBdt(kpis.totalSpend)} icon={TrendingUp} tone="text-blue-600" />
          <KpiTile label="Paid" value={fmtBdt(kpis.totalPaid)} icon={Wallet} tone="text-emerald-600" />
          <KpiTile label="Outstanding" value={fmtBdt(kpis.totalDue)} icon={Wallet} tone="text-orange-600" />
          <KpiTile label="Open POs" value={String(kpis.open)} icon={ClipboardList} tone="text-violet-600" />
          <KpiTile label="Total POs" value={String(kpis.count)} icon={Package} tone="text-slate-600" />
        </div>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO number, supplier…" className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><Filter className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(LOCAL_PO_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setStatus("all"); }}>
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
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead>Bill</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-16">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><ClipboardList className="h-6 w-6 text-muted-foreground" /></div>
                  <div>
                    <div className="font-semibold text-sm">{hasFilters ? "No POs match your filters" : "No purchase orders yet"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{hasFilters ? "Try clearing filters" : "Create your first local PO"}</div>
                  </div>
                  {!hasFilters && (
                    <Link to="/erp/purchase-orders/new"><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />New PO</Button></Link>
                  )}
                </div>
              </TableCell></TableRow>
            ) : (
              filtered.map((p) => {
                const total = Number(p.total || 0);
                const paid = Number(p.amount_paid || 0);
                const due = Number(p.balance_due || 0);
                return (
                  <TableRow key={p.id} className="hover:bg-accent/40">
                    <TableCell>
                      <Link to="/erp/purchase-orders/$poId" params={{ poId: p.id }} className="font-mono text-sm font-semibold text-primary hover:underline">
                        {p.po_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{p.order_date}</TableCell>
                    <TableCell className="text-sm">{p.supplier?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={LOCAL_PO_STATUS[p.status as LocalPoStatus]?.tone}>
                        {LOCAL_PO_STATUS[p.status as LocalPoStatus]?.label ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{fmtBdt(paid)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", due > 0 ? "text-orange-600" : "text-muted-foreground")}>{fmtBdt(due)}</TableCell>
                    <TableCell>
                      {p.bill_id ? (
                        <Badge variant="outline" className="text-[10px]">Billed</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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