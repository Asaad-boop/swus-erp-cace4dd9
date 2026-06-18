import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, ClipboardCheck, Boxes, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listStocktakeSessions } from "@/lib/erp/stocktake/stocktake.functions";

export const Route = createFileRoute("/_authenticated/erp/stocktake/")({
  head: () => ({ meta: [{ title: "Stocktake — ERP" }] }),
  component: StocktakeListPage,
});

const fmtBdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n || 0);

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-700 border-amber-300",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  cancelled: "bg-rose-500/15 text-rose-700 border-rose-300",
};

function StocktakeListPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const [status, setStatus] = useState("all");

  const listFn = useServerFn(listStocktakeSessions);
  const { data = [], isLoading } = useQuery({
    queryKey: ["stocktake-sessions", brandId, status],
    enabled: !!brandId,
    queryFn: () => listFn({ data: { brandId: brandId!, status } }),
  });
  const rows = data as any[];

  const kpis = useMemo(() => {
    const open = rows.filter((r) => r.status === "open").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const totalVar = rows.reduce((s, r) => s + Number(r.total_variance_value || 0), 0);
    return { open, completed, totalVar, count: rows.length };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Link to="/erp/inventory"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Inventory</Button></Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" /> Stocktake
            </h1>
            <p className="text-sm text-muted-foreground">Cycle counts & physical inventory · {effectiveBrand?.name ?? "—"}</p>
          </div>
        </div>
        <Link to="/erp/stocktake/new"><Button><Plus className="h-4 w-4 mr-1" /> New Stocktake</Button></Link>
      </div>

      {picker}
      {!brandId ? null : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Boxes} label="Total Sessions" value={String(kpis.count)} tone="text-slate-700" />
            <Kpi icon={AlertTriangle} label="Open" value={String(kpis.open)} tone="text-amber-600" />
            <Kpi icon={CheckCircle2} label="Completed" value={String(kpis.completed)} tone="text-emerald-600" />
            <Kpi icon={Boxes} label="Net Variance Value" value={fmtBdt(kpis.totalVar)} tone={kpis.totalVar < 0 ? "text-rose-600" : "text-emerald-600"} />
          </div>

          <Card className="p-3 flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Variance Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No stocktake sessions yet.</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link to="/erp/stocktake/$sessionId" params={{ sessionId: r.id }} className="font-medium text-primary hover:underline">
                        {r.name}
                      </Link>
                      {r.warehouse?.name ? <div className="text-xs text-muted-foreground">{r.warehouse.name}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_products ?? 0}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", Number(r.total_variance_value) < 0 ? "text-rose-600" : "text-emerald-600")}>
                      {fmtBdt(Number(r.total_variance_value || 0))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("border", STATUS_TONE[r.status] ?? "")}>{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={cn("text-xl font-bold tabular-nums mt-1", tone)}>{value}</div>
    </Card>
  );
}
