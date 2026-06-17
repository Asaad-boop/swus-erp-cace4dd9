import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listLeaveTypes, upsertLeaveType, deleteLeaveType, allocateYearlyBalances } from "@/lib/erp/hr/leave.functions";

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
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leave Policy</h1>
            <p className="text-sm text-muted-foreground">Leave types & yearly allocation rules</p>
          </div>
          <div className="flex gap-2 items-end">
            <div>
              <Label className="text-xs">Allocate for year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={allocMut.isPending} onClick={() => allocMut.mutate()}><Sparkles className="h-4 w-4 mr-2" />{allocMut.isPending ? "Allocating…" : "Allocate balances"}</Button>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
              <DialogTrigger asChild><Button onClick={() => setEdit(null)}><Plus className="h-4 w-4 mr-2" />New type</Button></DialogTrigger>
              <TypeDialog initial={edit} onDone={() => { setOpen(false); setEdit(null); qc.invalidateQueries({ queryKey: ["leave-types"] }); }} upFn={upFn} />
            </Dialog>
          </div>
        </div>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead className="text-right">Days/yr</TableHead>
              <TableHead className="text-right">Carry fwd</TableHead><TableHead className="text-right">Notice</TableHead>
              <TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(rows as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No leave types</TableCell></TableRow>
              ) : (rows as any[]).map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: t.color }} />
                      <span className="font-medium">{t.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{t.code}</Badge></TableCell>
                  <TableCell className="text-right">{t.default_days_per_year}</TableCell>
                  <TableCell className="text-right">{t.max_carry_forward}</TableCell>
                  <TableCell className="text-right">{t.min_notice_days}d</TableCell>
                  <TableCell className="flex gap-1">
                    {t.is_paid ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Paid</Badge> : <Badge variant="outline">Unpaid</Badge>}
                    {!t.is_active && <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEdit(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => delMut.mutate(t.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
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