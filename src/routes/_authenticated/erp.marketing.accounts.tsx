import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, AlertCircle, CheckCircle2, BarChart3, Power, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/brand-context";
import {
  listAdAccounts, syncMetaCampaigns, syncMetaInsights,
  setAdAccountActive, getMetaIntegrationStatus,
} from "@/lib/erp/marketing/marketing.functions";
import { ConnectMetaDialog } from "@/components/erp/marketing/connect-meta-dialog";

export const Route = createFileRoute("/_authenticated/erp/marketing/accounts")({
  component: AccountsPage,
});

function AccountsPage() {
  const { activeBrand } = useBrand();
  const qc = useQueryClient();
  const [connectOpen, setConnectOpen] = useState(false);

  const fetchList = useServerFn(listAdAccounts);
  const sync = useServerFn(syncMetaCampaigns);
  const syncIns = useServerFn(syncMetaInsights);
  const setActive = useServerFn(setAdAccountActive);
  const fetchStatus = useServerFn(getMetaIntegrationStatus);

  const q = useQuery({
    queryKey: ["marketing-accounts", activeBrand?.id],
    queryFn: () => fetchList({ data: { brandId: activeBrand!.id } }),
    enabled: !!activeBrand?.id,
  });

  const statusQ = useQuery({
    queryKey: ["meta-integration-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
  });

  const syncMut = useMutation({
    mutationFn: (adAccountId: string) => sync({ data: { adAccountId } }),
    onSuccess: (r) => {
      toast.success(`${r.synced} campaigns synced`);
      qc.invalidateQueries({ queryKey: ["marketing-accounts"] });
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const insightsMut = useMutation({
    mutationFn: (adAccountId: string) => syncIns({ data: { adAccountId, days: 7 } }),
    onSuccess: (r) => {
      toast.success(`${r.insights} insight rows · ${r.expenses} expense entries · ${r.campaigns} campaigns`);
      qc.invalidateQueries({ queryKey: ["marketing-accounts"] });
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketing-dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleMut = useMutation({
    mutationFn: (p: { id: string; isActive: boolean }) =>
      setActive({ data: { adAccountId: p.id, isActive: p.isActive } }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["marketing-accounts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const tokenMissing = statusQ.data && !statusQ.data.tokenSet;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Connected Ad Accounts</h2>
          <p className="text-sm text-muted-foreground">Meta, Google, TikTok account integrations</p>
        </div>
        <Button onClick={() => setConnectOpen(true)} disabled={!!tokenMissing}>
          <Plus className="h-4 w-4 mr-1" /> Connect Meta
        </Button>
      </div>

      {tokenMissing && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">Meta token configure kora nai</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Settings page e giye token setup guide follow koro.
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/erp/marketing/settings">
                <SettingsIcon className="h-3.5 w-3.5 mr-1" />
                Open settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {q.data?.accounts.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Kono ad account connected nai. "Connect Meta" click koro shuru korte.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {(q.data?.accounts ?? []).map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{a.marketing_platforms?.name ?? "Platform"}</Badge>
                  <span className="font-semibold truncate">{a.account_name || `Account ${a.external_account_id}`}</span>
                  {a.is_active ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Badge variant="outline" className="text-xs">Disabled</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ID: {a.external_account_id} · {a.currency || "—"} ·
                  Last sync: {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : "never"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncMut.isPending || !a.is_active}
                  onClick={() => syncMut.mutate(a.id)}
                  title="Pull campaigns metadata"
                >
                  <RefreshCw className={"h-4 w-4 mr-1 " + (syncMut.isPending ? "animate-spin" : "")} />
                  Sync campaigns
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={insightsMut.isPending || !a.is_active}
                  onClick={() => insightsMut.mutate(a.id)}
                  title="Pull last 7 days insights & spend"
                >
                  <BarChart3 className={"h-4 w-4 mr-1 " + (insightsMut.isPending ? "animate-spin" : "")} />
                  Sync insights (7d)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={toggleMut.isPending}
                  onClick={() => toggleMut.mutate({ id: a.id, isActive: !a.is_active })}
                >
                  <Power className="h-4 w-4 mr-1" />
                  {a.is_active ? "Disable" : "Enable"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConnectMetaDialog open={connectOpen} onOpenChange={setConnectOpen} brandId={activeBrand?.id ?? null} />
    </div>
  );
}