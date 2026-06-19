import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Sparkles, ShieldAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/erp/finance/settings")({
  head: () => ({ meta: [{ title: "Finance Settings — ERP" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();

  const lockQ = useQuery({
    queryKey: ["erp_period_lock", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data } = await supabase.from("erp_period_locks").select("*").eq("brand_id", brandId!).maybeSingle();
      return data;
    },
  });

  const [lockDate, setLockDate] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (lockQ.data) {
      setLockDate(lockQ.data.locked_until || "");
      setReason(lockQ.data.reason || "");
    }
  }, [lockQ.data]);

  const coaCountQ = useQuery({
    queryKey: ["coa_count", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { count } = await supabase.from("erp_chart_accounts").select("*", { count: "exact", head: true }).eq("brand_id", brandId!);
      return count ?? 0;
    },
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("seed_default_coa", { _brand_id: brandId! });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`COA ready (${n} accounts)`); qc.invalidateQueries({ queryKey: ["coa_count"] }); qc.invalidateQueries({ queryKey: ["erp_chart_accounts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveLockMut = useMutation({
    mutationFn: async () => {
      if (!lockDate) throw new Error("Pick a lock date");
      const { error } = await supabase.from("erp_period_locks").upsert({
        brand_id: brandId!, locked_until: lockDate, reason: reason || null, locked_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      }, { onConflict: "brand_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Period lock saved"); qc.invalidateQueries({ queryKey: ["erp_period_lock"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearLockMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("erp_period_locks").delete().eq("brand_id", brandId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Period unlocked"); setLockDate(""); setReason(""); qc.invalidateQueries({ queryKey: ["erp_period_lock"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const autopostKey = brandId ? `finance:payroll_autopost:${brandId}` : null;
  const autopostQ = useQuery({
    queryKey: ["app_setting", autopostKey],
    enabled: !!autopostKey,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", autopostKey!).maybeSingle();
      if (!data?.value) return true;
      try { return JSON.parse(data.value) !== false; } catch { return true; }
    },
  });
  const autopostMut = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.from("app_settings").upsert(
        { key: autopostKey!, value: JSON.stringify(next), updated_by: (await supabase.auth.getUser()).data.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => { toast.success(`Payroll autopost ${next ? "enabled" : "disabled"}`); qc.invalidateQueries({ queryKey: ["app_setting", autopostKey] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Finance Settings</h1>
        <p className="text-sm text-muted-foreground">{effectiveBrand?.name}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" />Chart of Accounts</CardTitle>
          <CardDescription>Seed default 5-category accounting structure for this brand.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-between items-center">
          <p className="text-sm">Current accounts: <span className="font-semibold">{coaCountQ.data ?? "…"}</span></p>
          <Button onClick={() => seedMut.mutate()} disabled={seedMut.isPending} variant={coaCountQ.data ? "outline" : "default"}>
            {coaCountQ.data ? "Add missing defaults" : "Seed default accounts"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Period Lock</CardTitle>
          <CardDescription>Block edits to journal entries dated on or before the lock date. Admin-only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Lock entries up to (inclusive)</Label><Input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} /></div>
            <div><Label className="text-xs">Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Year-end close…" /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveLockMut.mutate()} disabled={saveLockMut.isPending}>Save lock</Button>
            {lockQ.data && <Button variant="outline" onClick={() => clearLockMut.mutate()} disabled={clearLockMut.isPending}>Remove lock</Button>}
          </div>
          {lockQ.data?.locked_until && (
            <p className="text-xs text-muted-foreground">Currently locked until <strong>{lockQ.data.locked_until}</strong></p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Payroll Integration</CardTitle>
          <CardDescription>Automatically post finalized payroll runs and salary payments to the Finance journal.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-between items-center gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Auto-post payroll to journal</p>
            <p className="text-xs text-muted-foreground">When enabled, finalizing a run posts Salary Expense / Salary Payable. Marking a payslip paid clears Salary Payable against the wallet (bKash, Nagad, Bank, Cash).</p>
          </div>
          <Switch
            checked={autopostQ.data ?? true}
            disabled={!brandId || autopostMut.isPending}
            onCheckedChange={(v) => autopostMut.mutate(v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground"><ShieldAlert className="h-5 w-5" />Coming next</CardTitle>
          <CardDescription>Phase 2+ features — wired up once Phase 1A is in regular use.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>Accounts Receivable &amp; Payable (auto-link with orders / suppliers / Meta ads)</li>
            <li>Recurring entries (rent, salary, subscriptions) + daily cron</li>
            <li>Monthly category budgets vs actuals</li>
            <li>Bank / bKash statement reconciliation</li>
            <li>VAT &amp; withholding tax tracking</li>
            <li>Multi-currency &amp; FX gain/loss</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}