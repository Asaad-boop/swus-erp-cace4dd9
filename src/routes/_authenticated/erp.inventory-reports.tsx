import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft, BarChart3, Boxes, AlertTriangle, History, RefreshCw, Download,
  TrendingUp, Wallet, Package, Check, X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { exportToXlsx } from "@/lib/erp/hr/excel";
import {
  getStockValuationReport,
  getStockMovementReport,
  getLowStockReport,
  getReorderSuggestions,
  updateReorderSuggestion,
} from "@/lib/erp/inventory/reports.functions";

export const Route = createFileRoute("/_authenticated/erp/inventory-reports")({
  head: () => ({ meta: [{ title: "Inventory Reports — ERP" }] }),
  component: InventoryReportsPage,
});

const fmtBdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);

function InventoryReportsPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link to="/erp/inventory"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Inventory</Button></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />Inventory Reports
            </h1>
            <p className="text-sm text-muted-foreground">{effectiveBrand?.name ?? "—"}</p>
          </div>
        </div>
        {picker}
      </div>

      {!brandId ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Select a brand to view reports.</Card>
      ) : (
        <Tabs defaultValue="valuation" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="valuation"><Wallet className="h-3.5 w-3.5 mr-1.5" />Valuation</TabsTrigger>
            <TabsTrigger value="movement"><History className="h-3.5 w-3.5 mr-1.5" />Movement</TabsTrigger>
            <TabsTrigger value="low-stock"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Low Stock</TabsTrigger>
            <TabsTrigger value="reorder"><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Reorder</TabsTrigger>
          </TabsList>

          <TabsContent value="valuation"><ValuationTab brandId={brandId} /></TabsContent>
          <TabsContent value="movement"><MovementTab brandId={brandId} /></TabsContent>
          <TabsContent value="low-stock"><LowStockTab brandId={brandId} /></TabsContent>
          <TabsContent value="reorder"><ReorderTab brandId={brandId} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ============================================================
   VALUATION
   ============================================================ */
function ValuationTab({ brandId }: { brandId: string }) {
  const fn = useServerFn(getStockValuationReport);
  const [includeZero, setIncludeZero] = useState(false);
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-valuation", brandId, includeZero],
    queryFn: () => fn({ data: { brandId, includeZero } }),
  });

  const rows = data as any[];
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => r.title?.toLowerCase().includes(n) || r.sku?.toLowerCase().includes(n));
  }, [rows, q]);

  const totals = useMemo(() => {
    const units = rows.reduce((s, r) => s + (r.stock || 0), 0);
    const value = rows.reduce((s, r) => s + Number(r.total_cost_value || 0), 0);
    const skus = rows.length;
    return { units, value, skus };
  }, [rows]);

  const handleExport = () => {
    const out = filtered.map((r) => ({
      Title: r.title,
      SKU: r.sku ?? "",
      Stock: r.stock,
      Reserved: r.reserved_stock,
      Available: r.available_stock,
      "WAC (BDT)": Number(r.weighted_avg_cost || 0).toFixed(2),
      "Total Value (BDT)": Number(r.total_cost_value || 0).toFixed(2),
      "Reorder Point": r.reorder_point,
    }));
    exportToXlsx(out, "Stock Valuation", `stock-valuation-${new Date().toISOString().slice(0, 10)}`);
    toast.success("Export downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiTile label="Total SKUs" value={String(totals.skus)} icon={Package} tone="text-slate-600" />
        <KpiTile label="Total Units" value={totals.units.toLocaleString()} icon={Boxes} tone="text-blue-600" />
        <KpiTile label="Inventory Value (WAC)" value={fmtBdt(totals.value)} icon={TrendingUp} tone="text-emerald-600" />
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or SKU…" className="flex-1 min-w-[220px]" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
          Include zero-stock
        </label>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" />Export
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">WAC</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">No data</TableCell></TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{r.title}</div>
                    {r.sku && <div className="text-[11px] font-mono text-muted-foreground">{r.sku}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.stock}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", r.reserved_stock > 0 && "text-amber-600")}>{r.reserved_stock}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-medium", r.available_stock <= 0 && "text-red-600")}>{r.available_stock}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(Number(r.weighted_avg_cost))}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmtBdt(Number(r.total_cost_value))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================================================
   MOVEMENT
   ============================================================ */
const SOURCE_OPTIONS = [
  { v: "all", l: "All sources" },
  { v: "manual", l: "Manual" },
  { v: "order", l: "Order" },
  { v: "return", l: "Return" },
  { v: "import", l: "Import (China)" },
  { v: "local_po", l: "Local PO" },
  { v: "opening", l: "Opening Stock" },
];

