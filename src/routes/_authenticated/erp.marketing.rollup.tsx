import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/brand-context";
import {
  getCampaignProfitRollup,
  getProductProfitRollup,
  type CampaignProfitRow,
  type ProductProfitRow,
} from "@/lib/erp/marketing/rollup.functions";
import { TrendingUp, TrendingDown, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/marketing/rollup")({
  head: () => ({ meta: [{ title: "Profit Rollup — Marketing" }] }),
  component: RollupPage,
});

function dateRange(days: number) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `৳${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}
function fmtMult(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toFixed(2)}×`;
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function RollupPage() {
  const { selectedBrandId } = useBrand();
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const range = useMemo(() => dateRange(days), [days]);

  const campaignsFn = useServerFn(getCampaignProfitRollup);
  const productsFn = useServerFn(getProductProfitRollup);

  const campaignsQ = useQuery({
    queryKey: ["rollup-campaigns", selectedBrandId, range.from, range.to],
    queryFn: () => campaignsFn({ data: { brandId: selectedBrandId!, ...range } }),
    enabled: !!selectedBrandId,
  });
  const productsQ = useQuery({
    queryKey: ["rollup-products", selectedBrandId, range.from, range.to],
    queryFn: () => productsFn({ data: { brandId: selectedBrandId!, ...range } }),
    enabled: !!selectedBrandId,
  });

  if (!selectedBrandId) {
    return <div className="text-sm text-muted-foreground">Brand select korun.</div>;
  }

  const totals = campaignsQ.data?.totals;
  const campRows = (campaignsQ.data?.rows ?? []).filter((r) =>
    search ? r.campaign_name.toLowerCase().includes(search.toLowerCase()) : true,
  );
  const prodRows = (productsQ.data ?? []).filter((r) =>
    search ? r.product_name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profit Rollup</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ad spend + manual spend vs delivered revenue, COGS, operating cost → real ROAS & POAS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[200px]"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Total Spend" value={fmtMoney(totals?.total_spend ?? 0)} hint={`Ad ${fmtMoney(totals?.ad_spend ?? 0)} + Manual ${fmtMoney(totals?.manual_spend ?? 0)}`} />
        <Kpi label="Delivered Revenue" value={fmtMoney(totals?.delivered_revenue ?? 0)} hint={`${fmtNum(totals?.delivered_orders ?? 0)} orders`} />
        <Kpi label="COGS" value={fmtMoney(totals?.cogs ?? 0)} />
        <Kpi label="Gross Profit" value={fmtMoney(totals?.gross_profit ?? 0)} hint={`Op cost ${fmtMoney(totals?.operating_cost ?? 0)}`} />
        <Kpi
          label="Net Profit"
          value={fmtMoney(totals?.net_profit ?? 0)}
          tone={(totals?.net_profit ?? 0) >= 0 ? "good" : "bad"}
          hint={fmtPct(totals?.profit_margin)}
        />
        <Kpi
          label="ROAS / POAS"
          value={`${fmtMult(totals?.roas)} / ${fmtMult(totals?.poas)}`}
          tone={(totals?.poas ?? 0) >= 1 ? "good" : "bad"}
        />
      </div>

      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns">By Campaign</TabsTrigger>
          <TabsTrigger value="products">By Product</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Campaign profitability</CardTitle>
              <ExportButton
                filename={`campaign-rollup-${range.from}-${range.to}.csv`}
                rows={campRows}
                columns={campaignCsvCols}
              />
            </CardHeader>
            <CardContent className="p-0">
              {campaignsQ.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              ) : campRows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No campaigns in this window.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead className="text-right">Ad Spend</TableHead>
                        <TableHead className="text-right">Manual</TableHead>
                        <TableHead className="text-right">Total Spend</TableHead>
                        <TableHead className="text-right">Delivered Rev</TableHead>
                        <TableHead className="text-right">COGS</TableHead>
                        <TableHead className="text-right">Op Cost</TableHead>
                        <TableHead className="text-right">Gross Profit</TableHead>
                        <TableHead className="text-right">Net Profit</TableHead>
                        <TableHead className="text-right">ROAS</TableHead>
                        <TableHead className="text-right">POAS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campRows.map((r) => (
                        <TableRow key={r.campaign_id}>
                          <TableCell>
                            <Link
                              to="/erp/marketing/campaigns/$campaignId"
                              params={{ campaignId: r.campaign_id }}
                              className="font-medium hover:underline"
                            >
                              {r.campaign_name}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {r.account_name ?? "—"} · {r.status ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.ad_spend)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.manual_spend)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.total_spend)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoney(r.delivered_revenue)}
                            <div className="text-xs text-muted-foreground">{r.delivered_orders} orders</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.cogs)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.operating_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.gross_profit)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <ProfitCell value={r.net_profit} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMult(r.roas)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <PoasCell value={r.poas} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Product profitability</CardTitle>
              <ExportButton
                filename={`product-rollup-${range.from}-${range.to}.csv`}
                rows={prodRows}
                columns={productCsvCols}
              />
            </CardHeader>
            <CardContent className="p-0">
              {productsQ.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              ) : prodRows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No delivered orders in this window.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">COGS</TableHead>
                        <TableHead className="text-right">Op Cost</TableHead>
                        <TableHead className="text-right">Gross Profit</TableHead>
                        <TableHead className="text-right">Direct Mkt</TableHead>
                        <TableHead className="text-right">Allocated Ad</TableHead>
                        <TableHead className="text-right">Net Profit</TableHead>
                        <TableHead className="text-right">ROAS</TableHead>
                        <TableHead className="text-right">POAS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prodRows.map((r) => (
                        <TableRow key={r.product_id}>
                          <TableCell>
                            <div className="font-medium">{r.product_name}</div>
                            {r.sku && <div className="text-xs text-muted-foreground">SKU: {r.sku}</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(r.units_sold)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.delivered_revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.cogs)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.operating_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.gross_profit)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.direct_marketing_spend)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(r.allocated_ad_spend)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <ProfitCell value={r.net_profit} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMult(r.roas)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <PoasCell value={r.poas} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold tabular-nums mt-1 ${tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-red-500" : ""}`}>
          {value}
        </div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ProfitCell({ value }: { value: number }) {
  const good = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${good ? "text-emerald-500" : "text-red-500"}`}>
      {good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {fmtMoney(value)}
    </span>
  );
}

function PoasCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const variant = value >= 1 ? "default" : value >= 0 ? "secondary" : "destructive";
  return <Badge variant={variant as any}>{fmtMult(value)}</Badge>;
}

type Col<T> = { header: string; get: (r: T) => string | number | null };
const campaignCsvCols: Col<CampaignProfitRow>[] = [
  { header: "Campaign", get: (r) => r.campaign_name },
  { header: "Account", get: (r) => r.account_name ?? "" },
  { header: "Status", get: (r) => r.status ?? "" },
  { header: "Ad Spend", get: (r) => r.ad_spend },
  { header: "Manual Spend", get: (r) => r.manual_spend },
  { header: "Total Spend", get: (r) => r.total_spend },
  { header: "Confirmed Orders", get: (r) => r.confirmed_orders },
  { header: "Delivered Orders", get: (r) => r.delivered_orders },
  { header: "Delivered Revenue", get: (r) => r.delivered_revenue },
  { header: "COGS", get: (r) => r.cogs },
  { header: "Op Cost", get: (r) => r.operating_cost },
  { header: "Gross Profit", get: (r) => r.gross_profit },
  { header: "Net Profit", get: (r) => r.net_profit },
  { header: "ROAS", get: (r) => r.roas ?? "" },
  { header: "POAS", get: (r) => r.poas ?? "" },
];
const productCsvCols: Col<ProductProfitRow>[] = [
  { header: "Product", get: (r) => r.product_name },
  { header: "SKU", get: (r) => r.sku ?? "" },
  { header: "Units Sold", get: (r) => r.units_sold },
  { header: "Delivered Revenue", get: (r) => r.delivered_revenue },
  { header: "COGS", get: (r) => r.cogs },
  { header: "Op Cost", get: (r) => r.operating_cost },
  { header: "Gross Profit", get: (r) => r.gross_profit },
  { header: "Direct Marketing", get: (r) => r.direct_marketing_spend },
  { header: "Allocated Ad", get: (r) => r.allocated_ad_spend },
  { header: "Total Marketing", get: (r) => r.total_marketing_spend },
  { header: "Net Profit", get: (r) => r.net_profit },
  { header: "ROAS", get: (r) => r.roas ?? "" },
  { header: "POAS", get: (r) => r.poas ?? "" },
];

function ExportButton<T>({ filename, rows, columns }: { filename: string; rows: T[]; columns: Col<T>[] }) {
  function onClick() {
    const lines = [columns.map((c) => csvEsc(c.header)).join(",")];
    for (const r of rows) {
      lines.push(columns.map((c) => csvEsc(c.get(r))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      onClick={onClick}
      disabled={!rows.length}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" />
      Export CSV
    </button>
  );
}

function csvEsc(v: string | number | null) {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : v;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}