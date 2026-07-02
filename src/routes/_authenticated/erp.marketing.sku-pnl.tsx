import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, Search, TrendingUp, TrendingDown, Wallet, Package, Megaphone,
  Receipt, AlertTriangle, ArrowRight, Download, PieChart, ChevronRight,
} from "lucide-react";

import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSkuPnl, type SkuPnlRow } from "@/lib/erp/marketing/sku-pnl.functions";
import { MktKpiCard } from "@/components/erp/marketing/_ui/MktKpiCard";
import { MktPageHeader, MktEmptyState } from "@/components/erp/marketing/_ui/MktPageHeader";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing/sku-pnl")({
  component: SkuPnlPage,
});

const fmtBDT = (n: number) => `৳${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtNum = (n: number) => Number(n).toLocaleString();

function SkuPnlPage() {
  const { brandId, picker } = useBrandPicker();
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("today"));
  const [q, setQ] = useState("");

  const { from, to } = range;

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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const totals = useMemo(() => filtered.reduce(
    (a, r) => {
      a.gross_revenue += r.gross_revenue;
      a.sellable_returns += r.sellable_returns;
      a.damaged_returns += r.damaged_returns;
      a.net_revenue += r.net_revenue;
      a.net_cogs += r.net_cogs;
      a.total_ad_spend += r.total_ad_spend;
      a.total_marketing += r.total_marketing;
      a.net_profit += r.net_profit;
      return a;
    },
    { gross_revenue: 0, sellable_returns: 0, damaged_returns: 0, net_revenue: 0, net_cogs: 0, total_ad_spend: 0, total_marketing: 0, net_profit: 0 },
  ), [filtered]);

  const totalReturns = totals.sellable_returns + totals.damaged_returns;
  const avgMargin = totals.net_revenue > 0 ? (totals.net_profit / totals.net_revenue) * 100 : null;

  const exportCsv = () => {
    const header = [
      "Product","SKU","Units Sold","Sellable Ret","Damaged Ret","Net Units",
      "Gross Rev","Sellable Ret ৳","Damaged Ret ৳","Net Rev",
      "Gross COGS","COGS Reversed","Net COGS",
      "Gross Profit","Ad Spend","Influencer","UGC","Other Mkt","Total Mkt",
      "Net Profit","Margin %","ROAS",
    ];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        `"${r.title.replace(/"/g, '""')}"`, r.sku ?? "",
        r.units_sold, r.units_returned_sellable, r.units_returned_damaged, r.net_units_sold,
        r.gross_revenue, r.sellable_returns, r.damaged_returns, r.net_revenue,
        r.gross_cogs, r.cogs_reversed, r.net_cogs,
        r.gross_profit, r.total_ad_spend, r.influencer_spend, r.ugc_spend, r.other_marketing, r.total_marketing,
        r.net_profit, r.margin_pct ?? "", r.roas ?? "",
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
            <DateRangePicker value={range} onChange={setRange} />
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
        <MktKpiCard icon={Receipt} label="Gross Revenue" value={fmtBDT(totals.gross_revenue)} />
        <MktKpiCard
          icon={TrendingDown}
          label="Total Returns"
          value={fmtBDT(totalReturns)}
          tone={totalReturns > 0 ? "bad" : "neutral"}
          sub={`${fmtBDT(totals.sellable_returns)} sellable · ${fmtBDT(totals.damaged_returns)} damaged`}
        />
        <MktKpiCard icon={Package} label="Net Revenue" value={fmtBDT(totals.net_revenue)} />
        <MktKpiCard
          icon={Megaphone}
          label="Marketing Spend"
          value={fmtBDT(totals.total_marketing)}
          sub={query.data?.unallocated_ad_spend ? `+${fmtBDT(query.data.unallocated_ad_spend)} unallocated` : "All allocated"}
        />
        <MktKpiCard
          icon={PieChart}
          label="Net Profit"
          value={fmtBDT(totals.net_profit)}
          tone={totals.net_profit >= 0 ? "good" : "bad"}
        />
        <MktKpiCard
          icon={Wallet}
          label="Avg Margin"
          value={avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—"}
          tone={avgMargin == null ? "neutral" : avgMargin >= 40 ? "good" : avgMargin >= 20 ? "neutral" : "bad"}
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
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Net Revenue</TableHead>
                    <TableHead className="text-right">Net COGS</TableHead>
                    <TableHead className="text-right">Ad Spend</TableHead>
                    <TableHead className="text-right">Net Profit</TableHead>
                    <TableHead className="text-right min-w-[140px]">Margin</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const id = r.product_id ?? r.title;
                    const isOpen = expanded.has(id);
                    return (
                      <Fragment key={id}>
                        <TableRow
                          onClick={() => toggle(id)}
                          className="hover:bg-gray-50/60 transition-colors cursor-pointer animate-fade-in"
                        >
                          <TableCell className="w-8 text-muted-foreground">
                            <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
                          </TableCell>
                          <TableCell className="min-w-[240px]">
                            <div className="font-medium text-foreground">{r.title}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{r.sku ?? "—"}</div>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{fmtBDT(r.net_revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums text-gray-700">{fmtBDT(r.net_cogs)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-700">{fmtBDT(r.total_ad_spend)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            <span className={cn("inline-flex items-center", r.net_profit >= 0 ? "text-indigo-700" : "text-red-600")}>
                              {r.net_profit >= 0 ? <TrendingUp className="inline h-3 w-3 mr-1" /> : <TrendingDown className="inline h-3 w-3 mr-1" />}
                              {fmtBDT(r.net_profit)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right"><MarginBar pct={r.margin_pct} /></TableCell>
                          <TableCell className="text-right tabular-nums">{r.roas != null ? `${r.roas.toFixed(2)}x` : "—"}</TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-gray-50/40 hover:bg-gray-50/40">
                            <TableCell colSpan={9} className="p-0">
                              <ExpandedDetail row={r} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="bg-gray-50 font-semibold border-t-2 border-gray-200 hover:bg-gray-50">
                    <TableCell />
                    <TableCell className="text-xs uppercase tracking-wide text-muted-foreground">Total ({filtered.length} SKUs)</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(totals.net_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(totals.net_cogs)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(totals.total_ad_spend)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", totals.net_profit >= 0 ? "text-indigo-700" : "text-red-600")}>
                      {fmtBDT(totals.net_profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totals.total_marketing > 0 ? `${(totals.net_revenue / totals.total_marketing).toFixed(2)}x` : "—"}
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

function Line({
  label, value, units, tone = "default", indent, bold,
}: {
  label: string; value: string; units?: string;
  tone?: "default" | "muted" | "negative" | "positive" | "emerald" | "blue" | "indigo";
  indent?: boolean; bold?: boolean;
}) {
  const toneClass =
    tone === "muted" ? "text-gray-500" :
    tone === "negative" ? "text-red-600" :
    tone === "positive" ? "text-emerald-700" :
    tone === "emerald" ? "text-emerald-700" :
    tone === "blue" ? "text-blue-700" :
    tone === "indigo" ? "text-indigo-700" :
    "text-gray-900";
  return (
    <div className={cn("flex items-baseline justify-between text-sm", indent && "pl-4", bold && "font-semibold")}>
      <span className={cn(tone === "muted" ? "text-gray-500" : "text-gray-700")}>{label}</span>
      <span className={cn("tabular-nums", toneClass)}>
        {value}{units && <span className="text-xs text-muted-foreground ml-2">{units}</span>}
      </span>
    </div>
  );
}

function MarginBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const cls = pct >= 40 ? "bg-emerald-100 text-emerald-800"
    : pct >= 20 ? "bg-amber-100 text-amber-800"
    : "bg-red-100 text-red-800";
  return <Badge className={cn("ml-2", cls)}>{pct.toFixed(1)}%</Badge>;
}

function ExpandedDetail({ row: r }: { row: SkuPnlRow }) {
  const wac = r.units_sold > 0 ? r.gross_cogs / r.units_sold : 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-5">
      {/* REVENUE */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Revenue</div>
        <Line label="Gross Revenue" value={fmtBDT(r.gross_revenue)} units={`${fmtNum(r.units_sold)} units`} tone="muted" />
        <Line label="− Sellable Returns" value={fmtBDT(r.sellable_returns)} units={`${fmtNum(r.units_returned_sellable)} units, restocked`} tone="negative" indent />
        <Line label="− Damaged Returns" value={fmtBDT(r.damaged_returns)} units={`${fmtNum(r.units_returned_damaged)} units, written off`} tone="negative" indent />
        <div className="border-t pt-1.5 mt-1.5">
          <Line label="Net Revenue" value={fmtBDT(r.net_revenue)} units={`${fmtNum(r.net_units_sold)} net units`} bold />
        </div>
      </div>

      {/* COGS */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cost of Goods</div>
        <Line label="Gross COGS" value={fmtBDT(r.gross_cogs)} units={wac > 0 ? `${fmtNum(r.units_sold)} × ${fmtBDT(wac)} WAC` : undefined} tone="muted" />
        <Line label="− COGS Reversed" value={fmtBDT(r.cogs_reversed)} units={`${fmtNum(r.units_returned_sellable)} sellable back`} tone="positive" indent />
        <div className="border-t pt-1.5 mt-1.5">
          <Line label="Net COGS" value={fmtBDT(r.net_cogs)} bold />
        </div>
        {r.damaged_cogs_loss > 0 && (
          <Line label="Damaged Loss (info)" value={fmtBDT(r.damaged_cogs_loss)} units={`${fmtNum(r.units_returned_damaged)} units`} tone="muted" indent />
        )}
        <div className="border-t pt-2 mt-2">
          <div className="flex items-baseline justify-between text-sm font-semibold">
            <span className="text-emerald-700">Gross Profit</span>
            <span className="tabular-nums text-emerald-700">
              {fmtBDT(r.gross_profit)}
              {r.net_revenue > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  ({((r.gross_profit / r.net_revenue) * 100).toFixed(1)}%)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* MARKETING */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Marketing</div>
        <Line label="Meta Ad Spend" value={fmtBDT(r.total_ad_spend)} tone="blue" />
        <Line label="Influencer" value={fmtBDT(r.influencer_spend)} tone="blue" indent />
        <Line label="UGC / Content" value={fmtBDT(r.ugc_spend)} tone="blue" indent />
        <Line label="Other" value={fmtBDT(r.other_marketing)} tone="blue" indent />
        <div className="border-t pt-1.5 mt-1.5">
          <Line label="Total Marketing" value={fmtBDT(r.total_marketing)} tone="blue" bold />
        </div>
      </div>

      {/* NET PROFIT */}
      <div className="space-y-2 rounded-lg bg-indigo-50/60 border border-indigo-100 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700/80">Bottom Line</div>
        <div>
          <div className="text-xs text-indigo-700/70">Net Profit</div>
          <div className={cn("text-2xl font-bold tabular-nums", r.net_profit >= 0 ? "text-indigo-700" : "text-red-600")}>
            {fmtBDT(r.net_profit)}
            <MarginBadge pct={r.margin_pct} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-100">
          <div>
            <div className="text-xs text-indigo-700/70">ROAS</div>
            <div className="font-semibold text-indigo-700 tabular-nums">{r.roas != null ? `${r.roas.toFixed(2)}x` : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-indigo-700/70">Margin</div>
            <div className="font-semibold text-indigo-700 tabular-nums">{r.margin_pct != null ? `${r.margin_pct.toFixed(1)}%` : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}