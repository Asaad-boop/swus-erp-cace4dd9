import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/contexts/brand-context";
import { listCampaigns, listAdAccounts } from "@/lib/erp/marketing/marketing.functions";
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
  const fetchAccounts = useServerFn(listAdAccounts);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"spend" | "actual_roas" | "meta_roas" | "name">("spend");

  const q = useQuery({
    queryKey: ["marketing-campaigns", activeBrand?.id],
    queryFn: () => fetchList({ data: { brandId: activeBrand!.id } }),
    enabled: !!activeBrand?.id,
  });

  const accountsQ = useQuery({
    queryKey: ["marketing-accounts", activeBrand?.id],
    queryFn: () => fetchAccounts({ data: { brandId: activeBrand!.id } }),
    enabled: !!activeBrand?.id,
  });

  const allRows = q.data?.campaigns ?? [];

  const rows = useMemo(() => {
    const filtered = allRows.filter((c: any) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (accountFilter !== "all" && c.ad_account_name !== accountFilter) return false;
      return true;
    });
    return [...filtered].sort((a: any, b: any) => {
      if (sortBy === "name") return (a.name ?? "").localeCompare(b.name ?? "");
      const av = Number(a[sortBy] ?? 0);
      const bv = Number(b[sortBy] ?? 0);
      return bv - av;
    });
  }, [allRows, statusFilter, accountFilter, sortBy]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of allRows) if (c.status) set.add(c.status as string);
    return Array.from(set);
  }, [allRows]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <p className="text-sm text-muted-foreground">Last 30 days performance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(accountsQ.data?.accounts ?? []).map((a: any) => (
                <SelectItem key={a.id} value={a.account_name ?? a.external_account_id}>
                  {a.account_name ?? a.external_account_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: typeof sortBy) => setSortBy(v)}>
            <SelectTrigger className="w-[160px] h-9">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spend">Sort: Spend</SelectItem>
              <SelectItem value="actual_roas">Sort: Actual ROAS</SelectItem>
              <SelectItem value="meta_roas">Sort: Meta ROAS</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!q.isLoading && allRows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Kono campaign nai. Ad Accounts tab e giye sync koro.
          </CardContent>
        </Card>
      )}
      {!q.isLoading && allRows.length > 0 && rows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Filter er moddhe kichu match korlo na.
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