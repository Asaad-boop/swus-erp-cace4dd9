import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listHolidays, upsertHoliday, deleteHoliday } from "@/lib/erp/hr/attendance.functions";

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

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hr-holidays"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Holidays</h1>
            <p className="text-sm text-muted-foreground">Annual holiday calendar</p>
          </div>
          <div className="flex gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
              </SelectContent>
            </Select>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
              <DialogTrigger asChild><Button size="sm" onClick={() => setEdit(null)}><Plus className="h-4 w-4 mr-2" />Add</Button></DialogTrigger>
              <HolidayDialog initial={edit} onDone={() => { setOpen(false); setEdit(null); qc.invalidateQueries({ queryKey: ["hr-holidays"] }); }} upFn={upFn} />
            </Dialog>
          </div>
        </div>

        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Day</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(rows as any[]).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No holidays for {year}</TableCell></TableRow>
              ) : (rows as any[]).map((h: any) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-sm">{h.date}</TableCell>
                  <TableCell>{new Date(h.date).toLocaleDateString("en", { weekday: "long" })}</TableCell>
                  <TableCell><div className="font-medium">{h.name}</div>{h.description && <div className="text-xs text-muted-foreground">{h.description}</div>}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{h.type}</Badge>
                    {h.is_optional && <Badge variant="outline" className="ml-1">Optional</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEdit(h); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => delMut.mutate(h.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
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