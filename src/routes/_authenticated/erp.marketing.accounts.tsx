import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
  Pencil,
  AlertCircle,
  MoreVertical,
  Wallet,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  listConnectedAdAccounts,
  createAdAccount,
  updateAdAccount,
  deleteAdAccount,
  toggleAdAccountStatus,
  testAdAccountConnection,
  syncAdAccountStructure,
  syncAdAccountInsights,
  repostMetaSpendToFinance,
} from "@/lib/erp/marketing/meta.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/accounts")({
  component: AdAccountsPage,
});

type AccountRow = {
  id: string;
  name: string;
  external_id: string;
  currency: string | null;
  status: string;
  app_id: string | null;
  usd_to_bdt_rate: number | string;
  business_id: string | null;
  has_access_token: boolean;
  has_app_secret: boolean;
  last_structure_sync_at: string | null;
  last_insights_sync_at: string | null;
  last_error: string | null;
  auto_post_to_finance: boolean;
  finance_wallet_id: string | null;
};

type WalletOption = { id: string; name: string; wallet_type: string };

function useBrandWallets(brandId: string | null) {
  return useQuery({
    queryKey: ["mkt", "wallets", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_accounts")
        .select("id,name,wallet_type")
        .eq("brand_id", brandId!)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WalletOption[];
    },
  });
}

