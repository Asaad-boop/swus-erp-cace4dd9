import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceSettings } from "@/components/erp/settings/invoice-settings";
import { useCurrentRole } from "@/hooks/use-current-role";
import { useServerFn } from "@tanstack/react-start";
import { getAppSetting, saveAppSetting } from "@/lib/erp/settings/app-settings.functions";
import { ORDER_STATUSES } from "@/lib/erp/orders";

type OrderSettings = {
  default_status: string;
  auto_confirm: boolean;
  cod_fee_type: "flat" | "percent";
  cod_fee_value: number;
  return_window_days: number;
  order_id_format: string;
};

const DEFAULTS: OrderSettings = {
  default_status: "pending",
  auto_confirm: false,
  cod_fee_type: "flat",
  cod_fee_value: 0,
  return_window_days: 7,
  order_id_format: "{prefix}{seq}",
};

export function InvoiceOrdersSection({ brandId }: { brandId: string }) {
  const { isAdmin } = useCurrentRole();
  const qc = useQueryClient();
  const key = `orders:${brandId}`;

  const getFn = useServerFn(getAppSetting);
  const saveFn = useServerFn(saveAppSetting);

  const { data, isLoading } = useQuery({
    queryKey: ["app-setting", key],
    queryFn: () => getFn({ data: { key } }),
  });
  const [form, setForm] = useState<OrderSettings>(DEFAULTS);
  useEffect(() => { if (data?.value) setForm({ ...DEFAULTS, ...(data.value as Partial<OrderSettings>) }); }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { key, value: form } }),
    onSuccess: () => { toast.success("Order settings saved"); qc.invalidateQueries({ queryKey: ["app-setting", key] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = <K extends keyof OrderSettings>(k: K, v: OrderSettings[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Invoice & Orders</h2>
        <p className="text-xs text-muted-foreground">Invoice template, numbering, order defaults and COD fees.</p>
      </div>

      {/* Invoice template — existing rich UI */}
      <InvoiceSettings key={brandId} brandIdOverride={brandId} />

      {/* Order workflow defaults */}
      <section className="rounded-xl border bg-card p-5 space-y-4 max-w-4xl">
        <h3 className="font-semibold">Order workflow</h3>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Default status on creation</Label>
              <Select value={form.default_status} onValueChange={(v) => set("default_status", v)} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Return window (days)</Label>
              <Input type="number" min={0} value={form.return_window_days} onChange={(e) => set("return_window_days", Number(e.target.value))} disabled={!isAdmin} />
            </div>
            <div>
              <Label>COD fee</Label>
              <div className="flex gap-2">
                <Select value={form.cod_fee_type} onValueChange={(v) => set("cod_fee_type", v as any)} disabled={!isAdmin}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat (৳)</SelectItem>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" min={0} value={form.cod_fee_value} onChange={(e) => set("cod_fee_value", Number(e.target.value))} disabled={!isAdmin} />
              </div>
            </div>
            <div>
              <Label>Order ID format</Label>
              <Input value={form.order_id_format} onChange={(e) => set("order_id_format", e.target.value)} placeholder="{prefix}{seq}" disabled={!isAdmin} />
              <p className="text-[11px] text-muted-foreground mt-1">Tokens: {"{prefix}"} {"{seq}"} {"{yyyy}"} {"{mm}"}</p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
              <Label>Auto-confirm orders on creation</Label>
              <Switch checked={form.auto_confirm} onCheckedChange={(v) => set("auto_confirm", v)} disabled={!isAdmin} />
            </div>
          </div>
        )}
        {isAdmin && (
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save order settings
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
