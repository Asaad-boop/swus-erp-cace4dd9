import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search } from "lucide-react";
import { connectMetaAccount, metaListMyAccounts } from "@/lib/erp/marketing/marketing.functions";

export function ConnectMetaDialog({
  open, onOpenChange, brandId,
}: { open: boolean; onOpenChange: (v: boolean) => void; brandId: string | null }) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [discovered, setDiscovered] = useState<Array<{ external_account_id: string; name: string; currency?: string }> | null>(null);

  const listFn = useServerFn(metaListMyAccounts);
  const connectFn = useServerFn(connectMetaAccount);

  const discover = useMutation({
    mutationFn: () => listFn(),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.error || "Failed to fetch accounts");
      setDiscovered(r.accounts);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const connect = useMutation({
    mutationFn: (id: string) => connectFn({ data: { brandId: brandId!, externalAccountId: id } }),
    onSuccess: () => {
      toast.success("Meta account connected");
      qc.invalidateQueries({ queryKey: ["marketing-accounts"] });
      onOpenChange(false);
      setAccountId("");
      setDiscovered(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Connect Meta Ad Account</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            META_SYSTEM_USER_TOKEN secret use kore Meta-er sob ad accounts list korbo, ba tumi manually account ID dite paro.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => discover.mutate()} disabled={discover.isPending}>
              {discover.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
              Discover my accounts
            </Button>
          </div>
          {discovered && discovered.length > 0 && (
            <div className="border rounded-md divide-y max-h-56 overflow-auto">
              {discovered.map((a) => (
                <button
                  key={a.external_account_id}
                  type="button"
                  className="w-full text-left p-2 hover:bg-accent flex justify-between items-center"
                  onClick={() => connect.mutate(a.external_account_id)}
                  disabled={connect.isPending || !brandId}
                >
                  <span>
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-muted-foreground block">{a.external_account_id} · {a.currency}</span>
                  </span>
                  <span className="text-xs text-primary">Connect →</span>
                </button>
              ))}
            </div>
          )}
          <div className="pt-2 border-t">
            <Label className="text-xs">Or enter account ID manually (digits only)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 1234567890123456"
              />
              <Button
                onClick={() => connect.mutate(accountId)}
                disabled={!accountId || !brandId || connect.isPending}
              >
                {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}