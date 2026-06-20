import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow, format } from "date-fns";
import { Loader2, RefreshCw, Clock, CalendarClock } from "lucide-react";
import { useMemo } from "react";

import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listSyncLog } from "@/lib/erp/marketing/meta.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/sync")({
  component: SyncLogPage,
});

function statusBadge(s: string) {
  if (s === "success") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Success</Badge>;
  if (s === "error") return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Error</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Running</Badge>;
}

function SyncLogPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const list = useServerFn(listSyncLog);

  const q = useQuery({
    queryKey: ["mkt", "sync-log", brandId],
    queryFn: () => list({ data: { brandId: brandId!, limit: 100 } }),
    enabled: !!brandId,
  });

  const lastInsightsSync = useMemo(() => {
    const rows = (q.data ?? []) as any[];
    return rows.find((r) => r.kind === "insights" && r.status === "success") ?? null;
  }, [q.data]);

  const nextAutoSync = useMemo(() => {
    // Cron runs at 06:00 UTC daily (= 12:00 PM Bangladesh time, UTC+6)
    const now = new Date();
    const next = new Date();
    next.setUTCHours(6, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }, [q.data]);

  return (
    <>
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <div className="grid gap-3 md:grid-cols-2 mb-4">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <CalendarClock className="h-5 w-5 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Next auto-sync</div>
              <div className="text-base font-semibold mt-0.5">
                {format(nextAutoSync, "MMM d, h:mm a")} BD time
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Daily 12:00 PM BD (06:00 UTC) · all active ad accounts
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Last successful insights sync</div>
              <div className="text-base font-semibold mt-0.5">
                {lastInsightsSync
                  ? formatDistanceToNow(new Date(lastInsightsSync.started_at), { addSuffix: true })
                  : "Never"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {lastInsightsSync
                  ? `${lastInsightsSync.mkt_ad_accounts?.name ?? "—"} · ${format(new Date(lastInsightsSync.started_at), "MMM d, HH:mm")}`
                  : "Auto-sync run hole eikhane dekhabe"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Sync Log</CardTitle>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…
          </div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Kono sync history nei.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm">{format(new Date(r.started_at), "MMM d, HH:mm")}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.mkt_ad_accounts?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm capitalize">{r.kind}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-right text-sm">{r.rows_processed ?? 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                    {r.error ? <span className="text-red-600">{r.error}</span> : r.meta ? JSON.stringify(r.meta) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      </Card>
    </>
  );
}
