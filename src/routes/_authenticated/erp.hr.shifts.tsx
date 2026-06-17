import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Clock, Moon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listShifts, upsertShift, deleteShift } from "@/lib/erp/hr/attendance.functions";

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
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Shifts</h1>
            <p className="text-sm text-muted-foreground">Work schedule templates</p>
          </div>
          <div className="flex gap-2">
            <a href="/erp/hr/shifts/assign" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent">
              Assign Shifts
            </a>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
              <DialogTrigger asChild><Button size="sm" onClick={() => setEdit(null)}><Plus className="h-4 w-4 mr-2" />New shift</Button></DialogTrigger>
              <ShiftDialog initial={edit} onDone={() => { setOpen(false); setEdit(null); qc.invalidateQueries({ queryKey: ["hr-shifts"] }); }} upFn={upFn} />
            </Dialog>
          </div>
        </div>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
              <TableHead>Break</TableHead><TableHead>Grace</TableHead><TableHead>Type</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(rows as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No shifts yet</TableCell></TableRow>
              ) : (rows as any[]).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell><div className="font-medium">{s.name}</div>{s.code && <div className="text-xs text-muted-foreground">{s.code}</div>}</TableCell>
                  <TableCell className="font-mono text-sm">{s.start_time}</TableCell>
                  <TableCell className="font-mono text-sm">{s.end_time}</TableCell>
                  <TableCell>{s.break_minutes}m</TableCell>
                  <TableCell>{s.grace_minutes}m</TableCell>
                  <TableCell className="flex gap-1">
                    {s.is_night && <Badge variant="secondary"><Moon className="h-3 w-3 mr-1" />Night</Badge>}
                    {s.is_default && <Badge>Default</Badge>}
                    {!s.is_active && <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEdit(s); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => delMut.mutate(s.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
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