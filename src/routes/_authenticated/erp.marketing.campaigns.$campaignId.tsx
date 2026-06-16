import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCampaignDetail } from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns/$campaignId")({
  component: CampaignDetailPage,
});

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

function fmtMoney(n: number) {
  return `BDT ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtNum(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const [rangeKey, setRangeKey] = useState("30d");
  const { from, to } = useMemo(() => {
    const days = RANGES[rangeKey] ?? 30;
    const today = new Date();
    return { from: format(subDays(today, days - 1), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  }, [rangeKey]);

  const fn = useServerFn(getCampaignDetail);
  const q = useQuery({
    queryKey: ["mkt", "campaign-detail", campaignId, from, to],
    queryFn: () => fn({ data: { campaignId, from, to } }),
  });

  if (q.isLoading) {
    return <div className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…</div>;
  }
  if (q.isError || !q.data) {
    return <div className="py-10 text-center text-sm text-red-600">{(q.error as any)?.message ?? "Campaign load failed"}</div>;
  }
  const d = q.data;
  const c: any = d.campaign;
  const t: any = d.totals;
  const maxSpend = Math.max(...d.series.map((s) => s.spend), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/erp/marketing/campaigns"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Campaigns</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{c.mkt_ad_accounts?.name}</Badge>
            <Badge variant="outline">{c.objective ?? "—"}</Badge>
            <Badge>{c.effective_status ?? c.status ?? "—"}</Badge>
            <span className="font-mono text-xs">{c.external_id}</span>
          </div>
        </div>
        <Select value={rangeKey} onValueChange={setRangeKey}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Spend" value={fmtMoney(t.spend)} />
        <Kpi label="Meta Purchases" value={fmtNum(t.meta_purchases)} hint={`Rev ${fmtMoney(t.meta_purchase_value)}`} />
        <Kpi label="Confirmed Orders" value={fmtNum(t.confirmed_orders)} hint={`Rev ${fmtMoney(t.confirmed_revenue)}`} />
        <Kpi label="Delivered Orders" value={fmtNum(t.delivered_orders)} hint={`Rev ${fmtMoney(t.delivered_revenue)} · Ret ${t.return_orders}`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Daily Spend</CardTitle></CardHeader>
        <CardContent>
          {d.series.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No insight data in this range.</div>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {d.series.map((s) => (
                <div key={s.date} className="flex-1 flex flex-col items-center gap-1" title={`${s.date} · ${fmtMoney(s.spend)}`}>
                  <div className="w-full bg-primary/80 rounded-t" style={{ height: `${Math.max(2, (s.spend / maxSpend) * 100)}%` }} />
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-2 flex justify-between">
            <span>{d.from}</span><span>{d.to}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Adsets ({d.adsets.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {d.adsets.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No adsets synced.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Meta Pur.</TableHead>
                  <TableHead className="text-right">Meta Rev.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.adsets.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell><Badge variant="outline">{a.effective_status ?? a.status ?? "—"}</Badge></TableCell>
                    <TableCell className="text-right">{fmtMoney(a.spend)}</TableCell>
                    <TableCell className="text-right">{fmtNum(a.impressions)}</TableCell>
                    <TableCell className="text-right">{fmtNum(a.clicks)}</TableCell>
                    <TableCell className="text-right">{fmtNum(a.meta_purchases)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(a.meta_purchase_value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
