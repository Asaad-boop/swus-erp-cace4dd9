import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    } as any }),
    onSuccess: () => { toast.success("Settings updated"); qc.invalidateQueries({ queryKey: ["hr-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!f) return <div className="min-h-screen bg-gray-50"><HrSubnav /><div className="p-8 text-gray-400">Loading…</div></div>;
  const toggleDay = (i: number) => {
    const has = f.weekly_off_days.includes(i);
    setF({ ...f, weekly_off_days: has ? f.weekly_off_days.filter((d: number) => d !== i) : [...f.weekly_off_days, i].sort() });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
        <PageHeader title="HR Settings" subtitle="Defaults, working hours, employee code format" />

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label className="text-xs text-gray-500">Default currency</Label><Input className="mt-1 h-9 rounded-lg border-gray-200" value={f.default_currency} onChange={(e) => setF({ ...f, default_currency: e.target.value })} /></div>
            <div><Label className="text-xs text-gray-500">Work hours / day</Label><Input className="mt-1 h-9 rounded-lg border-gray-200" type="number" step="0.5" value={f.work_hours_per_day} onChange={(e) => setF({ ...f, work_hours_per_day: e.target.value })} /></div>
            <div><Label className="text-xs text-gray-500">Probation (months)</Label><Input className="mt-1 h-9 rounded-lg border-gray-200" type="number" value={f.probation_months} onChange={(e) => setF({ ...f, probation_months: e.target.value })} /></div>
            <div><Label className="text-xs text-gray-500">Fiscal year start month (1-12)</Label><Input className="mt-1 h-9 rounded-lg border-gray-200" type="number" min={1} max={12} value={f.fiscal_year_start_month} onChange={(e) => setF({ ...f, fiscal_year_start_month: e.target.value })} /></div>
            <div><Label className="text-xs text-gray-500">Employee code prefix</Label><Input className="mt-1 h-9 rounded-lg border-gray-200" value={f.employee_code_prefix} onChange={(e) => setF({ ...f, employee_code_prefix: e.target.value })} /></div>
            <div><Label className="text-xs text-gray-500">Employee code padding (digits)</Label><Input className="mt-1 h-9 rounded-lg border-gray-200" type="number" min={1} max={10} value={f.employee_code_padding} onChange={(e) => setF({ ...f, employee_code_padding: e.target.value })} /></div>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-2 block">Weekly off days</Label>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${f.weekly_off_days.includes(i) ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
                >{d}</button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Next employee code: <span className="font-mono font-semibold text-gray-900">{f.employee_code_prefix}{String(f.next_employee_seq).padStart(f.employee_code_padding, "0")}</span>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <Button className="rounded-lg bg-gray-900 hover:bg-gray-800" onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save settings"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}