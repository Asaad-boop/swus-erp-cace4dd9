import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { getCampaignSummary, listAdsets } from "@/lib/erp/marketing/reports.functions";
import { RangePicker, defaultRange, fmtMoney, fmtNum, fmtX } from "@/components/erp/marketing/range-picker";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns/$campaignId")({
  head: () => ({ meta: [{ title: "Campaign detail — Marketing" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { campaignId } = Route.useParams();
  const { activeBrand } = useBrand();
  const fnSum = useServerFn(getCampaignSummary);
  const fnAdsets = useServerFn(listAdsets);
  const [range, setRange] = useState(defaultRange(14));

  const sumQ = useQuery({
    queryKey: ["mkt-camp-sum", activeBrand?.id, campaignId, range.from, range.to],
    queryFn: () => fnSum({ data: { brand_id: activeBrand!.id, campaign_id: campaignId, ...range } }),
    enabled: !!activeBrand,
  });
  const adsetsQ = useQuery({
    queryKey: ["mkt-adsets", activeBrand?.id, campaignId, range.from, range.to],
    queryFn: () => fnAdsets({ data: { brand_id: activeBrand!.id, campaign_id: campaignId, ...range } }),
    enabled: !!activeBrand,
  });

  const s: any = sumQ.data ?? {};
  const c = s.campaign ?? {};
  const roas = s.ad_spend > 0 ? Number(s.net_revenue) / Number(s.ad_spend) : null;
  const poas = s.ad_spend > 0 ? Number(s.net_profit) / Number(s.ad_spend) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link to="/erp/marketing/campaigns"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">{c.name ?? c.external_campaign_id ?? "Campaign"}</h1>
            <p className="text-xs text-muted-foreground">
              {c.objective ?? "—"} · <Badge variant="outline" className="text-[10px]">{c.effective_status ?? c.status ?? "—"}</Badge>
            </p>
          </div>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Ad Spend" value={fmtMoney(s.ad_spend)} />
        <Stat label="Net Revenue" value={fmtMoney(s.net_revenue)} />
        <Stat label="Net Profit" value={fmtMoney(s.net_profit)} bad={Number(s.net_profit) < 0} />
        <Stat label="ROAS" value={fmtX(roas)} />
        <Stat label="POAS" value={fmtX(poas)} bad={poas != null && poas < 1} />
        <Stat label="Impressions" value={fmtNum(s.impressions)} />
        <Stat label="Clicks" value={fmtNum(s.clicks)} />
        <Stat label="Orders attributed" value={fmtNum(s.orders_attributed)} />
        <Stat label="Delivered" value={fmtNum(s.delivered_orders)} />
        <Stat label="Returned" value={fmtNum(s.returned_orders)} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Adsets</CardTitle></CardHeader>
        <CardContent>
          {adsetsQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {adsetsQ.data && adsetsQ.data.length === 0 && (
            <div className="text-sm text-muted-foreground">Kono adset nai.</div>
          )}
          {adsetsQ.data && adsetsQ.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b">
                  <tr className="text-left">
                    <th className="py-1.5 pr-2">Adset</th>
                    <th className="pr-2">Status</th>
                    <th className="pr-2 text-right">Budget</th>
                    <th className="pr-2 text-right">Spend</th>
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
                  {adsetsQ.data.map((r: any) => (
                    <tr key={r.adset_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-2 max-w-[260px] truncate">
                        <Link to="/erp/marketing/adsets/$adsetId" params={{ adsetId: r.adset_id }} className="text-primary hover:underline">
                          {r.name ?? r.external_adset_id}
                        </Link>
                      </td>
                      <td className="pr-2">
                        <Badge variant={r.effective_status === "ACTIVE" ? "default" : "outline"} className="text-[10px]">
                          {r.effective_status ?? r.status ?? "—"}
                        </Badge>
                      </td>
                      <td className="pr-2 text-right">{fmtMoney(r.daily_budget ?? r.lifetime_budget)}</td>
                      <td className="pr-2 text-right">{fmtMoney(r.ad_spend)}</td>
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

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold ${bad ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}