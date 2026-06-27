import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Wallet, DollarSign, TrendingUp, AlertCircle, Percent, Coins, Receipt, Activity } from "lucide-react";

import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MktKpiCard } from "@/components/erp/marketing/_ui/MktKpiCard";
import { MktPageHeader } from "@/components/erp/marketing/_ui/MktPageHeader";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { CostSourceBadge, EstimatedWarning } from "@/components/erp/marketing/_ui/CostSourceBadge";
import { getMetaReports, type MetaReportData } from "@/lib/erp/marketing/meta-reports.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/meta-reports")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/marketing/ad-account-funding" });
  },
  head: () => ({ meta: [{ title: "Meta Reports — Marketing" }] }),
  component: MetaReportsPage,
});

const fmtBDT = (n: number) => `৳${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtUSD = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => Number(n).toLocaleString();
const fmtPct = (n: number) => `${(Number(n) || 0).toFixed(1)}%`;
const fmtRate = (n: number | null) => (n == null ? "—" : Number(n).toFixed(4));
const fmtMult = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);

function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function MetaReportsPage() {
  const { brandId, picker } = useBrandPicker();
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("30d"));
  const [accFilter, setAccFilter] = useState<string>("all");
  const [paidFromFilter, setPaidFromFilter] = useState<string>("all");
  const [campFilter, setCampFilter] = useState<string>("all");
  const [costSource, setCostSource] = useState<string>("all");
  const [estimatedOnly, setEstimatedOnly] = useState(false);

  const fn = useServerFn(getMetaReports);
  const q = useQuery({
    queryKey: ["mkt", "meta-reports", brandId, range.from, range.to],
    queryFn: () => fn({ data: { brandIds: brandId ? [brandId] : undefined, from: range.from, to: range.to } }),
    enabled: !!brandId,
  });

  const d: MetaReportData | undefined = q.data;

  const matchSrc = (s: string) => costSource === "all" || costSource === s;
  const matchEst = (e: boolean) => !estimatedOnly || e;

  const purchases = useMemo(() => {
    let rows = d?.purchases ?? [];
    if (accFilter !== "all") rows = rows.filter((p: any) => p.ad_account_id === accFilter);
    if (paidFromFilter !== "all") rows = rows.filter((p: any) => p.paid_from_account_id === paidFromFilter);
    return rows;
  }, [d, accFilter, paidFromFilter]);

  const spendRows = useMemo(() => {
    let rows = d?.spendByDateAccount ?? [];
    if (accFilter !== "all") rows = rows.filter((r) => r.ad_account_id === accFilter);
    rows = rows.filter((r) => matchSrc(r.cost_source) && matchEst(r.estimated));
    return rows;
  }, [d, accFilter, costSource, estimatedOnly]);

  const campaignRows = useMemo(() => {
    let rows = d?.campaignRows ?? [];
    if (accFilter !== "all") rows = rows.filter((r) => r.ad_account_id === accFilter);
    if (campFilter !== "all") rows = rows.filter((r) => r.campaign_id === campFilter);
    rows = rows.filter((r) => matchSrc(r.cost_source) && matchEst(r.estimated));
    return rows;
  }, [d, accFilter, campFilter, costSource, estimatedOnly]);

  const brandRows = useMemo(() => {
    let rows = d?.brandRows ?? [];
    rows = rows.filter((r) => matchSrc(r.cost_source) && matchEst(r.estimated));
    return rows;
  }, [d, costSource, estimatedOnly]);

  const walletRows = d?.wallets ?? [];
  const kpis = d?.kpis;

  return (
    <div className="space-y-6">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <MktPageHeader
        title="Meta Reports"
        subtitle="FIFO Meta cost reporting · dollar purchases · wallet · spend vs funding"
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <MktKpiCard icon={DollarSign} label="Total Spend USD" value={fmtUSD(kpis?.total_spend_usd ?? 0)} />
        <MktKpiCard icon={Coins} label="Actual Spend BDT" value={fmtBDT(kpis?.actual_spend_bdt ?? 0)} tone="good" />
        <MktKpiCard icon={AlertCircle} label="Estimated Spend BDT" value={fmtBDT(kpis?.estimated_spend_bdt ?? 0)} tone={(kpis?.estimated_spend_bdt ?? 0) > 0 ? "bad" : "neutral"} />
        <MktKpiCard icon={Percent} label="FIFO Coverage" value={fmtPct(kpis?.fifo_coverage_pct ?? 0)} tone={(kpis?.fifo_coverage_pct ?? 0) >= 90 ? "good" : (kpis?.fifo_coverage_pct ?? 0) >= 50 ? "neutral" : "bad"} />
        <MktKpiCard icon={Wallet} label="Remaining Wallet USD" value={fmtUSD(kpis?.remaining_wallet_usd ?? 0)} />
        <MktKpiCard icon={Activity} label="Avg Effective Rate" value={fmtRate(kpis?.avg_effective_rate ?? null)} />
        <MktKpiCard icon={Receipt} label="Total Fees" value={fmtBDT(kpis?.total_fees ?? 0)} />
        <MktKpiCard icon={TrendingUp} label="Net Marketing Cost" value={fmtBDT(kpis?.net_marketing_cost_bdt ?? 0)} />
      </div>

      {(kpis?.estimated_spend_bdt ?? 0) > 0 && <EstimatedWarning />}

      {/* Filters */}
      <Card className="rounded-xl border-gray-100 shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <FilterSelect label="Ad Account" value={accFilter} onChange={setAccFilter}
            options={[{ value: "all", label: "All" }, ...(d?.filters.adAccounts ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
          <FilterSelect label="Paid From" value={paidFromFilter} onChange={setPaidFromFilter}
            options={[{ value: "all", label: "All" }, ...(d?.filters.paidFromAccounts ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
          <FilterSelect label="Campaign" value={campFilter} onChange={setCampFilter}
            options={[{ value: "all", label: "All" }, ...(d?.filters.campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          <FilterSelect label="Cost Source" value={costSource} onChange={setCostSource}
            options={[{ value: "all", label: "All" }, { value: "fifo", label: "FIFO" }, { value: "fx_fallback", label: "FX Fallback" }, { value: "mixed", label: "Mixed" }, { value: "manual", label: "Manual" }]} />
          <div className="flex items-center gap-2 ml-auto">
            <Switch id="est-only" checked={estimatedOnly} onCheckedChange={setEstimatedOnly} />
            <Label htmlFor="est-only" className="text-sm">Estimated only</Label>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="purchases">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="purchases">A · Dollar Purchases</TabsTrigger>
          <TabsTrigger value="funding">B · Ad Account Funding</TabsTrigger>
          <TabsTrigger value="spend-fund">C · Spend vs Fund</TabsTrigger>
          <TabsTrigger value="rate-diff">D · Rate Difference</TabsTrigger>
          <TabsTrigger value="brand">E · Brand Expense</TabsTrigger>
          <TabsTrigger value="campaign">F · Campaign/Adset/Ad</TabsTrigger>
          <TabsTrigger value="outflow">G · Cash/Bank Outflow</TabsTrigger>
        </TabsList>

        {/* A — Dollar Purchases */}
        <TabsContent value="purchases">
          <ReportCard title="Meta Dollar Purchase Report" count={purchases.length}
            onExport={() => downloadCsv(`meta-purchases-${range.from}_${range.to}`,
              ["Date","Brand","Ad Account","USD","Rate","Fee BDT","Total BDT","Eff Rate","Paid From","Status"],
              purchases.map((p: any) => [p.purchase_date, p.brands?.name ?? "—", p.mkt_ad_accounts?.name ?? "—", p.usd_amount, p.usd_rate, p.fee_bdt, p.total_bdt, p.effective_rate, p.erp_accounts?.name ?? "—", p.status]))}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Brand</TableHead><TableHead>Ad Account</TableHead>
                <TableHead className="text-right">USD</TableHead><TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Fee</TableHead><TableHead className="text-right">Total BDT</TableHead>
                <TableHead className="text-right">Eff Rate</TableHead><TableHead>Paid From</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {purchases.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.purchase_date}</TableCell>
                    <TableCell>{p.brands?.name ?? "—"}</TableCell>
                    <TableCell>{p.mkt_ad_accounts?.name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUSD(p.usd_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(p.usd_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(p.fee_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtBDT(p.total_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(p.effective_rate)}</TableCell>
                    <TableCell>{p.erp_accounts?.name ?? "—"}</TableCell>
                    <TableCell><span className="text-xs uppercase">{p.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* B — Ad Account Funding */}
        <TabsContent value="funding">
          <ReportCard title="Ad Account Funding Report" count={walletRows.length}
            onExport={() => downloadCsv(`ad-funding-${range.from}_${range.to}`,
              ["Ad Account","Total USD Purchased","Total BDT Paid","USD Spent","BDT Spent","Remaining USD","Avg Eff Rate","Latest Rate"],
              walletRows.map((w: any) => [w.ad_account_name, w.total_usd_purchased, w.total_bdt_paid, w.total_usd_spent, w.total_bdt_spent, w.remaining_usd, w.avg_effective_rate, w.latest_purchase_rate]))}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ad Account</TableHead>
                <TableHead className="text-right">USD Purchased</TableHead><TableHead className="text-right">BDT Paid</TableHead>
                <TableHead className="text-right">USD Spent</TableHead><TableHead className="text-right">BDT Spent</TableHead>
                <TableHead className="text-right">Remaining USD</TableHead>
                <TableHead className="text-right">Avg Eff Rate</TableHead><TableHead className="text-right">Latest Rate</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {walletRows.map((w: any) => (
                  <TableRow key={w.ad_account_id}>
                    <TableCell className="font-medium">{w.ad_account_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUSD(w.total_usd_purchased)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(w.total_bdt_paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUSD(w.total_usd_spent)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(w.total_bdt_spent)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtUSD(w.remaining_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(w.avg_effective_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(w.latest_purchase_rate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* C — Spend vs Fund */}
        <TabsContent value="spend-fund">
          <ReportCard title="Spend vs Fund Added (per date × ad account)" count={spendRows.length}
            onExport={() => downloadCsv(`spend-vs-fund-${range.from}_${range.to}`,
              ["Date","Ad Account","USD Spent","BDT Actual (FIFO)","BDT Fallback","BDT Total","Cost Source","Estimated"],
              spendRows.map((r) => [r.date, r.ad_account_name, r.spend_usd, r.spend_bdt_fifo, r.spend_bdt_fallback, r.spend_bdt, r.cost_source, r.estimated ? "Yes" : "No"]))}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Ad Account</TableHead>
                <TableHead className="text-right">USD Spent</TableHead>
                <TableHead className="text-right">BDT FIFO</TableHead>
                <TableHead className="text-right">BDT Fallback</TableHead>
                <TableHead className="text-right">BDT Total</TableHead>
                <TableHead className="text-center">Source</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {spendRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.date}</TableCell>
                    <TableCell>{r.ad_account_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUSD(r.spend_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{fmtBDT(r.spend_bdt_fifo)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{fmtBDT(r.spend_bdt_fallback)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtBDT(r.spend_bdt)}</TableCell>
                    <TableCell className="text-center"><CostSourceBadge source={r.cost_source} estimated={r.estimated} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* D — Rate Difference */}
        <TabsContent value="rate-diff">
          <ReportCard title="Rate Difference Report" count={purchases.length}
            onExport={() => downloadCsv(`rate-diff-${range.from}_${range.to}`,
              ["Date","Ad Account","Purchase Rate","Effective Rate (incl fee)","Diff","USD","Extra Cost BDT"],
              purchases.map((p: any) => {
                const diff = (Number(p.effective_rate) || 0) - (Number(p.usd_rate) || 0);
                const extra = diff * (Number(p.usd_amount) || 0);
                return [p.purchase_date, p.mkt_ad_accounts?.name ?? "—", p.usd_rate, p.effective_rate, diff.toFixed(4), p.usd_amount, extra.toFixed(2)];
              }))}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Ad Account</TableHead>
                <TableHead className="text-right">Purchase Rate</TableHead>
                <TableHead className="text-right">Effective Rate</TableHead>
                <TableHead className="text-right">Diff</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="text-right">Extra Cost</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {purchases.map((p: any) => {
                  const pr = Number(p.usd_rate) || 0;
                  const er = Number(p.effective_rate) || 0;
                  const diff = er - pr;
                  const extra = diff * (Number(p.usd_amount) || 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.purchase_date}</TableCell>
                      <TableCell>{p.mkt_ad_accounts?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtRate(pr)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtRate(er)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${diff > 0 ? "text-amber-700" : "text-emerald-700"}`}>{diff.toFixed(4)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtUSD(p.usd_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBDT(extra)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* E — Brand-wise */}
        <TabsContent value="brand">
          <ReportCard title="Brand-wise Meta Expense Report" count={brandRows.length}
            onExport={() => downloadCsv(`brand-meta-${range.from}_${range.to}`,
              ["Brand","USD","BDT","Orders","Revenue","Delivered Revenue","Gross Profit","Net Profit","ROAS","POAS","Cost Source"],
              brandRows.map((r) => [r.brand_name, r.spend_usd, r.spend_bdt, r.orders, r.revenue_bdt, r.delivered_revenue_bdt, r.gross_profit_bdt, r.net_profit_bdt, r.roas, r.poas, r.cost_source]))}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">USD</TableHead><TableHead className="text-right">BDT</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Delivered Rev</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Net Profit</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">POAS</TableHead>
                <TableHead className="text-center">Source</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {brandRows.map((r) => (
                  <TableRow key={r.brand_id ?? r.brand_name}>
                    <TableCell className="font-medium">{r.brand_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUSD(r.spend_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(r.spend_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.orders)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(r.revenue_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(r.delivered_revenue_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(r.gross_profit_bdt)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${r.net_profit_bdt >= 0 ? "text-indigo-700" : "text-red-600"}`}>{fmtBDT(r.net_profit_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMult(r.roas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMult(r.poas)}</TableCell>
                    <TableCell className="text-center"><CostSourceBadge source={r.cost_source} estimated={r.estimated} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* F — Campaign/Adset/Ad */}
        <TabsContent value="campaign">
          <ReportCard title="Campaign / Adset / Ad Spend BDT Report" count={campaignRows.length}
            onExport={() => downloadCsv(`campaign-spend-${range.from}_${range.to}`,
              ["Campaign","Adset","Ad","Ad Account","USD","BDT","Cost Source","Estimated","Meta Purchases","Delivered Revenue","ROAS","POAS"],
              campaignRows.map((r) => [r.campaign_name, r.adset_name ?? "", r.ad_name ?? "", r.ad_account_name, r.spend_usd, r.spend_bdt, r.cost_source, r.estimated ? "Yes" : "No", r.meta_purchases, r.delivered_revenue_bdt, r.true_roas, r.poas]))}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Campaign</TableHead><TableHead>Adset</TableHead><TableHead>Ad</TableHead>
                <TableHead className="text-right">USD</TableHead><TableHead className="text-right">BDT</TableHead>
                <TableHead className="text-center">Source</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">Delivered Rev</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">POAS</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {campaignRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.campaign_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.adset_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.ad_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUSD(r.spend_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtBDT(r.spend_bdt)}</TableCell>
                    <TableCell className="text-center"><CostSourceBadge source={r.cost_source} estimated={r.estimated} /></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(r.meta_purchases)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(r.delivered_revenue_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMult(r.true_roas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMult(r.poas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>

        {/* G — Account-wise outflow */}
        <TabsContent value="outflow">
          <ReportCard title="Account-wise Cash/Bank Outflow" count={Object.keys(groupOutflow(purchases)).length}
            onExport={() => {
              const grp = groupOutflow(purchases);
              const rows = Object.values(grp).map((g) => [g.name, g.total_bdt, g.fees, g.count, Array.from(g.adAccounts).join(" / ")]);
              downloadCsv(`outflow-${range.from}_${range.to}`,
                ["Paid From","Total BDT","Fees BDT","# Purchases","Linked Ad Accounts"], rows);
            }}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Paid From Account</TableHead>
                <TableHead className="text-right">Total BDT</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right"># Purchases</TableHead>
                <TableHead>Linked Ad Accounts</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {Object.values(groupOutflow(purchases)).map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtBDT(g.total_bdt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBDT(g.fees)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNum(g.count)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{Array.from(g.adAccounts).join(" · ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function groupOutflow(purchases: any[]) {
  const out: Record<string, { id: string; name: string; total_bdt: number; fees: number; count: number; adAccounts: Set<string> }> = {};
  for (const p of purchases) {
    if (p.status !== "confirmed") continue;
    const id = p.paid_from_account_id ?? "unknown";
    const name = p.erp_accounts?.name ?? "—";
    const g = out[id] ?? { id, name, total_bdt: 0, fees: 0, count: 0, adAccounts: new Set<string>() };
    g.total_bdt += Number(p.total_bdt) || 0;
    g.fees += Number(p.fee_bdt) || 0;
    g.count += 1;
    if (p.mkt_ad_accounts?.name) g.adAccounts.add(p.mkt_ad_accounts.name);
    out[id] = g;
  }
  return out;
}

function ReportCard({ title, count, onExport, children }: { title: string; count: number; onExport: () => void; children: React.ReactNode }) {
  return (
    <Card className="rounded-xl border-gray-100 shadow-sm mt-3">
      <CardHeader className="border-b border-gray-100 py-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title} <span className="text-xs text-muted-foreground font-normal ml-2">{count} rows</span></CardTitle>
        <Button variant="outline" size="sm" onClick={onExport} disabled={count === 0} className="gap-1.5 bg-white">
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-48 bg-white"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}