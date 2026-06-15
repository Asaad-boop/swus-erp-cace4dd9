import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { useBrand } from "@/contexts/brand-context";
import { listCampaigns } from "@/lib/erp/marketing/marketing.functions";
import { fmtBdt } from "@/lib/erp/finance";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns")({
  component: CampaignsPage,
});

function CampaignsPage() {
  const matchRoute = useMatchRoute();
  const isDetail = matchRoute({ to: "/erp/marketing/campaigns/$campaignId" });
  if (isDetail) return <Outlet />;
  return <CampaignsList />;
}

function CampaignsList() {
  const { activeBrand } = useBrand();
  const fetchList = useServerFn(listCampaigns);

  const q = useQuery({
    queryKey: ["marketing-campaigns", activeBrand?.id],
    queryFn: () => fetchList({ data: { brandId: activeBrand!.id } }),
    enabled: !!activeBrand?.id,
  });

  const rows = q.data?.campaigns ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Campaigns</h2>
        <p className="text-sm text-muted-foreground">Last 30 days performance</p>
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!q.isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Kono campaign nai. Ad Accounts tab e giye sync koro.
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Meta ROAS</TableHead>
                  <TableHead className="text-right">Actual ROAS</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.objective ?? "—"} · {c.ad_account_name ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"}>{c.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtBdt(c.spend)}</TableCell>
                    <TableCell className="text-right">{c.meta_roas != null ? `${c.meta_roas.toFixed(2)}x` : "—"}</TableCell>
                    <TableCell className="text-right">
                      {c.actual_roas != null ? (
                        <span className={c.actual_roas >= 1 ? "text-green-600 font-medium" : "text-yellow-600"}>
                          {c.actual_roas.toFixed(2)}x
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{c.mapped_products}</TableCell>
                    <TableCell>
                      <Link to="/erp/marketing/campaigns/$campaignId" params={{ campaignId: c.id }} className="text-primary hover:underline inline-flex items-center gap-1 text-sm">
                        Detail <ExternalLink className="h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}