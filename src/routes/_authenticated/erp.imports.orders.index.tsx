import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search, Filter } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { listPurchaseOrders } from "@/lib/erp/imports/imports.functions";
import { PO_STATUS_LABEL, fmtBdt, type ImpPoStatus } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/orders/")({
  head: () => ({ meta: [{ title: "Purchase Orders — Imports" }] }),
  component: PoListPage,
});

function PoListPage() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const listFn = useServerFn(listPurchaseOrders);
  const { data = [], isLoading } = useQuery({
    queryKey: ["imp-pos", brandId, status],
    enabled: !!brandId,
    queryFn: () => listFn({ data: { brandId: brandId!, status } }),
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return data;
    const needle = q.toLowerCase();
    return (data as any[]).filter((p) =>
      p.po_number?.toLowerCase().includes(needle) ||
      p.supplier?.name?.toLowerCase().includes(needle) ||
      p.agent?.name?.toLowerCase().includes(needle),
    );
  }, [data, q]);

  if (!brandId) return <div className="p-6 text-sm text-muted-foreground">Select a brand.</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-xl font-bold">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} of {(data as any[]).length} POs</p>
        </div>
        <Link to="/erp/imports/orders/new"><Button><Plus className="h-4 w-4 mr-1" />New PO</Button></Link>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO number, supplier, agent…" className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><Filter className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(PO_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">No purchase orders.</TableCell></TableRow>
            ) : (
              filtered.map((p: any) => (
                <TableRow key={p.id} className="hover:bg-accent/40 cursor-pointer">
                  <TableCell>
                    <Link to="/erp/imports/orders/$orderId" params={{ orderId: p.id }} className="font-mono text-sm font-semibold text-primary hover:underline">
                      {p.po_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{p.order_date}</TableCell>
                  <TableCell className="text-sm">{p.supplier?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{p.agent?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={PO_STATUS_LABEL[p.status as ImpPoStatus]?.tone}>
                      {PO_STATUS_LABEL[p.status as ImpPoStatus]?.label ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(p.grand_total_bdt)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">{fmtBdt(p.paid_bdt)}</TableCell>
                  <TableCell className="text-right tabular-nums text-orange-600 font-medium">{fmtBdt(p.due_bdt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}