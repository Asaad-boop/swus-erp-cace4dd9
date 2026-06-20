import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { AlertCircle, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getOutstandingCod, waiveOrders,
} from "@/lib/erp/reconciliation-queue.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/outstanding")({
  head: () => ({ meta: [{ title: "Outstanding COD — Reconciliation" }] }),
  component: OutstandingPage,
});

const bdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n);

function OutstandingPage() {
  const { brandId, picker } = useBrandPicker({
    label: "Pick a brand",
    hint: "Outstanding COD (14+ din) brand-wise dekhar jonno brand select koro.",
  });
  const qc = useQueryClient();
  const fn = useServerFn(getOutstandingCod);
  const waiveFn = useServerFn(waiveOrders);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["outstanding-cod", brandId],
    queryFn: () => fn({ data: { brandId, thresholdDays: 14 } }),
    enabled: !!brandId,
  });

  const rows = useMemo(
    () => (q.data?.orders ?? []) as Array<Record<string, unknown>>,
    [q.data],
  );

  const waive = useMutation({
    mutationFn: () => waiveFn({ data: { orderIds: Array.from(selected) } }),
    onSuccess: (res) => {
      toast.success(`${res.count} ta order waive kora hoyeche`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["outstanding-cod"] });
      qc.invalidateQueries({ queryKey: ["pending-cod"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const copyConsignments = () => {
    const ids = rows
      .filter((o) => selected.has(String(o.id)))
      .map((o) => String(o.tracking_number ?? "").trim())
      .filter(Boolean);
    if (!ids.length) return toast.error("Selected orders e consignment ID nei");
    navigator.clipboard.writeText(ids.join("\n"));
    toast.success(`${ids.length} ta consignment ID copy hoyeche`);
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((o) => String(o.id))));
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}

      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertCircle className="h-6 w-6 text-red-600" />
          Outstanding COD (14+ days)
        </h1>
        <p className="text-sm text-muted-foreground">
          Pathao theke COD ekhono ase nai, delivered 14 dinerou beshi hoye geche.
        </p>
      </header>

      <Card className="border-red-500/40 bg-red-500/5">
        <CardContent className="p-5">
          <div className="text-xs font-medium text-muted-foreground">Total Outstanding</div>
          <div className="text-4xl font-bold tabular-nums text-red-700">
            {q.isLoading ? "…" : bdt(q.data?.totalAmount ?? 0)}
          </div>
          <div className="text-sm text-muted-foreground">{q.data?.totalCount ?? 0} orders</div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={copyConsignments}>
              <Copy className="h-4 w-4 mr-1" /> Copy Consignment IDs
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm(`${selected.size} ta order waive korte chao? (write-off)`))
                  waive.mutate();
              }}
              disabled={waive.isPending}
            >
              <X className="h-4 w-4 mr-1" /> Mark as Waived
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={rows.length > 0 && selected.size === rows.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead className="text-right">Days Overdue</TableHead>
                <TableHead className="text-right">COD Amount</TableHead>
                <TableHead>Consignment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8"><Check className="h-5 w-5 inline mr-1 text-emerald-600" /> Kono outstanding nei</TableCell></TableRow>
              )}
              {rows.map((o) => {
                const id = String(o.id);
                return (
                  <TableRow key={id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(id)}
                        onCheckedChange={(c) => {
                          const next = new Set(selected);
                          if (c) next.add(id); else next.delete(id);
                          setSelected(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/erp/orders/$orderId"
                        params={{ orderId: id }}
                        className="text-primary hover:underline"
                      >
                        {id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {o.delivered_at ? new Date(String(o.delivered_at)).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive" className="tabular-nums">{String(o.days_overdue ?? 0)}d</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {bdt(Number(o.total ?? 0))}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{String(o.tracking_number ?? "—")}</TableCell>
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