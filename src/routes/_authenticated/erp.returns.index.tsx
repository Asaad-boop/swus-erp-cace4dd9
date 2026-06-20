import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Download, RotateCcw, Repeat, Search, ChevronRight } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReturnStatusBadge } from "@/components/erp/returns/return-status-badge";
import { listReturnCases, listExchangeCases } from "@/lib/erp/returns/returns.functions";

export const Route = createFileRoute("/_authenticated/erp/returns/")({
  head: () => ({ meta: [{ title: "Returns & Exchanges — ERP" }] }),
  component: ReturnsListPage,
});

type Tab = "all" | "returns" | "exchanges" | "pending_qc" | "restocked" | "closed";

function ReturnsListPage() {
  const { brandIds } = useBrand();
  const listRet = useServerFn(listReturnCases);
  const listExc = useServerFn(listExchangeCases);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
    const rets = (retQ.data ?? []).map((r: any) => ({
      id: r.id, type: "return" as const, caseNumber: r.case_number ?? r.id.slice(0, 8),
      orderNumber: r.order?.order_number, customer: r.order?.shipping_name ?? "—",
      productTitle: r.product?.title ?? "—", productSku: r.product?.sku,
      status: r.return_status, qc: r.qc_condition, amount: Number(r.refund_amount ?? 0),
      createdAt: r.created_at,
    }));
    const excs = (excQ.data ?? []).map((r: any) => ({
      id: r.id, type: "exchange" as const, caseNumber: r.case_number ?? r.id.slice(0, 8),
      orderNumber: r.order?.order_number, customer: r.order?.shipping_name ?? "—",
      productTitle: r.product?.title ?? "—", productSku: r.product?.sku,
      status: r.exchange_status, qc: null,
      amount: Number(r.exchange_charge_collected ?? r.refund_amount ?? 0),
      createdAt: r.created_at,
    }));
    let all: typeof rets = [...rets, ...excs];
    if (tab === "returns") all = rets;
    else if (tab === "exchanges") all = excs;
    else if (tab === "pending_qc") all = rets.filter((r: typeof rets[number]) => r.status === "received");
    else if (tab === "restocked") all = rets.filter((r: typeof rets[number]) => r.status === "restocked");
    else if (tab === "closed") all = all.filter((r) => r.status === "closed" || r.status === "completed");
    if (q.trim()) {
      const needle = q.toLowerCase();
      all = all.filter((r) =>
        r.caseNumber?.toLowerCase().includes(needle) ||
        r.orderNumber?.toString().toLowerCase().includes(needle) ||
        r.customer?.toLowerCase().includes(needle) ||
        r.productTitle?.toLowerCase().includes(needle),
      );
    }
    return all.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
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
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Returns & Exchanges</h1>
          <p className="text-xs text-muted-foreground">Manage return and exchange cases across all brands</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="returns"><RotateCcw className="h-3 w-3 mr-1" />Returns ({counts.returns})</TabsTrigger>
          <TabsTrigger value="exchanges"><Repeat className="h-3 w-3 mr-1" />Exchanges ({counts.exchanges})</TabsTrigger>
          <TabsTrigger value="pending_qc">Pending QC ({counts.pending_qc})</TabsTrigger>
          <TabsTrigger value="restocked">Restocked ({counts.restocked})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({counts.closed})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="flex-1 min-w-[220px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Search case#, order#, customer, product" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">From</label>
          <Input type="date" className="h-9 w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">To</label>
          <Input type="date" className="h-9 w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(retQ.isLoading || excQ.isLoading) && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!retQ.isLoading && !excQ.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No cases found</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell className="font-mono text-xs">{r.caseNumber}</TableCell>
                <TableCell>
                  {r.type === "return"
                    ? <span className="inline-flex items-center gap-1 text-xs"><RotateCcw className="h-3 w-3 text-emerald-600" />Return</span>
                    : <span className="inline-flex items-center gap-1 text-xs"><Repeat className="h-3 w-3 text-indigo-600" />Exchange</span>}
                </TableCell>
                <TableCell className="text-xs">{r.orderNumber ?? "—"}</TableCell>
                <TableCell className="text-xs truncate max-w-[160px]">{r.customer}</TableCell>
                <TableCell className="text-xs truncate max-w-[200px]">
                  <div>{r.productTitle}</div>
                  {r.productSku && <div className="text-[10px] text-muted-foreground font-mono">{r.productSku}</div>}
                </TableCell>
                <TableCell><ReturnStatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right tabular-nums text-xs">৳{r.amount.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(r.createdAt), "dd MMM, hh:mm a")}</TableCell>
                <TableCell>
                  <Link to="/erp/returns/$caseId" params={{ caseId: r.id }} className="text-muted-foreground hover:text-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}