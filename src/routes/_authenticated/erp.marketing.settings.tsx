import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/brand-context";
import {
  getMarketingSettings, saveMarketingSettings,
  getMetaIntegrationStatus, getMarketingLookups,
} from "@/lib/erp/marketing/marketing.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/settings")({
  head: () => ({ meta: [{ title: "Marketing Settings — ERP" }] }),
  component: SettingsPage,
});

type FormState = {
  auto_sync_enabled: boolean;
  auto_create_expenses: boolean;
  attribution_mode: "weighted" | "equal_split" | "revenue_proportional";
  default_expense_account_id: string | null;
  default_expense_category_id: string | null;
};

function SettingsPage() {
  const { activeBrand } = useBrand();
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getMarketingSettings);
  const fetchLookups = useServerFn(getMarketingLookups);
  const fetchStatus = useServerFn(getMetaIntegrationStatus);
  const save = useServerFn(saveMarketingSettings);

  const settingsQ = useQuery({
    queryKey: ["marketing-settings", activeBrand?.id],
    queryFn: () => fetchSettings({ data: { brandId: activeBrand!.id } }),
    enabled: !!activeBrand?.id,
  });

  const lookupsQ = useQuery({
    queryKey: ["marketing-lookups", activeBrand?.id],
    queryFn: () => fetchLookups({ data: { brandId: activeBrand!.id } }),
    enabled: !!activeBrand?.id,
  });

  const statusQ = useQuery({
    queryKey: ["meta-integration-status"],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<FormState>({
    auto_sync_enabled: true,
    auto_create_expenses: true,
    attribution_mode: "weighted",
    default_expense_account_id: null,
    default_expense_category_id: null,
  });

  useEffect(() => {
    const s = settingsQ.data?.settings;
    if (s) {
      setForm({
        auto_sync_enabled: s.auto_sync_enabled ?? true,
        auto_create_expenses: s.auto_create_expenses ?? true,
        attribution_mode: (s.attribution_mode as FormState["attribution_mode"]) ?? "weighted",
        default_expense_account_id: s.default_expense_account_id ?? null,
        default_expense_category_id: s.default_expense_category_id ?? null,
      });
    }
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          brandId: activeBrand!.id,
          auto_sync_enabled: form.auto_sync_enabled,
          auto_create_expenses: form.auto_create_expenses,
          attribution_mode: form.attribution_mode,
          default_expense_account_id: form.default_expense_account_id,
          default_expense_category_id: form.default_expense_category_id,
        },
      }),
    onSuccess: () => {
      toast.success("Settings save hoyeche");
      qc.invalidateQueries({ queryKey: ["marketing-settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      <MetaStatusCard
        loading={statusQ.isLoading}
        data={statusQ.data}
        onRefresh={() => statusQ.refetch()}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync Preferences</CardTitle>
          <CardDescription>Auto sync o expense behaviour control koro</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Auto-sync every 30 minutes"
            description="Background cron job campaign + insights pull korbe"
            checked={form.auto_sync_enabled}
            onChange={(v) => setForm((f) => ({ ...f, auto_sync_enabled: v }))}
          />
          <ToggleRow
            label="Auto-create expense entries"
            description="Meta-er daily spend ERP transactions e expense hisebe save hobe"
            checked={form.auto_create_expenses}
            onChange={(v) => setForm((f) => ({ ...f, auto_create_expenses: v }))}
          />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Default expense account</Label>
              <Select
                value={form.default_expense_account_id ?? "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, default_expense_account_id: v === "__none__" ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Account select koro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(lookupsQ.data?.accounts ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} <span className="text-muted-foreground text-xs">({a.account_type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Jei account theke ad spend deduct hobe</p>
            </div>

            <div className="space-y-1.5">
              <Label>Default expense category</Label>
              <Select
                value={form.default_expense_category_id ?? "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, default_expense_category_id: v === "__none__" ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Category select koro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Auto (Marketing — Meta Ads) —</SelectItem>
                  {(lookupsQ.data?.categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Khali rakhle automatic banano hobe</p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Attribution mode</Label>
              <Select
                value={form.attribution_mode}
                onValueChange={(v: FormState["attribution_mode"]) =>
                  setForm((f) => ({ ...f, attribution_mode: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weighted">Weighted (mapping weight onujayi)</SelectItem>
                  <SelectItem value="equal_split">Equal Split (proti product e shoman)</SelectItem>
                  <SelectItem value="revenue_proportional">Revenue Proportional</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Campaign er actual revenue mapped products theke kibhabe distribute hobe
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !activeBrand}>
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Other platforms</CardTitle>
          <CardDescription>Coming soon</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">Google Ads — soon</Badge>
          <Badge variant="secondary">TikTok Ads — soon</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-md border bg-card/50">
      <div className="min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function MetaStatusCard({
  loading, data, onRefresh,
}: {
  loading: boolean;
  data?: { tokenSet: boolean; ok: boolean; error?: string; accountCount?: number };
  onRefresh: () => void;
}) {
  const tokenSet = data?.tokenSet ?? false;
  const ok = data?.ok ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : ok ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          Meta Ads Integration
        </CardTitle>
        <CardDescription>
          {loading
            ? "Checking…"
            : ok
              ? `Connected · ${data?.accountCount ?? 0} ad account(s) accessible`
              : tokenSet
                ? "Token ache kintu Meta call fail korche"
                : "Meta system user token configure kora nai"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && !ok && (
          <div className="text-xs bg-muted/40 border rounded-md p-3 space-y-2">
            {!tokenSet ? (
              <>
                <p className="font-medium text-sm text-foreground">Setup steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>
                    <a
                      href="https://business.facebook.com/settings/system-users"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1"
                    >
                      Meta Business Settings → System Users <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Notun system user banao (or existing ta select koro), role <b>Admin</b></li>
                  <li>Tomar ad account o pixel assign koro `ads_management` + `ads_read` permission diye</li>
                  <li>"Generate New Token" click koro — apps: tomar business app, scopes: <code>ads_read, ads_management, business_management</code></li>
                  <li>Generated token copy kore <code>META_SYSTEM_USER_TOKEN</code> secret e save koro</li>
                </ol>
                <p className="text-muted-foreground pt-1">
                  Secret add korar pore "Refresh" press koro.
                </p>
              </>
            ) : (
              <p className="text-destructive">{data?.error}</p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Refresh status
          </Button>
          {ok && (
            <Button size="sm" asChild>
              <Link to="/erp/marketing/accounts">Connect ad accounts →</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}