import { createFileRoute, Link } from "@tanstack/react-router";
import { Megaphone, Wrench, Code2, RefreshCw, TrendingUp, Banknote, Search, Package, Truck, Layers, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBrand } from "@/contexts/brand-context";
import {
  getCampaignRollup,
  getOverviewKpis,
  listRebuildJobs,
  rebuildProfitWindow,
} from "@/lib/erp/marketing/profit.functions";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing Intelligence — ERP" }] }),
  component: MarketingDashboard,
});

const phases = [
  { n: 1, name: "Database Foundation", done: true },
  { n: 2, name: "DB Functions — attribution & profit RPCs", done: true },
  { n: 3, name: "Meta API Sync (cron)", done: true },
  { n: 4, name: "Website UTM / fbclid tracker", done: true },
  { n: 5, name: "Profit Snapshot Engine (rollup + hourly cron)", done: true },
  { n: 6, name: "Accounting Integration (auto-post Meta spend)", done: true },
  { n: 7, name: "Full UI (Campaigns, Adsets, Ads, Attribution, Product×Campaign, Courier×Campaign)", done: true },
  { n: 8, name: "Polish — health alerts, data-quality checks", done: true },
];

function MarketingDashboard() {
  const { activeBrand } = useBrand();
  const qc = useQueryClient();
  const fnKpis = useServerFn(getOverviewKpis);
  const fnRollup = useServerFn(getCampaignRollup);
  const fnRebuild = useServerFn(rebuildProfitWindow);
  const fnJobs = useServerFn(listRebuildJobs);

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  const fmtDay = (d: Date) => d.toISOString().slice(0, 10);
  const range = { from: fmtDay(from), to: fmtDay(today) };

  const kpisQ = useQuery({
    queryKey: ["mkt-kpis", activeBrand?.id, range.from, range.to],
    queryFn: () => fnKpis({ data: { brand_id: activeBrand!.id, ...range } }),
    enabled: !!activeBrand,
  });
  const rollupQ = useQuery({
    queryKey: ["mkt-rollup", activeBrand?.id, range.from, range.to],
    queryFn: () => fnRollup({ data: { brand_id: activeBrand!.id, ...range } }),
    enabled: !!activeBrand,
  });
  const jobsQ = useQuery({
    queryKey: ["mkt-jobs", activeBrand?.id],
    queryFn: () => fnJobs({ data: { brand_id: activeBrand?.id, limit: 5 } }),
    enabled: !!activeBrand,
  });

  const rebuildMut = useMutation({
    mutationFn: () => fnRebuild({ data: { brand_id: activeBrand?.id, days: 7 } }),
    onSuccess: (r: any) => {
      toast.success(`Rebuilt: ${r?.orders_processed ?? 0} orders`);
      qc.invalidateQueries({ queryKey: ["mkt-kpis"] });
      qc.invalidateQueries({ queryKey: ["mkt-rollup"] });
      qc.invalidateQueries({ queryKey: ["mkt-jobs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const k: any = kpisQ.data ?? {};
  const lastJob = jobsQ.data?.[0];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Marketing Intelligence</h1>
            <p className="text-sm text-muted-foreground">
              Real ROAS / POAS / net profit — Meta spend, orders, courier, product cost ekshathe.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastJob && (
            <span className="text-xs text-muted-foreground">
              Last sync: {formatDistanceToNow(new Date(lastJob.started_at), { addSuffix: true })}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!activeBrand || rebuildMut.isPending}
            onClick={() => rebuildMut.mutate()}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${rebuildMut.isPending ? "animate-spin" : ""}`} />
            Rebuild last 7d
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/erp/marketing/install">
              <Code2 className="h-4 w-4 mr-1" /> Tracker
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/erp/marketing/accounting">
              <Banknote className="h-4 w-4 mr-1" /> Accounting
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link to="/erp/marketing/campaigns"><Layers className="h-4 w-4 mr-1" /> Campaigns</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to="/erp/marketing/attribution"><Search className="h-4 w-4 mr-1" /> Attribution</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to="/erp/marketing/reports/products"><Package className="h-4 w-4 mr-1" /> Product × Campaign</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to="/erp/marketing/reports/couriers"><Truck className="h-4 w-4 mr-1" /> Courier × Campaign</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to="/erp/marketing/health"><ShieldAlert className="h-4 w-4 mr-1" /> Health & Alerts</Link>
        </Button>
      </div>

      {activeBrand && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Kpi label="Ad Spend" value={fmtMoney(k.ad_spend)} />
          <Kpi label="Net Revenue" value={fmtMoney(k.net_revenue)} />
          <Kpi
            label="Net Profit"
            value={fmtMoney(k.net_profit)}
            accent={Number(k.net_profit) >= 0 ? "good" : "bad"}
          />
          <Kpi label="Real ROAS" value={k.real_roas != null ? `${Number(k.real_roas).toFixed(2)}x` : "—"} />
          <Kpi
            label="POAS"
            value={k.poas != null ? `${Number(k.poas).toFixed(2)}x` : "—"}
            accent={k.poas != null ? (Number(k.poas) >= 1 ? "good" : "bad") : undefined}
          />
          <Kpi
            label="Attribution"
            value={
              k.attribution_coverage != null
                ? `${Math.round(Number(k.attribution_coverage) * 100)}%`
                : "—"
            }
            sub={`${k.attributed_orders ?? 0}/${k.total_orders ?? 0}`}
          />
        </div>
      )}

      {activeBrand && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Campaign Rollup (last 7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rollupQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {rollupQ.data && rollupQ.data.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Akhono data nai. Meta sync cron run hole spend ashbe, attribution + profit auto rebuild hobe.
              </div>
            )}
            {rollupQ.data && rollupQ.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground border-b">
                    <tr className="text-left">
                      <th className="py-1.5 pr-2">Day</th>
                      <th className="pr-2">Campaign</th>
                      <th className="pr-2 text-right">Spend</th>
                      <th className="pr-2 text-right">Orders</th>
                      <th className="pr-2 text-right">Deliv</th>
                      <th className="pr-2 text-right">Net Rev</th>
                      <th className="pr-2 text-right">Net Profit</th>
                      <th className="pr-2 text-right">ROAS</th>
                      <th className="pr-2 text-right">POAS</th>
                      <th>Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollupQ.data.slice(0, 50).map((r: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{r.day}</td>
                        <td className="pr-2 max-w-[260px] truncate">
                          {r.campaign_name ?? r.external_campaign_id}
                        </td>
                        <td className="pr-2 text-right">{fmtMoney(r.ad_spend)}</td>
                        <td className="pr-2 text-right">{r.orders_attributed}</td>
                        <td className="pr-2 text-right">{r.delivered_orders}</td>
                        <td className="pr-2 text-right">{fmtMoney(r.net_revenue)}</td>
                        <td className={`pr-2 text-right ${Number(r.net_profit) < 0 ? "text-destructive" : ""}`}>
                          {fmtMoney(r.net_profit)}
                        </td>
                        <td className="pr-2 text-right">
                          {r.real_roas != null ? `${Number(r.real_roas).toFixed(2)}x` : "—"}
                        </td>
                        <td className="pr-2 text-right">
                          {r.poas != null ? `${Number(r.poas).toFixed(2)}x` : "—"}
                        </td>
                        <td>
                          <HealthBadge v={r.health} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Build Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {phases.map((p) => (
              <li key={p.n} className="flex items-start gap-3">
                <Badge variant={p.done ? "default" : "outline"} className="mt-0.5 shrink-0">
                  {p.done ? "✓" : p.n}
                </Badge>
                <span className={p.done ? "text-foreground" : "text-muted-foreground"}>{p.name}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {jobsQ.data && jobsQ.data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent rebuild runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1">
              {jobsQ.data.map((j: any) => (
                <div key={j.id} className="flex items-center justify-between border-b last:border-0 py-1">
                  <div>
                    <span className="text-muted-foreground">{new Date(j.started_at).toLocaleString()}</span>
                    {" · "}
                    <span>{j.trigger}</span>
                    {" · "}
                    <span>
                      {j.range_from} → {j.range_to}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{j.orders_processed} orders</span>
                    <Badge variant={j.status === "success" ? "default" : "destructive"}>{j.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "good" | "bad";
}) {
  const cls = accent === "good" ? "text-emerald-600" : accent === "bad" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${cls}`}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function HealthBadge({ v }: { v: string | null }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    profitable: "bg-emerald-100 text-emerald-700 border-emerald-200",
    losing: "bg-red-100 text-red-700 border-red-200",
    no_orders: "bg-amber-100 text-amber-700 border-amber-200",
    low_delivery: "bg-amber-100 text-amber-700 border-amber-200",
    high_return: "bg-orange-100 text-orange-700 border-orange-200",
    idle: "bg-muted text-muted-foreground border-border",
    unknown: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${map[v] ?? map.unknown}`}>{v}</span>
  );
}

function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "—";
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}