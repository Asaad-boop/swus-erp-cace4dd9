import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import { Loader2, Search, TrendingUp, TrendingDown } from "lucide-react";

import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSkuPnl, type SkuPnlRow } from "@/lib/erp/marketing/sku-pnl.functions";

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
      a.returns += r.returns; a.net_profit += r.net_profit; return a;
    },
    { revenue: 0, cogs: 0, ad_spend: 0, returns: 0, net_profit: 0 },
  ), [filtered]);

  return (
    <div className="space-y-5">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SKU Profit & Loss</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Revenue − COGS − Ad Spend − Returns = Net Profit (per product).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={rangeKey} onValueChange={setRangeKey}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / SKU…" className="pl-8 w-64" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Revenue" value={fmtBDT(totals.revenue)} />
        <Kpi label="COGS" value={fmtBDT(totals.cogs)} />
        <Kpi label="Ad Spend" value={fmtBDT(totals.ad_spend)} sub={query.data?.unallocated_ad_spend ? `+${fmtBDT(query.data.unallocated_ad_spend)} unallocated` : undefined} />
        <Kpi label="Returns" value={fmtBDT(totals.returns)} />
        <Kpi label="Net Profit" value={fmtBDT(totals.net_profit)} tone={totals.net_profit >= 0 ? "good" : "bad"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Per-SKU breakdown</CardTitle></CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Kono data nei. Delivered/returned order ar campaign↔product link check korun.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Ad Spend</TableHead>
                    <TableHead className="text-right">Returns ৳</TableHead>
                    <TableHead className="text-right">Net Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.product_id ?? r.title}>
                      <TableCell className="min-w-[240px]">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.delivered_qty)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">{fmtNum(r.returned_qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(r.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(r.cogs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(r.ad_spend)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">{fmtBDT(r.returns)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        <span className={r.net_profit >= 0 ? "text-emerald-700" : "text-red-600"}>
                          {r.net_profit >= 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}
                          {fmtBDT(r.net_profit)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.margin_pct != null ? `${r.margin_pct.toFixed(1)}%` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.roas != null ? `${r.roas.toFixed(2)}x` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className={`text-xl font-semibold mt-1 ${tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : ""}`}>{value}</div>
        {sub ? <div className="text-xs text-muted-foreground mt-0.5">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
