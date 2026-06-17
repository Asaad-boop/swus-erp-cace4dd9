import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listLeaveTypes, upsertLeaveType, deleteLeaveType, allocateYearlyBalances } from "@/lib/erp/hr/leave.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";

export const Route = createFileRoute("/_authenticated/erp/hr/leave/policy")({
  head: () => ({ meta: [{ title: "Leave Policy — HR" }] }),
  component: PolicyPage,
});

function PolicyPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeaveTypes);
  const upFn = useServerFn(upsertLeaveType);
  const delFn = useServerFn(deleteLeaveType);
  const allocFn = useServerFn(allocateYearlyBalances);
  const { data: rows = [] } = useQuery({ queryKey: ["leave-types"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["leave-types"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const allocMut = useMutation({
    mutationFn: () => allocFn({ data: { year } }),
    onSuccess: (d: any) => toast.success(`Allocated ${d?.count ?? 0} balances`),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Leave Policy"
          subtitle="Leave types & yearly allocation rules"
          actions={
            <>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28 h-9 rounded-lg border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={allocMut.isPending} onClick={() => allocMut.mutate()} className="rounded-lg"><Sparkles className="h-4 w-4 mr-2" />{allocMut.isPending ? "Allocating…" : "Allocate"}</Button>
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
                <DialogTrigger asChild><Button size="sm" onClick={() => setEdit(null)} className="rounded-lg bg-gray-900 hover:bg-gray-800"><Plus className="h-4 w-4 mr-2" />New type</Button></DialogTrigger>
                <TypeDialog initial={edit} onDone={() => { setOpen(false); setEdit(null); qc.invalidateQueries({ queryKey: ["leave-types"] }); }} upFn={upFn} />
              </Dialog>
            </>
          }
        />

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader><TableRow className="border-gray-100 hover:bg-transparent">
              {["Name","Code"].map(h => <TableHead key={h} className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{h}</TableHead>)}
              <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-right">Days/yr</TableHead>
              <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-right">Carry fwd</TableHead>
              <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-right">Notice</TableHead>
              <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Status</TableHead>
              <TableHead className="bg-gray-50/50"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(rows as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400">No leave types</TableCell></TableRow>
              ) : (rows as any[]).map((t: any) => (
                <TableRow key={t.id} className="border-gray-100 hover:bg-gray-50/60">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: t.color }} />
                      <span className="font-semibold text-gray-900">{t.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="font-mono rounded-md">{t.code}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{t.default_days_per_year}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.max_carry_forward}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.min_notice_days}d</TableCell>
                  <TableCell className="flex gap-1">
                    {t.is_paid ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Paid</Badge> : <Badge variant="outline">Unpaid</Badge>}
                    {!t.is_active && <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEdit(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => delMut.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function TypeDialog({ initial, onDone, upFn }: { initial: any; onDone: () => void; upFn: any }) {
  const [form, setForm] = useState<any>(initial ?? {
    name: "", code: "", color: "#6366f1", is_paid: true,
    default_days_per_year: 10, max_carry_forward: 0, min_notice_days: 0,
    requires_approval: true, is_active: true,
  });
  const mut = useMutation({
    mutationFn: () => upFn({ data: form }),
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Edit leave type" : "New leave type"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
          <div><Label>Color</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10" /></div>
          <div><Label>Default days / year</Label><Input type="number" step="0.5" value={form.default_days_per_year} onChange={(e) => setForm({ ...form, default_days_per_year: Number(e.target.value) })} /></div>
          <div><Label>Max carry forward</Label><Input type="number" step="0.5" value={form.max_carry_forward} onChange={(e) => setForm({ ...form, max_carry_forward: Number(e.target.value) })} /></div>
          <div><Label>Min notice (days)</Label><Input type="number" value={form.min_notice_days} onChange={(e) => setForm({ ...form, min_notice_days: Number(e.target.value) })} /></div>
        </div>
        <div className="flex gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: v })} />Paid</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.requires_approval} onCheckedChange={(v) => setForm({ ...form, requires_approval: v })} />Requires approval</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Active</label>
        </div>
      </div>
      <DialogFooter><Button disabled={!form.name || !form.code || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}