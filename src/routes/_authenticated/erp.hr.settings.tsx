import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { getHrSettings, updateHrSettings } from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/settings")({
  head: () => ({ meta: [{ title: "HR Settings" }] }),
  component: HrSettings,
});

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function HrSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getHrSettings);
  const updateFn = useServerFn(updateHrSettings);
  const { data } = useQuery({ queryKey: ["hr-settings"], queryFn: () => getFn() });

  const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) setF(data); }, [data]);

  const mut = useMutation({
    mutationFn: () => updateFn({ data: {
      id: f.id,
      default_currency: f.default_currency,
      weekly_off_days: f.weekly_off_days,
      work_hours_per_day: Number(f.work_hours_per_day),
      probation_months: Number(f.probation_months),
      employee_code_prefix: f.employee_code_prefix,
      employee_code_padding: Number(f.employee_code_padding),
      fiscal_year_start_month: Number(f.fiscal_year_start_month),
    } as any }),
    onSuccess: () => { toast.success("Settings updated"); qc.invalidateQueries({ queryKey: ["hr-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!f) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const toggleDay = (i: number) => {
    const has = f.weekly_off_days.includes(i);
    setF({ ...f, weekly_off_days: has ? f.weekly_off_days.filter((d: number) => d !== i) : [...f.weekly_off_days, i].sort() });
  };

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">HR Settings</h1>

        <Card><CardContent className="p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Default currency</Label><Input value={f.default_currency} onChange={(e) => setF({ ...f, default_currency: e.target.value })} /></div>
            <div><Label>Work hours / day</Label><Input type="number" step="0.5" value={f.work_hours_per_day} onChange={(e) => setF({ ...f, work_hours_per_day: e.target.value })} /></div>
            <div><Label>Probation (months)</Label><Input type="number" value={f.probation_months} onChange={(e) => setF({ ...f, probation_months: e.target.value })} /></div>
            <div><Label>Fiscal year start month (1-12)</Label><Input type="number" min={1} max={12} value={f.fiscal_year_start_month} onChange={(e) => setF({ ...f, fiscal_year_start_month: e.target.value })} /></div>
            <div><Label>Employee code prefix</Label><Input value={f.employee_code_prefix} onChange={(e) => setF({ ...f, employee_code_prefix: e.target.value })} /></div>
            <div><Label>Employee code padding (digits)</Label><Input type="number" min={1} max={10} value={f.employee_code_padding} onChange={(e) => setF({ ...f, employee_code_padding: e.target.value })} /></div>
          </div>

          <div>
            <Label className="mb-1.5 block">Weekly off days</Label>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-3 py-1.5 text-sm rounded border ${f.weekly_off_days.includes(i) ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                >{d}</button>
              ))}
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Next employee code: <span className="font-mono">{f.employee_code_prefix}{String(f.next_employee_seq).padStart(f.employee_code_padding, "0")}</span>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save settings"}</Button>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}