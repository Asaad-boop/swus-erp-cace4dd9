import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Clock, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listShifts, upsertShift, deleteShift } from "@/lib/erp/hr/attendance.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";

export const Route = createFileRoute("/_authenticated/erp/hr/shifts")({
  head: () => ({ meta: [{ title: "Shifts — HR" }] }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listShifts);
  const upFn = useServerFn(upsertShift);
  const delFn = useServerFn(deleteShift);
  const { data: rows = [] } = useQuery({ queryKey: ["hr-shifts"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hr-shifts"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Shifts"
          subtitle="Work schedule templates"
          actions={
            <>
              <a href="/erp/hr/shifts/assign"><Button variant="outline" size="sm" className="rounded-lg">Assign Shifts</Button></a>
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
                <DialogTrigger asChild><Button size="sm" onClick={() => setEdit(null)} className="rounded-lg bg-[color:var(--hr-accent)] hover:opacity-90"><Plus className="h-4 w-4 mr-2" />New shift</Button></DialogTrigger>
                <ShiftDialog initial={edit} onDone={() => { setOpen(false); setEdit(null); qc.invalidateQueries({ queryKey: ["hr-shifts"] }); }} upFn={upFn} />
              </Dialog>
            </>
          }
        />

        {(rows as any[]).length === 0 ? (
          <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm">
            <EmptyState icon={Clock} title="No shifts yet" description="Create a shift template (e.g. General 9–6, Night 10–7)." />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(rows as any[]).map((s: any) => (
              <div key={s.id} className="group bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm hover:shadow-md transition-all p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${s.is_night ? "bg-indigo-50 text-[color:var(--hr-accent)]" : "bg-amber-50 text-amber-600"}`}>
                      {s.is_night ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="font-semibold text-[color:var(--hr-text-strong)]">{s.name}</div>
                      {s.code && <div className="text-[11px] text-[color:var(--hr-text-muted)] font-mono">{s.code}</div>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEdit(s); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-red-50 hover:text-red-600" onClick={() => delMut.mutate(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[color:var(--hr-text-strong)] tabular-nums tracking-tight">{s.start_time}</span>
                  <span className="text-[color:var(--hr-text-muted)]">→</span>
                  <span className="text-2xl font-bold text-[color:var(--hr-text-strong)] tabular-nums tracking-tight">{s.end_time}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--hr-text-muted)]">
                  <span>Break <span className="font-semibold text-[color:var(--hr-text-strong)]">{s.break_minutes}m</span></span>
                  <span>Grace <span className="font-semibold text-[color:var(--hr-text-strong)]">{s.grace_minutes}m</span></span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.is_default && <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Default</Badge>}
                  {s.is_night && <Badge variant="secondary" className="bg-violet-50 text-violet-700">Night</Badge>}
                  {!s.is_active && <Badge variant="outline">Inactive</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShiftDialog({ initial, onDone, upFn }: { initial: any; onDone: () => void; upFn: any }) {
  const [form, setForm] = useState<any>(initial ?? {
    name: "General", start_time: "09:00", end_time: "18:00",
    break_minutes: 60, grace_minutes: 10, half_day_after_min: 240,
    is_night: false, is_default: false, is_active: true,
  });
  const mut = useMutation({
    mutationFn: () => upFn({ data: form }),
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Edit shift" : "New shift"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Code</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><Label>Start time</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
          <div><Label>End time</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
          <div><Label>Break (min)</Label><Input type="number" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: Number(e.target.value) })} /></div>
          <div><Label>Grace (min)</Label><Input type="number" value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: Number(e.target.value) })} /></div>
        </div>
        <div className="flex gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.is_night} onCheckedChange={(v) => setForm({ ...form, is_night: v })} />Night shift</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />Default</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
        </div>
      </div>
      <DialogFooter><Button disabled={mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}