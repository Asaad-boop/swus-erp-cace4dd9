import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { useBrand } from "@/contexts/brand-context";
import { getCampaignDetail } from "@/lib/erp/marketing/marketing.functions";
import { fmtBdt } from "@/lib/erp/finance";
import { CampaignProductMapping } from "@/components/erp/marketing/campaign-product-mapping";
import { AdProductLinkPanel } from "@/components/erp/marketing/ad-product-link-panel";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns/$campaignId")({
  component: CampaignDetailPage,
});

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const { activeBrand } = useBrand();
  const fetchDetail = useServerFn(getCampaignDetail);

  const q = useQuery({
    queryKey: ["marketing-campaign", campaignId],
    queryFn: () => fetchDetail({ data: { campaignId } }),
    enabled: !!campaignId,
  });

  const d = q.data;
  const totalSpend = (d?.insights ?? []).reduce((s: number, i: any) => s + Number(i.spend || 0), 0);
  const totalPv = (d?.insights ?? []).reduce((s: number, i: any) => s + Number(i.purchase_value || 0), 0);
  const metaRoas = totalSpend > 0 ? totalPv / totalSpend : null;

  const chartData = (d?.insights ?? []).map((i: any) => ({
    date: String(i.date).slice(5),
    Spend: Number(Number(i.spend).toFixed(0)),
    "Meta Revenue": Number(Number(i.purchase_value).toFixed(0)),
  }));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link to="/erp/marketing/campaigns" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to campaigns
      </Link>

      {q.isLoading && <div className="text-sm">Loading…</div>}
      {q.error && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}
      {d && (
        <>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{d.campaign.name}</h2>
              <Badge variant={d.campaign.status === "ACTIVE" ? "default" : "secondary"}>{d.campaign.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {d.campaign.objective} · {(d.campaign as any).marketing_ad_accounts?.account_name} · External ID: {d.campaign.external_campaign_id}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiBox label="Spend" value={fmtBdt(totalSpend)} />
            <KpiBox label="Meta Revenue" value={fmtBdt(totalPv)} />
            <KpiBox label="Meta ROAS" value={metaRoas != null ? `${metaRoas.toFixed(2)}x` : "—"} />
            <KpiBox label="Days" value={String(d.insights.length)} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Daily Spend vs Meta Revenue</CardTitle></CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">No insights yet.</div>
              ) : (
                <div className="h-64">
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

          <CampaignProductMapping
            campaignId={campaignId}
            brandId={activeBrand?.id ?? null}
            initial={d.mappings as any}
          />

          <AdProductLinkPanel campaignId={campaignId} brandId={activeBrand?.id ?? null} />

          <Card>
            <CardHeader><CardTitle className="text-base">Daily insights</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Meta Revenue</TableHead>
                    <TableHead className="text-right">Meta ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.insights.map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.date}</TableCell>
                      <TableCell className="text-right">{fmtBdt(Number(i.spend))}</TableCell>
                      <TableCell className="text-right">{Number(i.impressions).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(i.clicks).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{i.purchases}</TableCell>
                      <TableCell className="text-right">{fmtBdt(Number(i.purchase_value))}</TableCell>
                      <TableCell className="text-right">{i.purchase_roas != null ? `${Number(i.purchase_roas).toFixed(2)}x` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiBox({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tracking-tight mt-1">{value}</div>
    </CardContent></Card>
  );
}