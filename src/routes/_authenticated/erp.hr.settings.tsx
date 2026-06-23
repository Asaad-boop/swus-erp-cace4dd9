import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { getHrSettings, updateHrSettings } from "@/lib/erp/hr/hr.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";

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
      working_days_per_month: Number(f.working_days_per_month),
      absent_deduction_enabled: !!f.absent_deduction_enabled,
      late_consecutive_threshold: Number(f.late_consecutive_threshold),
      late_rate_per_min: Number(f.late_rate_per_min),
      overtime_enabled: !!f.overtime_enabled,
      overtime_rate_per_hour: Number(f.overtime_rate_per_hour),
    } as any }),
    onSuccess: () => { toast.success("Settings updated"); qc.invalidateQueries({ queryKey: ["hr-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!f) return <div className="min-h-screen bg-background"><HrSubnav /><div className="p-8 text-[color:var(--hr-text-muted)]">Loading…</div></div>;
  const toggleDay = (i: number) => {
    const has = f.weekly_off_days.includes(i);
    setF({ ...f, weekly_off_days: has ? f.weekly_off_days.filter((d: number) => d !== i) : [...f.weekly_off_days, i].sort() });
  };

  return (
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
        <PageHeader title="HR Settings" subtitle="Defaults, working hours, employee code format" />

        <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm p-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Default currency</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" value={f.default_currency} onChange={(e) => setF({ ...f, default_currency: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Work hours / day</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" step="0.5" value={f.work_hours_per_day} onChange={(e) => setF({ ...f, work_hours_per_day: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Probation (months)</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" value={f.probation_months} onChange={(e) => setF({ ...f, probation_months: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Fiscal year start month (1-12)</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" min={1} max={12} value={f.fiscal_year_start_month} onChange={(e) => setF({ ...f, fiscal_year_start_month: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Employee code prefix</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" value={f.employee_code_prefix} onChange={(e) => setF({ ...f, employee_code_prefix: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Employee code padding (digits)</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" min={1} max={10} value={f.employee_code_padding} onChange={(e) => setF({ ...f, employee_code_padding: e.target.value })} /></div>
          </div>

          <div>
            <Label className="text-xs text-[color:var(--hr-text-muted)] mb-2 block">Weekly off days</Label>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${f.weekly_off_days.includes(i) ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white text-[color:var(--hr-text-muted)] border-[color:var(--hr-border)] hover:border-gray-300 hover:bg-gray-50"}`}
                >{d}</button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-[color:var(--hr-text-muted)]">
            Next employee code: <span className="font-mono font-semibold text-[color:var(--hr-text-strong)]">{f.employee_code_prefix}{String(f.next_employee_seq).padStart(f.employee_code_padding, "0")}</span>
          </div>

          <div className="flex justify-end pt-2 border-t border-[color:var(--hr-border)]">
            <Button className="rounded-lg bg-[color:var(--hr-accent)] hover:opacity-90" onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save settings"}</Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--hr-text-strong)]">Payroll Rules</h2>
            <p className="text-xs text-[color:var(--hr-text-muted)] mt-0.5">Used when generating payroll runs from attendance.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Working days / month</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" min={1} max={31} value={f.working_days_per_month ?? 26} onChange={(e) => setF({ ...f, working_days_per_month: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Late: consecutive-day threshold</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" min={1} value={f.late_consecutive_threshold ?? 3} onChange={(e) => setF({ ...f, late_consecutive_threshold: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Late rate (৳/min)</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" min={0} step="0.01" value={f.late_rate_per_min ?? 50} onChange={(e) => setF({ ...f, late_rate_per_min: e.target.value })} /></div>
            <div><Label className="text-xs text-[color:var(--hr-text-muted)]">Overtime rate (৳/hour)</Label><Input className="mt-1 h-9 rounded-lg border-[color:var(--hr-border)]" type="number" min={0} step="0.01" value={f.overtime_rate_per_hour ?? 100} onChange={(e) => setF({ ...f, overtime_rate_per_hour: e.target.value })} /></div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-[color:var(--hr-text-strong)]">Absent deduction</div>
              <div className="text-xs text-[color:var(--hr-text-muted)]">Deduct one day's salary (basic / working days) per absent day.</div>
            </div>
            <Switch checked={!!f.absent_deduction_enabled} onCheckedChange={(v) => setF({ ...f, absent_deduction_enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-[color:var(--hr-text-strong)]">Overtime earning</div>
              <div className="text-xs text-[color:var(--hr-text-muted)]">Pay overtime minutes at the configured hourly rate.</div>
            </div>
            <Switch checked={!!f.overtime_enabled} onCheckedChange={(v) => setF({ ...f, overtime_enabled: v })} />
          </div>
          <div className="flex justify-end pt-2 border-t border-[color:var(--hr-border)]">
            <Button className="rounded-lg bg-[color:var(--hr-accent)] hover:opacity-90" onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save payroll rules"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}