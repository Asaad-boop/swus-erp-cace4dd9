import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { explorerAttribution } from "@/lib/erp/marketing/reports.functions";
import { RangePicker, defaultRange, fmtMoney } from "@/components/erp/marketing/range-picker";

export const Route = createFileRoute("/_authenticated/erp/marketing/attribution")({
  head: () => ({ meta: [{ title: "Attribution Explorer — Marketing" }] }),
  component: AttributionExplorer,
});

function AttributionExplorer() {
  const { activeBrand } = useBrand();
  const fn = useServerFn(explorerAttribution);
  const [range, setRange] = useState(defaultRange(7));
  const [source, setSource] = useState("");

  const q = useQuery({
    queryKey: ["mkt-attrib", activeBrand?.id, range.from, range.to, source],
    queryFn: () =>
      fn({
        data: {
          brand_id: activeBrand!.id,
          ...range,
          ...(source ? { source } : {}),
          limit: 300,
        },
      }),
    enabled: !!activeBrand,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild size="icon" variant="ghost">
            <Link to="/erp/marketing"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Search className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Attribution Explorer</h1>
            <p className="text-xs text-muted-foreground">Per-order: source/campaign + delivery + profit.</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Source</Label>
            <Input className="h-8 w-[140px]" placeholder="meta / direct / …" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Orders ({q.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {q.data && q.data.length === 0 && <div className="text-sm text-muted-foreground">Kichu pawa jay nai.</div>}
          {q.data && q.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b">
                  <tr className="text-left">
                    <th className="py-1.5 pr-2">Date</th>
                    <th className="pr-2">Order</th>
                    <th className="pr-2">Source / Medium</th>
                    <th className="pr-2">Campaign</th>
                    <th className="pr-2">Adset / Ad</th>
                    <th className="pr-2">Status</th>
                    <th className="pr-2 text-right">Net Rev</th>
                    <th className="pr-2 text-right">Net Profit</th>
                    <th className="pr-2 text-right">Ad Spend Alloc</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((r: any) => (
                    <tr key={r.order_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(r.order_created_at).toLocaleString()}</td>
                      <td className="pr-2">
                        <Link to="/orders/$id" params={{ id: r.order_id }} className="text-primary hover:underline">
                          {r.order_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="pr-2">
                        <span>{r.source ?? "—"}</span>
                        {r.medium && <span className="text-muted-foreground"> / {r.medium}</span>}
                      </td>
                      <td className="pr-2 max-w-[200px] truncate">
                        {r.campaign_id ? (
                          <Link to="/erp/marketing/campaigns/$campaignId" params={{ campaignId: r.campaign_id }} className="text-primary hover:underline">
                            {r.campaign_name ?? "—"}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="pr-2 max-w-[200px] truncate text-muted-foreground">
                        {[r.adset_name, r.ad_name].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="pr-2">
                        {r.is_delivered && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">delivered</Badge>}
                        {r.is_returned && <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200">returned</Badge>}
                        {!r.is_delivered && !r.is_returned && <Badge variant="outline" className="text-[10px]">{r.order_status ?? "—"}</Badge>}
                      </td>
                      <td className="pr-2 text-right">{fmtMoney(r.net_sales)}</td>
                      <td className={`pr-2 text-right ${Number(r.net_profit) < 0 ? "text-destructive" : ""}`}>{fmtMoney(r.net_profit)}</td>
                      <td className="pr-2 text-right">{fmtMoney(r.allocated_ad_spend)}</td>
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