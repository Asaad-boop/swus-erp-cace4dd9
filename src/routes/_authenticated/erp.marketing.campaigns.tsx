import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Megaphone } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { listCampaigns } from "@/lib/erp/marketing/reports.functions";
import { RangePicker, defaultRange, fmtMoney, fmtNum, fmtX } from "@/components/erp/marketing/range-picker";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Marketing" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const { activeBrand } = useBrand();
  const fn = useServerFn(listCampaigns);
  const [range, setRange] = useState(defaultRange(14));

  const q = useQuery({
    queryKey: ["mkt-campaigns", activeBrand?.id, range.from, range.to],
    queryFn: () => fn({ data: { brand_id: activeBrand!.id, ...range } }),
    enabled: !!activeBrand,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link to="/erp/marketing"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Campaigns</h1>
            <p className="text-xs text-muted-foreground">Spend, attribution, real ROAS / POAS — campaign level.</p>
          </div>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">All campaigns</CardTitle></CardHeader>
        <CardContent>
          {!activeBrand && <div className="text-sm text-muted-foreground">Select a brand.</div>}
          {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {q.data && q.data.length === 0 && (
            <div className="text-sm text-muted-foreground">Ei range e kono campaign nai.</div>
          )}
          {q.data && q.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b">
                  <tr className="text-left">
                    <th className="py-1.5 pr-2">Campaign</th>
                    <th className="pr-2">Status</th>
                    <th className="pr-2 text-right">Spend</th>
                    <th className="pr-2 text-right">Impr</th>
                    <th className="pr-2 text-right">Clicks</th>
                    <th className="pr-2 text-right">Orders</th>
                    <th className="pr-2 text-right">Deliv</th>
                    <th className="pr-2 text-right">Net Rev</th>
                    <th className="pr-2 text-right">Net Profit</th>
                    <th className="pr-2 text-right">ROAS</th>
                    <th className="pr-2 text-right">POAS</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((r: any) => (
                    <tr key={r.campaign_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-2 max-w-[280px] truncate">
                        <Link
                          to="/erp/marketing/campaigns/$campaignId"
                          params={{ campaignId: r.campaign_id }}
                          className="text-primary hover:underline"
                        >
                          {r.name ?? r.external_campaign_id}
                        </Link>
                        {r.objective && <span className="ml-1 text-[10px] text-muted-foreground">· {r.objective}</span>}
                      </td>
                      <td className="pr-2">
                        <Badge variant={r.effective_status === "ACTIVE" ? "default" : "outline"} className="text-[10px]">
                          {r.effective_status ?? r.status ?? "—"}
                        </Badge>
                      </td>
                      <td className="pr-2 text-right">{fmtMoney(r.ad_spend)}</td>
                      <td className="pr-2 text-right">{fmtNum(r.impressions)}</td>
                      <td className="pr-2 text-right">{fmtNum(r.clicks)}</td>
                      <td className="pr-2 text-right">{r.orders_attributed}</td>
                      <td className="pr-2 text-right">{r.delivered_orders}</td>
                      <td className="pr-2 text-right">{fmtMoney(r.net_revenue)}</td>
                      <td className={`pr-2 text-right ${Number(r.net_profit) < 0 ? "text-destructive" : ""}`}>
                        {fmtMoney(r.net_profit)}
                      </td>
                      <td className="pr-2 text-right">{fmtX(r.real_roas)}</td>
                      <td className="pr-2 text-right">{fmtX(r.poas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}