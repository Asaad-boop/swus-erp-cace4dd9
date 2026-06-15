import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/brand-context";
import { listAdAccounts, syncMetaCampaigns } from "@/lib/erp/marketing/marketing.functions";
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

  const q = useQuery({
    queryKey: ["marketing-accounts", activeBrand?.id],
    queryFn: () => fetchList({ data: { brandId: activeBrand!.id } }),
    enabled: !!activeBrand?.id,
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Connected Ad Accounts</h2>
          <p className="text-sm text-muted-foreground">Meta, Google, TikTok account integrations</p>
        </div>
        <Button onClick={() => setConnectOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Connect Meta
        </Button>
      </div>

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
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{a.marketing_platforms?.name ?? "Platform"}</Badge>
                  <span className="font-semibold truncate">{a.account_name || `Account ${a.external_account_id}`}</span>
                  {a.is_active ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ID: {a.external_account_id} · {a.currency || "—"} ·
                  Last sync: {a.last_synced_at ? new Date(a.last_synced_at).toLocaleString() : "never"}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={syncMut.isPending}
                onClick={() => syncMut.mutate(a.id)}
              >
                <RefreshCw className={"h-4 w-4 mr-1 " + (syncMut.isPending ? "animate-spin" : "")} />
                Sync
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConnectMetaDialog open={connectOpen} onOpenChange={setConnectOpen} brandId={activeBrand?.id ?? null} />
    </div>
  );
}