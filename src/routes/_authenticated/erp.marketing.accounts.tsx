import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plug, RefreshCw, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

import {
  listAvailableMetaAccounts,
  listConnectedAdAccounts,
  connectAdAccount,
  disconnectAdAccount,
  syncAdAccountStructure,
  syncAdAccountInsights,
} from "@/lib/erp/marketing/meta.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/accounts")({
  component: AdAccountsPage,
});

function statusBadge(status: string | null) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>;
    case "paused":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Paused</Badge>;
    case "error":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Error</Badge>;
    case "disconnected":
      return <Badge variant="secondary">Disconnected</Badge>;
    default:
      return <Badge variant="outline">{status ?? "—"}</Badge>;
  }
}

function fmtAgo(iso: string | null) {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function AdAccountsPage() {
  const qc = useQueryClient();
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;

  const listConnected = useServerFn(listConnectedAdAccounts);
  const listAvailable = useServerFn(listAvailableMetaAccounts);
  const connectFn = useServerFn(connectAdAccount);
  const disconnectFn = useServerFn(disconnectAdAccount);
  const syncStructureFn = useServerFn(syncAdAccountStructure);
  const syncInsightsFn = useServerFn(syncAdAccountInsights);

  const connectedQ = useQuery({
    queryKey: ["mkt", "accounts", brandId],
    queryFn: () => listConnected({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const availableQ = useQuery({
    queryKey: ["mkt", "available-accounts", brandId],
    queryFn: () => listAvailable({ data: { brandId: brandId! } }),
    enabled: pickerOpen && !!brandId,
    staleTime: 30_000,
  });

  const connectMut = useMutation({
    mutationFn: (acc: { externalId: string; name: string; currency: string | null; timezone: string | null; businessId: string | null }) =>
      connectFn({ data: { brandId: brandId!, ...acc } }),
    onSuccess: () => {
      toast.success("Ad account connected");
      qc.invalidateQueries({ queryKey: ["mkt", "accounts", brandId] });
      qc.invalidateQueries({ queryKey: ["mkt", "available-accounts", brandId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Connect failed"),
  });

  const disconnectMut = useMutation({
    mutationFn: (accountId: string) => disconnectFn({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["mkt", "accounts", brandId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Disconnect failed"),
  });

  async function runSync(accountId: string) {
    setBusyId(accountId);
    try {
      const s = await syncStructureFn({ data: { accountId } });
      const i = await syncInsightsFn({ data: { accountId, days: 3 } });
      toast.success(`Synced • structure ${s.rows} • insights ${i.rows}`);
      qc.invalidateQueries({ queryKey: ["mkt", "accounts", brandId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!brandId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Brand select korun toolbar theke.
        </CardContent>
      </Card>
    );
  }

  const accounts = connectedQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meta Ad Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connected Meta ad accounts for <span className="font-medium">{activeBrand?.name}</span>. Sync pulls campaigns, adsets, ads and last 3 days of insights.
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)} className="gap-2">
          <Plug className="h-4 w-4" /> Connect Account
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {connectedQ.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Kono ad account connect kora nei. <span className="font-medium">Connect Account</span> chap diye start korun.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Structure sync</TableHead>
                  <TableHead>Insights sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{a.external_id}</div>
                      {a.last_error ? (
                        <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {a.last_error}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="text-sm">{a.currency ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtAgo(a.last_structure_sync_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtAgo(a.last_insights_sync_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runSync(a.id)}
                          disabled={busyId === a.id}
                          className="gap-1.5"
                        >
                          {busyId === a.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Disconnect ${a.name}?`)) disconnectMut.mutate(a.id);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect a Meta Ad Account</DialogTitle>
            <DialogDescription>
              These are the accounts available under your Meta system user token.
              Pick one to link with <span className="font-medium">{activeBrand?.name}</span>.
            </DialogDescription>
          </DialogHeader>

          {availableQ.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Fetching from Meta…
            </div>
          ) : availableQ.isError ? (
            <div className="py-6 text-sm text-red-600">
              {(availableQ.error as any)?.message ?? "Failed to load Meta accounts. Check META_SYSTEM_USER_TOKEN secret."}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(availableQ.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                        No accounts found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (availableQ.data ?? []).map((a: any) => (
                      <TableRow key={a.external_id}>
                        <TableCell>
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{a.external_id}</div>
                        </TableCell>
                        <TableCell className="text-sm">{a.currency ?? "—"}</TableCell>
                        <TableCell className="text-sm">{a.business ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {a.connected ? (
                            <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              disabled={connectMut.isPending}
                              onClick={() =>
                                connectMut.mutate({
                                  externalId: a.external_id,
                                  name: a.name,
                                  currency: a.currency,
                                  timezone: a.timezone,
                                  businessId: a.business_id,
                                })
                              }
                            >
                              Connect
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
