import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import {
  Loader2, Search, TrendingUp, TrendingDown, Wallet, Package, Megaphone,
  Receipt, AlertTriangle, ArrowRight, Download, PieChart,
} from "lucide-react";

import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { getSkuPnl, type SkuPnlRow } from "@/lib/erp/marketing/sku-pnl.functions";
import { MktKpiCard } from "@/components/erp/marketing/_ui/MktKpiCard";
import { MktPageHeader, MktEmptyState } from "@/components/erp/marketing/_ui/MktPageHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing/sku-pnl")({
  component: SkuPnlPage,
});

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
const fmtBDT = (n: number) => `৳${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtNum = (n: number) => Number(n).toLocaleString();

function SkuPnlPage() {
  const { brandId, picker } = useBrandPicker();
  const [rangeKey, setRangeKey] = useState("30d");
  const [q, setQ] = useState("");

  const { from, to } = useMemo(() => {
    const days = RANGES[rangeKey] ?? 30;
    const today = new Date();
    return { from: format(subDays(today, days - 1), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  }, [rangeKey]);

  const fn = useServerFn(getSkuPnl);
  const query = useQuery({
    queryKey: ["mkt", "sku-pnl", brandId, from, to],
    queryFn: () => fn({ data: { brandId: brandId!, from, to } }),
    enabled: !!brandId,
  });

  const filtered: SkuPnlRow[] = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(term) || (r.sku ?? "").toLowerCase().includes(term));
  }, [query.data, q]);

  const totals = useMemo(() => filtered.reduce(
    (a, r) => {
      a.revenue += r.revenue; a.cogs += r.cogs; a.ad_spend += r.ad_spend;
      a.manual_expenses += r.manual_expenses ?? 0;
      a.returns += r.returns; a.net_profit += r.net_profit; return a;
    },
    { revenue: 0, cogs: 0, ad_spend: 0, manual_expenses: 0, returns: 0, net_profit: 0 },
  ), [filtered]);

  const avgMargin = totals.revenue > 0 ? (totals.net_profit / totals.revenue) * 100 : null;

  const exportCsv = () => {
    const header = ["Product", "SKU", "Delivered", "Returned", "Revenue", "COGS", "Ad Spend", "Other Mkt", "Returns", "Net Profit", "Margin %", "ROAS"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        `"${r.title.replace(/"/g, '""')}"`,
        r.sku ?? "",
        r.delivered_qty, r.returned_qty,
        r.revenue, r.cogs, r.ad_spend, r.manual_expenses ?? 0, r.returns, r.net_profit,
        r.margin_pct ?? "", r.roas ?? "",
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sku-pnl-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <MktPageHeader
        title="SKU Profit & Loss"
        subtitle="Revenue − COGS − Ad Spend − Other Marketing − Returns = Net Profit (per product)"
        actions={
          <>
            <Select value={rangeKey} onValueChange={setRangeKey}>
              <SelectTrigger className="w-32 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / SKU…" className="pl-8 w-64 bg-white" />
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} className="bg-white gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MktKpiCard icon={Receipt} label="Revenue" value={fmtBDT(totals.revenue)} />
        <MktKpiCard icon={Package} label="COGS" value={fmtBDT(totals.cogs)} />
        <MktKpiCard
          icon={Megaphone}
          label="Ad Spend"
          value={fmtBDT(totals.ad_spend)}
          sub={query.data?.unallocated_ad_spend ? `+${fmtBDT(query.data.unallocated_ad_spend)} unallocated` : "All allocated"}
        />
        <MktKpiCard
          icon={Wallet}
          label="Other Mkt"
          value={fmtBDT(totals.manual_expenses)}
          sub={query.data?.unallocated_manual_expenses ? `+${fmtBDT(query.data.unallocated_manual_expenses)} unallocated` : undefined}
        />
        <MktKpiCard icon={TrendingDown} label="Returns" value={fmtBDT(totals.returns)} tone={totals.returns > 0 ? "bad" : "neutral"} />
        <MktKpiCard
          icon={PieChart}
          label="Net Profit"
          value={fmtBDT(totals.net_profit)}
          tone={totals.net_profit >= 0 ? "good" : "bad"}
          sub={avgMargin != null ? `${avgMargin.toFixed(1)}% margin` : undefined}
        />
      </div>

      <Card className="rounded-xl border-gray-100 shadow-sm">
        <CardHeader className="border-b border-gray-100 py-4">
          <CardTitle className="text-base">Per-SKU breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <MktEmptyState
              icon={Package}
              title="No SKU data yet"
              subtitle="Delivered/returned orders ar campaign↔product link thakle ekhane data dekhabe."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60 border-b border-gray-100">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Ad Spend</TableHead>
                    <TableHead className="text-right">Other Mkt</TableHead>
                    <TableHead className="text-right">Returns ৳</TableHead>
                    <TableHead className="text-right">Net Profit</TableHead>
                    <TableHead className="text-right min-w-[140px]">Margin</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.product_id ?? r.title} className="hover:bg-gray-50/60 transition-colors animate-fade-in">
                      <TableCell className="min-w-[240px]">
                        <div className="font-medium text-foreground">{r.title}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{r.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.delivered_qty)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">{fmtNum(r.returned_qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(r.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(r.cogs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(r.ad_spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(r.manual_expenses ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">{fmtBDT(r.returns)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        <span className={cn("inline-flex items-center", r.net_profit >= 0 ? "text-emerald-700" : "text-red-600")}>
                          {r.net_profit >= 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}
                          {fmtBDT(r.net_profit)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <MarginBar pct={r.margin_pct} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.roas != null ? `${r.roas.toFixed(2)}x` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-gray-50 font-semibold border-t-2 border-gray-200 hover:bg-gray-50">
                    <TableCell className="text-xs uppercase tracking-wide text-muted-foreground">Total ({filtered.length} SKUs)</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{fmtBDT(totals.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(totals.cogs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(totals.ad_spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(totals.manual_expenses)}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">{fmtBDT(totals.returns)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", totals.net_profit >= 0 ? "text-emerald-700" : "text-red-600")}>
                      {fmtBDT(totals.net_profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totals.ad_spend > 0 ? `${(totals.revenue / totals.ad_spend).toFixed(2)}x` : "—"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unallocated CTA */}
      {(query.data?.unallocated_ad_spend ?? 0) > 0 && (
        <Card className="rounded-xl border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="p-5 flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-amber-900">
                Unallocated Ad Spend: {fmtBDT(query.data!.unallocated_ad_spend)}
              </h3>
              <p className="text-sm text-amber-800/80 mt-1">
                Ei amount kono SKU er sathe link kora hoy ni. Campaigns e giye product link korun, P&L ar accurate hobe.
              </p>
            </div>
            <Link to="/erp/marketing/campaigns" className="shrink-0">
              <Button variant="outline" size="sm" className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 gap-1.5">
                Go to Campaigns <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MarginBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const width = Math.min(100, Math.abs(pct));
  const color =
    pct >= 40 ? "bg-emerald-500" :
    pct >= 20 ? "bg-amber-500" :
    pct >= 0  ? "bg-orange-500" :
                "bg-red-500";
  const textColor =
    pct >= 40 ? "text-emerald-700" :
    pct >= 20 ? "text-amber-700" :
    pct >= 0  ? "text-orange-700" :
                "text-red-600";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn("absolute top-0 h-full rounded-full transition-[width] duration-500", color, pct < 0 ? "right-1/2" : "left-0")}
          style={{ width: `${width / (pct < 0 ? 2 : 1)}%` }}
        />
      </div>
      <span className={cn("text-xs font-semibold tabular-nums w-12 text-right", textColor)}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}