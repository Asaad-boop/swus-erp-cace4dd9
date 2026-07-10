import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Clock, Truck, Phone, Package, AlertCircle } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BrandBadge } from "@/components/erp/brand-badge";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import { getPendingCodQueue } from "@/lib/erp/reconciliation-queue.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/pending")({
  head: () => ({ meta: [{ title: "Pending COD — Reconciliation" }] }),
  component: PendingPage,
});

function PendingPage() {
  const { brandIds, brands, isLoading: brandLoading } = useBrand();
  const [courier, setCourier] = useState<string>("");
  const fn = useServerFn(getPendingCodQueue);

  const queries = useQueries({
    queries: brandIds.map((bid) => ({
      queryKey: ["pending-cod", bid, courier],
      queryFn: () => fn({ data: { brandId: bid, courier: courier || null } }),
      enabled: !!bid,
    })),
  });
  const isLoading = queries.some((q) => q.isLoading);

  const rows = useMemo(() => {
    const all: Array<Record<string, unknown>> = [];
    for (const q of queries) if (q.data?.orders) all.push(...q.data.orders);
    all.sort((a, b) => Number(b.days_pending ?? 0) - Number(a.days_pending ?? 0));
    return all;
  }, [queries]);

  const totals = useMemo(() => {
    let count = 0, amount = 0, aged = 0;
    for (const o of rows) {
      count += 1;
      amount += Number(o.total ?? 0);
      if (Number(o.days_pending ?? 0) > 7) aged += 1;
    }
    return { count, amount, aged };
  }, [rows]);

  const showBrand = brandIds.length > 1;
  const colSpan = showBrand ? 8 : 7;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending COD Collection</h1>
          <p className="text-sm text-muted-foreground">
            Delivered orders jegula ekhono reconcile hoy nai. Oldest first.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Input
            placeholder="Filter by courier (e.g. pathao)"
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            className="h-9"
          />
        </div>
      </header>

      {brandIds.length === 0 && !brandLoading && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No active brands.</CardContent></Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Pending orders" value={String(totals.count)} icon={<Clock className="h-4 w-4" />} loading={isLoading} tone="warn" />
        <Kpi title="Pending amount" value={fmtBdt(totals.amount)} icon={<Package className="h-4 w-4" />} loading={isLoading} tone="warn" />
        <Kpi title="Aged (>7d)" value={String(totals.aged)} sub="orders" icon={<AlertCircle className="h-4 w-4" />} loading={isLoading} tone={totals.aged > 0 ? "bad" : undefined} />
        <Kpi title="Brands" value={String(brandIds.length)} sub={brandIds.length === brands.length ? "all" : "scoped"} icon={<Truck className="h-4 w-4" />} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                {showBrand && <TableHead>Brand</TableHead>}
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead className="text-right">COD</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Courier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">No pending orders 🎉</TableCell></TableRow>
              )}
              {rows.map((o) => {
                const days = Number(o.days_pending ?? 0);
                const aged = days > 7;
                return (
                  <TableRow key={String(o.id)} className={cn(aged && "bg-amber-500/5")}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/erp/orders/$orderId"
                        params={{ orderId: String(o.id) }}
                        className="text-primary hover:underline"
                      >
                        {String(o.id).slice(0, 8)}
                      </Link>
                    </TableCell>
                    {showBrand && (
                      <TableCell><BrandBadge brandId={String(o.brand_id ?? "")} variant="compact" /></TableCell>
                    )}
                    <TableCell>{String(o.shipping_name ?? "—")}</TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {String(o.shipping_phone ?? "—")}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.delivered_at ? new Date(String(o.delivered_at)).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtBdt(Number(o.total ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={aged ? "destructive" : "secondary"}
                        className="tabular-nums"
                      >
                        {days}d
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Truck className="h-3 w-3" /> {String(o.courier_name ?? "—")}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  title, value, sub, icon, loading, tone,
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode; loading?: boolean;
  tone?: "good" | "warn" | "bad";
}) {
  const toneCard = tone === "warn" ? "border-amber-500/40 bg-amber-500/5"
    : tone === "good" ? "border-emerald-500/30"
    : tone === "bad" ? "border-red-500/40 bg-red-500/5"
    : "";
  const toneText = tone === "warn" ? "text-amber-700 dark:text-amber-300"
    : tone === "good" ? "text-emerald-700 dark:text-emerald-300"
    : tone === "bad" ? "text-red-700 dark:text-red-300"
    : "";
  return (
    <Card className={toneCard}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{title}</div>
          <span className={cn("text-muted-foreground", toneText)}>{icon}</span>
        </div>
        <div className={cn("text-xl font-bold tabular-nums", toneText)}>{loading ? "…" : value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}