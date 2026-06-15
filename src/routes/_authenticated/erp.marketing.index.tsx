import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DollarSign, TrendingUp, Target, Megaphone, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrand } from "@/contexts/brand-context";
import { getMarketingDashboard } from "@/lib/erp/marketing/marketing.functions";
import { fmtBdt } from "@/lib/erp/finance";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  component: MarketingDashboard,
});

function MarketingDashboard() {
  const { activeBrand } = useBrand();
  const fetchDash = useServerFn(getMarketingDashboard);

  const q = useQuery({
    queryKey: ["marketing-dashboard", activeBrand?.id],
    queryFn: () => fetchDash({ data: { brandId: activeBrand!.id } }),
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {q.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
          <span>{(q.error as Error).message}</span>
        </div>
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
              <CardTitle className="text-base">Spend vs Meta Revenue · last 30 days</CardTitle>
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