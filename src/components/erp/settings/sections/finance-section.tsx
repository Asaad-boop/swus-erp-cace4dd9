import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAppSetting, saveAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { useCurrentRole } from "@/hooks/use-current-role";
import { Skeleton } from "@/components/ui/skeleton";

type FinanceSettings = {
  currency: string;
  fiscal_year_start_month: number;
  double_entry_enabled: boolean;
  default_expense_category: string;
  auto_reconciliation: boolean;
  low_stock_threshold: number;
  fx_update_frequency: "manual" | "daily";
  default_tax_rate: number;
};

const DEFAULTS: FinanceSettings = {
  currency: "BDT",
  fiscal_year_start_month: 7,
  double_entry_enabled: true,
  default_expense_category: "Operating",
  auto_reconciliation: false,
  low_stock_threshold: 5,
  fx_update_frequency: "manual",
  default_tax_rate: 0,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function FinanceSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const key = `finance:${brandId}`;

  const getFn = useServerFn(getAppSetting);
  const saveFn = useServerFn(saveAppSetting);

  const { data, isLoading } = useQuery({
    queryKey: ["app-setting", key],
    queryFn: () => getFn({ data: { key } }),
  });
  const [form, setForm] = useState<FinanceSettings>(DEFAULTS);
  useEffect(() => {
    if (data?.value) setForm({ ...DEFAULTS, ...(data.value as Partial<FinanceSettings>) });
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { key, value: form } }),
    onSuccess: () => {
      toast.success("Finance settings saved");
      qc.invalidateQueries({ queryKey: ["app-setting", key] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof FinanceSettings>(k: K, v: FinanceSettings[K]) => setForm({ ...form, [k]: v });

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Finance Settings</h2>
        <p className="text-xs text-muted-foreground">Defaults for accounting, inventory and FX.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <Field label="Default currency">
          <Select value={form.currency} onValueChange={(v) => set("currency", v)} disabled={!isAdmin}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["BDT", "USD", "EUR", "INR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Fiscal year starts">
          <Select value={String(form.fiscal_year_start_month)} onValueChange={(v) => set("fiscal_year_start_month", Number(v))} disabled={!isAdmin}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Default expense category">
          <Input value={form.default_expense_category} onChange={(e) => set("default_expense_category", e.target.value)} disabled={!isAdmin} />
        </Field>
        <Field label="Low stock alert threshold">
          <Input type="number" min={0} value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", Number(e.target.value))} disabled={!isAdmin} />
        </Field>
        <Field label="Default tax rate (%)">
          <Input type="number" min={0} max={100} step={0.01} value={form.default_tax_rate} onChange={(e) => set("default_tax_rate", Number(e.target.value))} disabled={!isAdmin} />
        </Field>
        <Field label="FX rate update">
          <Select value={form.fx_update_frequency} onValueChange={(v) => set("fx_update_frequency", v as any)} disabled={!isAdmin}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="daily">Daily (auto)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Toggle label="Enable double-entry accounting" checked={form.double_entry_enabled} onCheckedChange={(v) => set("double_entry_enabled", v)} disabled={!isAdmin} />
        <Toggle label="Auto-reconciliation" checked={form.auto_reconciliation} onCheckedChange={(v) => set("auto_reconciliation", v)} disabled={!isAdmin} />
      </div>

      {isAdmin && (
        <div className="flex justify-end max-w-3xl">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onCheckedChange, disabled }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3 md:col-span-1">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
