import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Clock, Truck, Phone } from "lucide-react";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getPendingCodQueue } from "@/lib/erp/reconciliation-queue.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/pending")({
  head: () => ({ meta: [{ title: "Pending COD — Reconciliation" }] }),
  component: PendingPage,
});

const bdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n);

function PendingPage() {
  const { brandId, picker } = useBrandPicker({
    label: "Pick a brand",
    hint: "Pending COD collection brand-wise dekhar jonno brand select koro.",
  });
  const [courier, setCourier] = useState<string>("");
  const fn = useServerFn(getPendingCodQueue);
  const q = useQuery({
    queryKey: ["pending-cod", brandId, courier],
    queryFn: () => fn({ data: { brandId, courier: courier || null } }),
    enabled: !!brandId,
  });

  const rows = useMemo(
    () => (q.data?.orders ?? []) as Array<Record<string, unknown>>,
    [q.data],
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}

      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Clock className="h-6 w-6 text-amber-600" />
          Pending COD Collection
        </h1>
        <p className="text-sm text-muted-foreground">
          Delivered orders jegula reconcile hoy nai. Oldest first.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Total Pending</div>
            <div className="text-3xl font-bold tabular-nums text-amber-700">
              {q.isLoading ? "…" : q.data?.totalCount ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">orders</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Total Amount</div>
            <div className="text-3xl font-bold tabular-nums text-amber-700">
              {q.isLoading ? "…" : bdt(q.data?.totalAmount ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Filter by courier</div>
            <Input
              placeholder="e.g. pathao / steadfast"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              className="h-9"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead className="text-right">COD</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Courier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No pending orders 🎉</TableCell></TableRow>
              )}
              {rows.map((o) => {
                const days = Number(o.days_pending ?? 0);
                const red = days > 7;
                return (
                  <TableRow key={String(o.id)} className={cn(red && "bg-red-500/5")}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/erp/orders/$orderId"
                        params={{ orderId: String(o.id) }}
                        className="text-primary hover:underline"
                      >
                        {String(o.id).slice(0, 8)}
                      </Link>
                    </TableCell>
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
                      {bdt(Number(o.total ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={red ? "destructive" : "secondary"} className="tabular-nums">
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