function fmtAgo(iso: string | null) {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function statusPill(status: string) {
  if (status === "active")
    return <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Active</Badge>;
  if (status === "paused")
    return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Paused</Badge>;
  if (status === "error")
    return <Badge className="bg-red-500 text-white hover:bg-red-500">Error</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function AdAccountsPage() {
  const qc = useQueryClient();
  const { brands, brandIds } = useBrand();
  const brandNameMap = useMemo(
    () => new Map(brands.map((b) => [b.id, b.name])),
    [brands],
  );

  const listFn = useServerFn(listConnectedAdAccounts);
  const toggleFn = useServerFn(toggleAdAccountStatus);
  const deleteFn = useServerFn(deleteAdAccount);
  const testFn = useServerFn(testAdAccountConnection);
  const syncStructureFn = useServerFn(syncAdAccountStructure);
  const syncInsightsFn = useServerFn(syncAdAccountInsights);
  const repostFn = useServerFn(repostMetaSpendToFinance);

  const q = useQuery({
    queryKey: ["mkt", "accounts", brandIds.join(",")],
    queryFn: () => listFn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<AccountRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      toggleFn({ data: { accountId: v.id, active: v.active } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt", "accounts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Toggle failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { accountId: id } }),
    onSuccess: () => {
      toast.success("Account removed");
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["mkt", "accounts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  async function testStored(acc: AccountRow) {
    setBusyId(acc.id);
    try {
      const res = await testFn({ data: { accountId: acc.id } });
      toast.success(`Connected • ${res.info.name} • ${res.info.currency}`);
      qc.invalidateQueries({ queryKey: ["mkt", "accounts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Connection failed");
    } finally {
      setBusyId(null);
    }
  }

  async function syncOne(acc: AccountRow) {
    setBusyId(acc.id);
    try {
      const s = await syncStructureFn({ data: { accountId: acc.id } });
      const i = await syncInsightsFn({ data: { accountId: acc.id, days: 90 } });
      const fin = (i as any)?.meta?.finance;
      const finMsg = fin?.total_bdt
        ? ` • finance ৳${Number(fin.total_bdt).toLocaleString("en-BD")}`
        : fin?.wallet_missing
          ? " • wallet set korun"
          : "";
      toast.success(`Synced • structure ${s.rows} • insights ${i.rows}${finMsg}`);
      qc.invalidateQueries({ queryKey: ["mkt", "accounts"] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusyId(null);
    }
  }

  async function repostFinance(acc: AccountRow) {
    const today = new Date();
    const since = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const until = today.toISOString().slice(0, 10);
    setBusyId(acc.id);
    try {
      const res = await repostFn({ data: { accountId: acc.id, since, until } });
      if ((res as any)?.wallet_missing) {
        toast.error("Wallet set korun — edit account → Finance Wallet");
      } else {
        toast.success(
          `Finance e posted • ৳${Number((res as any)?.total_bdt ?? 0).toLocaleString("en-BD")} (FX ${(res as any)?.fx})`,
        );
      }
      qc.invalidateQueries({ queryKey: ["mkt", "accounts"] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Repost failed");
    } finally {
      setBusyId(null);
    }
  }

  const accounts = (q.data ?? []) as AccountRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meta Ads API Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your Meta Ads API accounts across all brands. Per-account credentials (App
            ID/Secret, Access Token, Ad Account ID, USD→BDT rate).
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Add New Account
        </Button>
      </div>

      {q.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…
          </CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="text-sm text-muted-foreground mb-4">
              Kono ad account add kora nei.
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Add your first account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className="overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-base truncate">{acc.name}</div>
                      <Badge variant="outline" className="text-[10px] font-medium">
                        {brandNameMap.get((acc as any).brand_id) ?? "—"}
                      </Badge>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground truncate">
                      {acc.external_id}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(acc);
                          setEditorOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => syncOne(acc)} disabled={busyId === acc.id}>
                        <RefreshCw className="h-3.5 w-3.5 mr-2" /> Sync now
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => repostFinance(acc)}
                        disabled={busyId === acc.id}
                      >
                        <Wallet className="h-3.5 w-3.5 mr-2" /> Re-post to finance (this month)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onClick={() => setConfirmDel(acc)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-muted-foreground">USD Rate:</span>
                  <span className="text-right font-medium">{Number(acc.usd_to_bdt_rate)} BDT</span>
                  <span className="text-muted-foreground">Currency:</span>
                  <span className="text-right font-medium">{acc.currency ?? "—"}</span>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-right">{statusPill(acc.status)}</span>
                  <span className="text-muted-foreground">Structure sync:</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {fmtAgo(acc.last_structure_sync_at)}
                  </span>
                  <span className="text-muted-foreground">Insights sync:</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {fmtAgo(acc.last_insights_sync_at)}
                  </span>
                  <span className="text-muted-foreground">Auto-post:</span>
                  <span className="text-right text-xs">
                    {acc.auto_post_to_finance ? (
                      <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
                        On
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Off</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground">Wallet:</span>
                  <span className="text-right text-xs text-muted-foreground truncate">
                    {acc.finance_wallet_id ? (
                      "Custom wallet"
                    ) : (
                      <span className="text-amber-600">Auto (1st wallet)</span>
                    )}
                  </span>
                </div>

                {acc.last_error ? (
                  <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span className="break-words">{acc.last_error}</span>
                  </div>
                ) : null}

                <div className="flex items-center justify-between border-t pt-3 gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Switch
                      checked={acc.status === "active"}
                      onCheckedChange={(v) => toggleMut.mutate({ id: acc.id, active: v })}
                    />
                    Toggle status
                  </label>
                  <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => { setEditing(acc); setEditorOpen(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busyId === acc.id || !acc.has_access_token}
                    onClick={() => testStored(acc)}
                  >
                    {busyId === acc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wifi className="h-3.5 w-3.5" />
                    )}
                    Test
                  </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AccountEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={() => {
          setEditorOpen(false);
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["mkt", "accounts"] });
        }}
      />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDel?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Eta ad account er credential remove korbe. Already-synced campaigns, ads, ar insights
              database e thakbe (account_id null hoye jabe na — cascade off). Sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDel && delMut.mutate(confirmDel.id)}
            >
              {delMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccountEditor({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: AccountRow | null;
  onSaved: () => void;
}) {
  const { brands } = useBrand();
  const isEdit = !!editing;
  const createMut = useServerFn(createAdAccount);
  const updateMut = useServerFn(updateAdAccount);
  const testMut = useServerFn(testAdAccountConnection);

  const [form, setForm] = useState({
    brandId: "",
    name: "",
    appId: "",
    appSecret: "",
    accessToken: "",
    adAccountId: "",
    usdToBdtRate: "110",
    active: true,
    autoPostToFinance: true,
    financeWalletId: "" as string,
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        brandId: (editing as any)?.brand_id ?? (brands[0]?.id ?? ""),
        name: editing?.name ?? "",
        appId: editing?.app_id ?? "",
        appSecret: "",
        accessToken: "",
        adAccountId: editing?.external_id ?? "",
        usdToBdtRate: editing ? String(editing.usd_to_bdt_rate) : "110",
        active: editing ? editing.status === "active" : true,
        autoPostToFinance: editing ? !!editing.auto_post_to_finance : true,
        financeWalletId: editing?.finance_wallet_id ?? "",
      });
    }
  }, [open, editing, brands]);

  const walletsQ = useBrandWallets(form.brandId || null);
  const wallets = walletsQ.data ?? [];

  const canSubmit = useMemo(() => {
    if (!isEdit && !form.brandId) return false;
    if (!form.name.trim() || !form.adAccountId.trim()) return false;
    if (!isEdit && form.accessToken.trim().length < 20) return false;
    if (!/^\d+$/.test(form.adAccountId.trim())) return false;
    if (!(Number(form.usdToBdtRate) > 0)) return false;
    return true;
  }, [form, isEdit]);

  async function handleTest() {
    if (isEdit && !form.accessToken.trim() && editing) {
      // Test stored credentials
      setTesting(true);
      try {
        const res = await testMut({ data: { accountId: editing.id } });
        toast.success(`OK • ${res.info.name} • ${res.info.currency}`);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed");
      } finally {
        setTesting(false);
      }
      return;
    }
    if (!form.accessToken.trim() || !/^\d+$/.test(form.adAccountId.trim())) {
      toast.error("Access token ar Ad Account ID dorkar");
      return;
    }
    setTesting(true);
    try {
      const res = await testMut({
        data: { accessToken: form.accessToken.trim(), adAccountId: form.adAccountId.trim() },
      });
      toast.success(`OK • ${res.info.name} • ${res.info.currency}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isEdit && editing) {
        await updateMut({
          data: {
            accountId: editing.id,
            name: form.name.trim(),
            appId: form.appId.trim() || null,
            appSecret: form.appSecret.trim() || null,
            accessToken: form.accessToken.trim() || null,
            adAccountId: form.adAccountId.trim(),
            usdToBdtRate: Number(form.usdToBdtRate),
            active: form.active,
            autoPostToFinance: form.autoPostToFinance,
            financeWalletId: form.financeWalletId || null,
          },
        });
        toast.success("Account updated");
      } else {
        await createMut({
          data: {
            brandId: form.brandId,
            name: form.name.trim(),
            appId: form.appId.trim() || null,
            appSecret: form.appSecret.trim() || null,
            accessToken: form.accessToken.trim(),
            adAccountId: form.adAccountId.trim(),
            usdToBdtRate: Number(form.usdToBdtRate),
            active: form.active,
            autoPostToFinance: form.autoPostToFinance,
            financeWalletId: form.financeWalletId || null,
          },
        });
        toast.success("Account added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit" : "Add"} Meta Ads Account</DialogTitle>
          <DialogDescription>
            Enter your Meta Ads API credentials to track ad expenses
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div>
              <Label>Brand</Label>
              <Select
                value={form.brandId}
                onValueChange={(v) => setForm((f) => ({ ...f, brandId: v, financeWalletId: "" }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Ei account kon brand er under add hobe
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ecomdrive_SS"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A friendly name to identify this account
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="appId">App ID</Label>
              <Input
                id="appId"
                value={form.appId}
                onChange={(e) => setForm((f) => ({ ...f, appId: e.target.value }))}
                placeholder="1234567890"
              />
              <p className="text-xs text-muted-foreground mt-1">Your Meta App ID</p>
            </div>
            <div>
              <Label htmlFor="appSecret">App Secret</Label>
              <Input
                id="appSecret"
                type="password"
                value={form.appSecret}
                onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
                placeholder={isEdit && editing?.has_app_secret ? "•••••••• (saved)" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">Your Meta App Secret</p>
            </div>
          </div>

          <div>
            <Label htmlFor="token">Access Token</Label>
            <Input
              id="token"
              type="password"
              value={form.accessToken}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              placeholder={
                isEdit && editing?.has_access_token
                  ? "•••••••• (saved — leave blank to keep)"
                  : "EAAB..."
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Long-lived System User Access Token
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="actId">Ad Account ID</Label>
              <Input
                id="actId"
                value={form.adAccountId}
                onChange={(e) => setForm((f) => ({ ...f, adAccountId: e.target.value }))}
                placeholder="719581961171714"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Without the "act_" prefix
              </p>
            </div>
            <div>
              <Label htmlFor="rate">USD to BDT Rate</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                value={form.usdToBdtRate}
                onChange={(e) => setForm((f) => ({ ...f, usdToBdtRate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">Current conversion rate</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium text-sm">Active Status</div>
              <div className="text-xs text-muted-foreground">Enable or disable this account</div>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Auto-post to Finance</div>
                <div className="text-xs text-muted-foreground">
                  Sync er por daily spend BDT te convert kore expense add hobe
                </div>
              </div>
              <Switch
                checked={form.autoPostToFinance}
                onCheckedChange={(v) => setForm((f) => ({ ...f, autoPostToFinance: v }))}
              />
            </div>
            <div>
              <Label className="text-xs">Finance Wallet (kothay theke charge)</Label>
              <Select
                value={form.financeWalletId || "__auto__"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, financeWalletId: v === "__auto__" ? "" : v }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select wallet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (1st active wallet)</SelectItem>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} <span className="text-muted-foreground">({w.wallet_type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium text-sm">Connection Status</div>
              <div className="text-xs text-muted-foreground">Test your credentials before saving</div>
            </div>
            <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              Test Connection
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}