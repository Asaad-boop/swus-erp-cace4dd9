import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DollarSign, TrendingUp, Target, Megaphone, AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { useBrand } from "@/contexts/brand-context";
import { getMarketingDashboard, listCampaigns } from "@/lib/erp/marketing/marketing.functions";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  component: MarketingDashboard,
});

const RANGES = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

function rangeDates(days: number) {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

function MarketingDashboard() {
  const { activeBrand } = useBrand();
  const [rangeId, setRangeId] = useState<RangeId>("30d");
  const days = RANGES.find((r) => r.id === rangeId)!.days;
  const range = useMemo(() => rangeDates(days), [days]);

  const fetchDash = useServerFn(getMarketingDashboard);
  const fetchCampaigns = useServerFn(listCampaigns);

  const q = useQuery({
    queryKey: ["marketing-dashboard", activeBrand?.id, range.since, range.until],
    queryFn: () => fetchDash({ data: { brandId: activeBrand!.id, since: range.since, until: range.until } }),
    enabled: !!activeBrand?.id,
  });

  const campQ = useQuery({
    queryKey: ["marketing-campaigns", activeBrand?.id, range.since, range.until],
    queryFn: () => fetchCampaigns({ data: { brandId: activeBrand!.id, since: range.since, until: range.until } }),
    enabled: !!activeBrand?.id,
  });

  const d = q.data;

  const chartData = useMemo(() => {
    return (d?.daily ?? []).map((x) => ({
      date: x.date.slice(5),
      Spend: Number(x.spend.toFixed(0)),
      "Meta Revenue": Number(x.meta_revenue.toFixed(0)),
    }));
  }, [d]);

  const topCampaigns = useMemo(() => {
    return [...(campQ.data?.campaigns ?? [])]
      .filter((c) => (c.spend ?? 0) > 0)
      .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
      .slice(0, 5);
  }, [campQ.data]);

  const errMsg = q.error ? (q.error as Error).message : null;
  const isMissingEnv = errMsg?.includes("Missing Supabase environment");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeId(r.id)}
              className={cn(
                "px-3 py-1 text-xs rounded-md border transition-colors",
                rangeId === r.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {range.since} → {range.until}
        </div>
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {errMsg && (
        <Card className={cn(
          isMissingEnv
            ? "border-yellow-500/40 bg-yellow-500/5"
            : "border-destructive/40 bg-destructive/10",
        )}>
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <AlertCircle className={cn(
              "h-4 w-4 mt-0.5",
              isMissingEnv ? "text-yellow-600" : "text-destructive",
            )} />
            <div className="flex-1">
              <div className="font-medium">
                {isMissingEnv ? "Backend configuration incomplete" : "Dashboard load korte parlam na"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 break-words">{errMsg}</div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/erp/marketing/settings">
                <SettingsIcon className="h-3.5 w-3.5 mr-1" />
                Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={<DollarSign className="h-4 w-4" />} label="Total Spend" value={fmtBdt(d.total_spend)} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Meta Revenue" value={fmtBdt(d.total_meta_revenue)} hint={d.meta_roas != null ? `ROAS ${d.meta_roas.toFixed(2)}x` : "—"} />
            <Kpi icon={<Target className="h-4 w-4" />} label="Actual Revenue (est.)" value={fmtBdt(d.actual_revenue)} hint={d.actual_roas != null ? `ROAS ${d.actual_roas.toFixed(2)}x` : "—"} />
            <Kpi icon={<Megaphone className="h-4 w-4" />} label="Active Campaigns" value={String(d.active_campaigns)} hint={`of ${d.total_campaigns}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spend vs Meta Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  No insight data yet. Connect a Meta ad account and sync campaigns.
                </div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                      <Legend />
                      <Line type="monotone" dataKey="Spend" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Meta Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {topCampaigns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top campaigns by spend</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Meta ROAS</TableHead>
                      <TableHead className="text-right">Actual ROAS</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topCampaigns.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>
                            {c.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtBdt(c.spend)}</TableCell>
                        <TableCell className="text-right">
                          {c.meta_roas != null ? `${c.meta_roas.toFixed(2)}x` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.actual_roas != null ? (
                            <span className={c.actual_roas >= 1 ? "text-green-600 font-medium" : "text-yellow-600"}>
                              {c.actual_roas.toFixed(2)}x
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/erp/marketing/campaigns/$campaignId"
                            params={{ campaignId: c.id }}
                            className="text-primary hover:underline text-sm"
                          >
                            View →
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon}{label}</div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}