import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wifi, CheckCircle2, XCircle } from "lucide-react";
import {
  saveMetaAccountManual, testMetaAccountCreds, getAdAccountDetail,
} from "@/lib/erp/marketing/marketing.functions";

export type MetaAccountDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string | null;
  /** When set, dialog opens in edit mode and loads existing values. */
  adAccountId?: string | null;
};

export function MetaAccountDialog({ open, onOpenChange, brandId, adAccountId }: MetaAccountDialogProps) {
  const qc = useQueryClient();
  const isEdit = !!adAccountId;

  const [accountName, setAccountName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [usdToBdt, setUsdToBdt] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [testResult, setTestResult] = useState<null | { ok: boolean; message: string }>(null);

  const detailFn = useServerFn(getAdAccountDetail);
  const saveFn = useServerFn(saveMetaAccountManual);
  const testFn = useServerFn(testMetaAccountCreds);

  const detailQ = useQuery({
    queryKey: ["meta-account-detail", adAccountId],
    queryFn: () => detailFn({ data: { adAccountId: adAccountId! } }),
    enabled: open && isEdit,
  });

  // Hydrate form when edit dialog opens
  useEffect(() => {
    if (!open) return;
    if (isEdit && detailQ.data) {
      const d = detailQ.data;
      setAccountName(d.account_name ?? "");
      setExternalAccountId(d.external_account_id ?? "");
      setAppId(d.app_id ?? "");
      setAppSecret(d.app_secret_masked ?? "");
      setAccessToken(d.access_token_masked ?? "");
      setUsdToBdt(d.usd_to_bdt != null ? String(d.usd_to_bdt) : "");
      setIsActive(!!d.is_active);
      setTestResult(null);
    } else if (!isEdit) {
      setAccountName(""); setAppId(""); setAppSecret(""); setAccessToken("");
      setExternalAccountId(""); setUsdToBdt(""); setIsActive(true); setTestResult(null);
    }
  }, [open, isEdit, detailQ.data]);

  const tokenChanged = !accessToken.startsWith("•") && accessToken.trim().length > 0;
  const secretChanged = !appSecret.startsWith("•") && appSecret.trim().length > 0;

  const testMut = useMutation({
    mutationFn: () => testFn({
      data: {
        externalAccountId: externalAccountId.replace(/\D/g, ""),
        accessToken: tokenChanged ? accessToken.trim() : "",
      },
    }),
    onMutate: () => setTestResult(null),
    onSuccess: (r) => {
      if (r.ok) {
        setTestResult({ ok: true, message: `${r.account.name ?? "Connected"} · ${r.account.currency ?? ""}` });
      } else {
        setTestResult({ ok: false, message: r.error });
      }
    },
    onError: (e) => setTestResult({ ok: false, message: (e as Error).message }),
  });

  const saveMut = useMutation({
    mutationFn: () => saveFn({
      data: {
        id: adAccountId ?? null,
        brandId: brandId!,
        accountName: accountName.trim(),
        externalAccountId: externalAccountId.replace(/\D/g, ""),
        appId: appId.trim() || null,
        appSecret: secretChanged ? appSecret.trim() : null,
        accessToken: tokenChanged ? accessToken.trim() : null,
        usdToBdt: usdToBdt ? Number(usdToBdt) : null,
        isActive,
      },
    }),
    onSuccess: () => {
      toast.success(isEdit ? "Account updated" : "Meta account connected");
      qc.invalidateQueries({ queryKey: ["marketing-accounts"] });
      qc.invalidateQueries({ queryKey: ["meta-integration-status"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canTest = externalAccountId.replace(/\D/g, "").length > 0 && tokenChanged;
  const canSave = !!brandId && accountName.trim().length > 0 && externalAccountId.replace(/\D/g, "").length > 0
    && (isEdit ? true : tokenChanged); // new account must include token

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Meta Ads Account" : "Connect Meta Ads Account"}</DialogTitle>
          <DialogDescription>
            Enter your Meta Ads API credentials to track ad expenses
          </DialogDescription>
        </DialogHeader>

        {isEdit && detailQ.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Account Name</Label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. Ecomdrive_SS" />
              <p className="text-xs text-muted-foreground">A friendly name to identify this account</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>App ID</Label>
                <Input
                  inputMode="numeric"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value.replace(/\D/g, ""))}
                  placeholder="1234567890123456"
                />
                <p className="text-xs text-muted-foreground">Your Meta App ID</p>
              </div>
              <div className="space-y-1.5">
                <Label>App Secret</Label>
                <Input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={isEdit ? "leave blank to keep existing" : "32-char secret"}
                />
                <p className="text-xs text-muted-foreground">Your Meta App Secret</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Access Token</Label>
              <Input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={isEdit ? "leave blank to keep existing" : "EAAxxxx…"}
              />
              <p className="text-xs text-muted-foreground">Long-lived System User Access Token</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ad Account ID</Label>
                <Input
                  inputMode="numeric"
                  value={externalAccountId}
                  onChange={(e) => setExternalAccountId(e.target.value.replace(/\D/g, ""))}
                  placeholder="719581961171714"
                />
                <p className="text-xs text-muted-foreground">Without the "act_" prefix</p>
              </div>
              <div className="space-y-1.5">
                <Label>USD to BDT Rate</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={usdToBdt}
                  onChange={(e) => setUsdToBdt(e.target.value)}
                  placeholder="132"
                />
                <p className="text-xs text-muted-foreground">Current conversion rate</p>
              </div>
            </div>

            <Card>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">Active Status</div>
                  <div className="text-xs text-muted-foreground">Enable or disable this account</div>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Connection Status</div>
                  <div className="text-xs text-muted-foreground">Test your credentials before saving</div>
                  {testResult && (
                    <div className={"text-xs mt-1 flex items-center gap-1 " + (testResult.ok ? "text-green-600" : "text-destructive")}>
                      {testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {testResult.message}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => testMut.mutate()}
                  disabled={!canTest || testMut.isPending}
                >
                  {testMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wifi className="h-4 w-4 mr-1" />}
                  Test Connection
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isEdit ? "Update" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
