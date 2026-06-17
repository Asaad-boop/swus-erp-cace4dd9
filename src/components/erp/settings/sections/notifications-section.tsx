import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getAppSetting, saveAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { useCurrentRole } from "@/hooks/use-current-role";
import { Skeleton } from "@/components/ui/skeleton";

type NotificationSettings = {
  low_stock_email: boolean;
  low_stock_in_app: boolean;
  new_order: boolean;
  cod_reconciliation_reminder: boolean;
  failed_courier_sync: boolean;
  daily_pnl_summary: boolean;
  daily_pnl_time: string; // HH:MM
  weekly_report: boolean;
  recipient_emails: string;
};

const DEFAULTS: NotificationSettings = {
  low_stock_email: true,
  low_stock_in_app: true,
  new_order: true,
  cod_reconciliation_reminder: true,
  failed_courier_sync: true,
  daily_pnl_summary: false,
  daily_pnl_time: "09:00",
  weekly_report: false,
  recipient_emails: "",
};

export function NotificationsSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const key = `notifications:${brandId}`;

  const getFn = useServerFn(getAppSetting);
  const saveFn = useServerFn(saveAppSetting);

  const { data, isLoading } = useQuery({
    queryKey: ["app-setting", key],
    queryFn: () => getFn({ data: { key } }),
  });
  const [form, setForm] = useState(DEFAULTS);
  useEffect(() => { if (data?.value) setForm({ ...DEFAULTS, ...(data.value as Partial<NotificationSettings>) }); }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { key, value: form } }),
    onSuccess: () => { toast.success("Notification settings saved"); qc.invalidateQueries({ queryKey: ["app-setting", key] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) => setForm({ ...form, [k]: v });

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Notifications & Alerts</h2>
        <p className="text-xs text-muted-foreground">Choose when and how the team gets notified.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3 max-w-3xl">
        <Toggle label="Low stock alert — email" checked={form.low_stock_email} onCheckedChange={(v) => set("low_stock_email", v)} disabled={!isAdmin} />
        <Toggle label="Low stock alert — in-app" checked={form.low_stock_in_app} onCheckedChange={(v) => set("low_stock_in_app", v)} disabled={!isAdmin} />
        <Toggle label="New order alert" checked={form.new_order} onCheckedChange={(v) => set("new_order", v)} disabled={!isAdmin} />
        <Toggle label="COD reconciliation reminder" checked={form.cod_reconciliation_reminder} onCheckedChange={(v) => set("cod_reconciliation_reminder", v)} disabled={!isAdmin} />
        <Toggle label="Failed courier sync alert" checked={form.failed_courier_sync} onCheckedChange={(v) => set("failed_courier_sync", v)} disabled={!isAdmin} />

        <div className="flex items-center justify-between rounded-md border p-3 gap-3">
          <div className="flex-1">
            <Label className="text-sm">Daily P&amp;L summary</Label>
            <p className="text-xs text-muted-foreground">Emailed every day at the time below.</p>
          </div>
          <Input
            type="time" value={form.daily_pnl_time}
            onChange={(e) => set("daily_pnl_time", e.target.value)}
            className="w-28" disabled={!form.daily_pnl_summary || !isAdmin}
          />
          <Switch checked={form.daily_pnl_summary} onCheckedChange={(v) => set("daily_pnl_summary", v)} disabled={!isAdmin} />
        </div>

        <Toggle label="Weekly report (every Monday)" checked={form.weekly_report} onCheckedChange={(v) => set("weekly_report", v)} disabled={!isAdmin} />

        <div className="space-y-1.5">
          <Label className="text-sm">Recipient emails (comma-separated)</Label>
          <Textarea
            value={form.recipient_emails}
            onChange={(e) => set("recipient_emails", e.target.value)}
            placeholder="owner@brand.com, ops@brand.com"
            rows={2}
            disabled={!isAdmin}
          />
        </div>
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

function Toggle({ label, checked, onCheckedChange, disabled }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
