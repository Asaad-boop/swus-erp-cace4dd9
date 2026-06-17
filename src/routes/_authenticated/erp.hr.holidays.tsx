import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listHolidays, upsertHoliday, deleteHoliday } from "@/lib/erp/hr/attendance.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/erp/hr/holidays")({
  head: () => ({ meta: [{ title: "Holidays — HR" }] }),
  component: HolidaysPage,
});

function HolidaysPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listHolidays);
  const upFn = useServerFn(upsertHoliday);
  const delFn = useServerFn(deleteHoliday);
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const { data: rows = [] } = useQuery({ queryKey: ["hr-holidays", year], queryFn: () => listFn({ data: { year } }) });

  const byMonth = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const h of rows as any[]) {
      const mo = new Date(h.date).getMonth();
      if (!m.has(mo)) m.set(mo, []);
      m.get(mo)!.push(h);
    }
    return m;
  }, [rows]);

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hr-holidays"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Holidays"
          subtitle={`Annual holiday calendar · ${(rows as any[]).length} this year`}
          actions={
            <>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28 h-9 rounded-lg border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
                <DialogTrigger asChild><Button size="sm" onClick={() => setEdit(null)} className="rounded-lg bg-gray-900 hover:bg-gray-800"><Plus className="h-4 w-4 mr-2" />Add Holiday</Button></DialogTrigger>
                <HolidayDialog initial={edit} onDone={() => { setOpen(false); setEdit(null); qc.invalidateQueries({ queryKey: ["hr-holidays"] }); }} upFn={upFn} />
              </Dialog>
            </>
          }
        />

        {(rows as any[]).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <EmptyState icon={CalendarDays} title={`No holidays for ${year}`} description="Add public, religious, or company holidays." />
          </div>
        ) : (
          <div className="space-y-5">
            {Array.from({ length: 12 }, (_, i) => i).filter((m) => byMonth.has(m)).map((m) => (
              <div key={m} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100">
                  <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{new Date(year, m).toLocaleString("en", { month: "long" })}</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {byMonth.get(m)!.map((h: any) => (
                    <div key={h.id} className="group px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                      <div className="text-center w-14 shrink-0">
                        <div className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{new Date(h.date).getDate()}</div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-1">{new Date(h.date).toLocaleDateString("en", { weekday: "short" })}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900">{h.name}</div>
                        {h.description && <div className="text-xs text-gray-500 mt-0.5">{h.description}</div>}
                      </div>
                      <div className="flex gap-1.5 items-center">
                        <Badge variant="secondary" className="capitalize">{h.type}</Badge>
                        {h.is_optional && <Badge variant="outline">Optional</Badge>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEdit(h); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => delMut.mutate(h.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HolidayDialog({ initial, onDone, upFn }: { initial: any; onDone: () => void; upFn: any }) {
  const [form, setForm] = useState<any>(initial ?? {
    date: new Date().toISOString().slice(0, 10), name: "", type: "public", is_optional: false, description: "",
  });
  const mut = useMutation({
    mutationFn: () => upFn({ data: form }),
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Edit holiday" : "Add holiday"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="religious">Religious</SelectItem>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Description</Label><Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.is_optional} onCheckedChange={(v) => setForm({ ...form, is_optional: v })} />Optional holiday</label>
      </div>
      <DialogFooter><Button disabled={!form.name || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}