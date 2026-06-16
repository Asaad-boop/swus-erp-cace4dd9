import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAgentPurchaseOrders } from "@/lib/erp/imports/agent.functions";
import { PO_STATUS_LABEL, fmtBdt, type ImpPoStatus } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_agent/agent/orders/")({
  head: () => ({ meta: [{ title: "Purchase Orders — Cargo Agent" }] }),
  component: AgentOrdersList,
});

function AgentOrdersList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const fn = useServerFn(listAgentPurchaseOrders);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["agent-pos", q, status],
    queryFn: () => fn({ data: { q: q || undefined, status } }),
  });

  const statuses: { value: string; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending_review", label: "Pending Review" },
    { value: "ordered", label: "Ordered" },
    { value: "at_china_warehouse", label: "At China WH" },
    { value: "in_transit", label: "In Transit" },
    { value: "arrived_bd", label: "Arrived BD" },
    { value: "partially_received", label: "Partial" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Purchase Orders</h1>
      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO number…" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                status === s.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Kono PO nei.</TableCell></TableRow>
            ) : (
              (rows as any[]).map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-accent/50">
                  <TableCell className="font-mono text-xs">
                    <Link to="/agent/orders/$orderId" params={{ orderId: p.id }} className="hover:underline">
                      {p.po_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{p.order_date}</TableCell>
                  <TableCell className="text-sm">{p.supplier?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={PO_STATUS_LABEL[p.status as ImpPoStatus]?.tone}>
                      {PO_STATUS_LABEL[p.status as ImpPoStatus]?.label ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtBdt(p.grand_total_bdt)}</TableCell>
                  <TableCell className="text-right tabular-nums text-orange-600">{fmtBdt(p.due_bdt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}