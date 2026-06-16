import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Truck } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { courierCampaignReport } from "@/lib/erp/marketing/reports.functions";
import { RangePicker, defaultRange, fmtMoney, fmtNum, fmtPct } from "@/components/erp/marketing/range-picker";

export const Route = createFileRoute("/_authenticated/erp/marketing/reports/couriers")({
  head: () => ({ meta: [{ title: "Courier × Campaign — Marketing" }] }),
  component: CourierCampaignReport,
});

function CourierCampaignReport() {
  const { activeBrand } = useBrand();
  const fn = useServerFn(courierCampaignReport);
  const [range, setRange] = useState(defaultRange(14));

  const q = useQuery({
    queryKey: ["mkt-cour-rep", activeBrand?.id, range.from, range.to],
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
          <Truck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Courier × Campaign</h1>
            <p className="text-xs text-muted-foreground">Delivery & return rate per courier per campaign.</p>
          </div>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <Card>
        <CardContent className="pt-4">
          {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {q.data && q.data.length === 0 && <div className="text-sm text-muted-foreground">Data nai.</div>}
          {q.data && q.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b">
                  <tr className="text-left">
                    <th className="py-1.5 pr-2">Courier</th>
                    <th className="pr-2">Campaign</th>
                    <th className="pr-2 text-right">Orders</th>
                    <th className="pr-2 text-right">Delivered</th>
                    <th className="pr-2 text-right">Returned</th>
                    <th className="pr-2 text-right">Deliv %</th>
                    <th className="pr-2 text-right">Return %</th>
                    <th className="pr-2 text-right">Net Rev</th>
                    <th className="pr-2 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((r: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-2 capitalize">{r.courier_provider}</td>
                      <td className="pr-2 max-w-[220px] truncate">
                        {r.campaign_id ? (
                          <Link to="/erp/marketing/campaigns/$campaignId" params={{ campaignId: r.campaign_id }} className="text-primary hover:underline">
                            {r.campaign_name ?? r.campaign_id.slice(0, 8)}
                          </Link>
                        ) : <span className="text-muted-foreground">(unattributed)</span>}
                      </td>
                      <td className="pr-2 text-right">{fmtNum(r.total_orders)}</td>
                      <td className="pr-2 text-right">{fmtNum(r.delivered_orders)}</td>
                      <td className="pr-2 text-right">{fmtNum(r.returned_orders)}</td>
                      <td className="pr-2 text-right">{fmtPct(r.delivery_rate)}</td>
                      <td className="pr-2 text-right">{fmtPct(r.return_rate)}</td>
                      <td className="pr-2 text-right">{fmtMoney(r.net_revenue)}</td>
                      <td className={`pr-2 text-right ${Number(r.net_profit) < 0 ? "text-destructive" : ""}`}>
                        {fmtMoney(r.net_profit)}
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