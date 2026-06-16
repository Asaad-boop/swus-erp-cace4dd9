import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { getAdsetRow, listAds } from "@/lib/erp/marketing/reports.functions";
import { RangePicker, defaultRange, fmtMoney, fmtNum, fmtX } from "@/components/erp/marketing/range-picker";

export const Route = createFileRoute("/_authenticated/erp/marketing/adsets/$adsetId")({
  head: () => ({ meta: [{ title: "Adset detail — Marketing" }] }),
  component: AdsetDetail,
});

function AdsetDetail() {
  const { adsetId } = Route.useParams();
  const { activeBrand } = useBrand();
  const fnRow = useServerFn(getAdsetRow);
  const fnAds = useServerFn(listAds);
  const [range, setRange] = useState(defaultRange(14));

  const rowQ = useQuery({
    queryKey: ["mkt-adset", adsetId],
    queryFn: () => fnRow({ data: { adset_id: adsetId } }),
  });
  const adsQ = useQuery({
    queryKey: ["mkt-ads", activeBrand?.id, adsetId, range.from, range.to],
    queryFn: () => fnAds({ data: { brand_id: activeBrand!.id, adset_id: adsetId, ...range } }),
    enabled: !!activeBrand,
  });

  const a: any = rowQ.data ?? {};

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link
              to="/erp/marketing/campaigns/$campaignId"
              params={{ campaignId: a.campaign_id ?? "" }}
            ><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">{a.name ?? a.external_adset_id ?? "Adset"}</h1>
            <p className="text-xs text-muted-foreground">
              {a.optimization_goal ?? "—"} · <Badge variant="outline" className="text-[10px]">{a.effective_status ?? a.status ?? "—"}</Badge>
              {(a.daily_budget || a.lifetime_budget) && (
                <> · Budget {fmtMoney(a.daily_budget ?? a.lifetime_budget)}</>
              )}
            </p>
          </div>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ads</CardTitle></CardHeader>
        <CardContent>
          {adsQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {adsQ.data && adsQ.data.length === 0 && (
            <div className="text-sm text-muted-foreground">Kono ad nai.</div>
          )}
          {adsQ.data && adsQ.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b">
                  <tr className="text-left">
                    <th className="py-1.5 pr-2 w-12"></th>
                    <th className="pr-2">Ad</th>
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {adsQ.data.map((r: any) => (
                    <tr key={r.ad_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-2">
                        {r.thumbnail_url ? (
                          <img src={r.thumbnail_url} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted" />
                        )}
                      </td>
                      <td className="pr-2 max-w-[260px] truncate">
                        <div className="truncate">{r.name ?? r.external_ad_id}</div>
                        {r.creative_name && <div className="text-[10px] text-muted-foreground truncate">{r.creative_name}</div>}
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
                      <td>
                        {r.preview_url && (
                          <a href={r.preview_url} target="_blank" rel="noreferrer" className="text-primary">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
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