function MovementTab({ brandId }: { brandId: string }) {
  const fn = useServerFn(getStockMovementReport);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [source, setSource] = useState("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["report-movement", brandId, from, to, source],
    queryFn: () => fn({ data: { brandId, from, to, source } }),
  });

  const rows = data as any[];
  const totals = useMemo(() => {
    const inQty = rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
    const outQty = rows.filter((r) => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0);
    const value = rows.reduce((s, r) => s + Number(r.total_cost_bdt || 0), 0);
    return { inQty, outQty, value, count: rows.length };
  }, [rows]);

  const handleExport = () => {
    const out = rows.map((r) => ({
      Date: r.created_at?.slice(0, 19).replace("T", " "),
      Product: r.product?.title ?? "",
      SKU: r.variant?.sku ?? r.product?.sku ?? "",
      Source: r.movement_source,
      Reason: r.reason,
      Delta: r.delta,
      "Stock After": r.stock_after,
      "Unit Cost": r.unit_cost_bdt ?? "",
      "Total Cost": r.total_cost_bdt ?? "",
      Note: r.note ?? "",
    }));
    exportToXlsx(out, "Stock Movement", `stock-movement-${from}_to_${to}`);
    toast.success("Export downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Movements" value={String(totals.count)} icon={History} tone="text-slate-600" />
        <KpiTile label="Stock In" value={`+${totals.inQty.toLocaleString()}`} icon={TrendingUp} tone="text-emerald-600" />
        <KpiTile label="Stock Out" value={`-${totals.outQty.toLocaleString()}`} icon={TrendingUp} tone="text-red-600" />
        <KpiTile label="Cost Value" value={fmtBdt(totals.value)} icon={Wallet} tone="text-blue-600" />
      </div>

      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">From</div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">To</div>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Source</div>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0} className="ml-auto">
          <Download className="h-3.5 w-3.5 mr-1" />Export
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead className="text-right">After</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">No movements</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.created_at?.slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell>
                    <div className="text-sm">{r.product?.title ?? "—"}</div>
                    {(r.variant?.sku || r.product?.sku) && (
                      <div className="text-[10px] font-mono text-muted-foreground">{r.variant?.sku ?? r.product?.sku}</div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{r.movement_source ?? "manual"}</Badge></TableCell>
                  <TableCell className="text-xs">{r.reason}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-semibold", r.delta > 0 ? "text-emerald-600" : "text-red-600")}>
                    {r.delta > 0 ? "+" : ""}{r.delta}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.stock_after}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{r.total_cost_bdt ? fmtBdt(Number(r.total_cost_bdt)) : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ============================================================
   LOW STOCK
   ============================================================ */
function LowStockTab({ brandId }: { brandId: string }) {
  const fn = useServerFn(getLowStockReport);
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-low-stock", brandId],
    queryFn: () => fn({ data: { brandId } }),
  });
  const rows = data as any[];

  const handleExport = () => {
    const out = rows.map((r) => ({
      Title: r.title,
      SKU: r.sku ?? "",
      Stock: r.stock,
      Available: r.available_stock,
      "Reorder Point": r.reorder_point,
      "Suggested Qty": r.reorder_qty || Math.max(r.reorder_point * 2 - r.stock, 1),
      "WAC (BDT)": Number(r.weighted_avg_cost || 0).toFixed(2),
    }));
    exportToXlsx(out, "Low Stock", `low-stock-${new Date().toISOString().slice(0, 10)}`);
    toast.success("Export downloaded");
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          <span className="font-semibold">{rows.length}</span>
          <span className="text-muted-foreground"> products at or below reorder point</span>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1" />Export
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Reorder Point</TableHead>
              <TableHead className="text-right">Suggested Qty</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">All products above reorder point ✓</TableCell></TableRow>
            ) : (
              rows.map((r) => {
                const severity = r.stock <= 0 ? "out" : r.stock <= r.reorder_point / 2 ? "critical" : "low";
                const suggested = r.reorder_qty || Math.max(r.reorder_point * 2 - r.stock, 1);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{r.title}</div>
                      {r.sku && <div className="text-[11px] font-mono text-muted-foreground">{r.sku}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.stock}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.available_stock <= 0 && "text-red-600 font-semibold")}>{r.available_stock}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.reorder_point}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{suggested}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(
                        severity === "out" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                        severity === "critical" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                      )}>
                        {severity === "out" ? "Out of stock" : severity === "critical" ? "Critical" : "Low"}
                      </Badge>
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

/* ============================================================
   REORDER SUGGESTIONS QUEUE
   ============================================================ */
function ReorderTab({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getReorderSuggestions);
  const updateFn = useServerFn(updateReorderSuggestion);
  const [status, setStatus] = useState("pending");

  const { data = [], isLoading } = useQuery({
    queryKey: ["reorder-suggestions", brandId, status],
    queryFn: () => fn({ data: { brandId, status } }),
  });
  const rows = data as any[];

  const mut = useMutation({
    mutationFn: (args: { id: string; status: "processed" | "dismissed" }) =>
      updateFn({ data: args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder-suggestions"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <Card className="p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          Daily cron-generated reorder suggestions based on reorder points.
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processed">Processed</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Generated</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Current Stock</TableHead>
              <TableHead className="text-right">Reorder Point</TableHead>
              <TableHead className="text-right">Suggested Qty</TableHead>
              <TableHead className="text-right">Est. Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                No {status === "all" ? "" : status} suggestions
              </TableCell></TableRow>
            ) : (
              rows.map((r) => {
                const wac = Number(r.product?.weighted_avg_cost || 0);
                const estCost = wac * (r.suggested_qty || 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.created_at?.slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{r.product?.title ?? "—"}</div>
                      {(r.variant?.sku || r.product?.sku) && (
                        <div className="text-[11px] font-mono text-muted-foreground">{r.variant?.sku ?? r.product?.sku}</div>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", r.current_stock <= 0 && "text-red-600 font-semibold")}>{r.current_stock}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.reorder_point}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.suggested_qty}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{estCost > 0 ? fmtBdt(estCost) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn(
                        r.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
                        r.status === "processed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                      )}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Mark processed"
                            onClick={() => mut.mutate({ id: r.id, status: "processed" })} disabled={mut.isPending}>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Dismiss"
                            onClick={() => mut.mutate({ id: r.id, status: "dismissed" })} disabled={mut.isPending}>
                            <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
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

/* ============================================================
   shared
   ============================================================ */
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