import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listDesignations, listDepartments, upsertDesignation, deleteDesignation } from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/designations")({
  head: () => ({ meta: [{ title: "Designations — HR" }] }),
  component: Designations,
});

function Designations() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDesignations);
  const deptsFn = useServerFn(listDepartments);
  const upsertFn = useServerFn(upsertDesignation);
  const delFn = useServerFn(deleteDesignation);
  const { data: rows = [] } = useQuery({ queryKey: ["hr-desigs"], queryFn: () => listFn() });
  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => deptsFn() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ title: "", department_id: "none", level: "", is_active: true });

  const openNew = () => { setEditing(null); setForm({ title: "", department_id: "none", level: "", is_active: true }); setOpen(true); };
  const openEdit = (d: any) => { setEditing(d); setForm({ title: d.title, department_id: d.department_id ?? "none", level: d.level?.toString() ?? "", is_active: d.is_active }); setOpen(true); };

  const deptMap = new Map((depts as any[]).map((d) => [d.id, d.name]));

  const mut = useMutation({
    mutationFn: () => upsertFn({ data: {
      id: editing?.id,
      title: form.title,
      department_id: form.department_id === "none" ? null : form.department_id,
      level: form.level ? Number(form.level) : null,
      is_active: form.is_active,
    } as any }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["hr-desigs"] }); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hr-desigs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Designations</h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Add Designation</Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No designations yet.</TableCell></TableRow>
                ) : (rows as any[]).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell>{deptMap.get(d.department_id ?? "") ?? "—"}</TableCell>
                    <TableCell>{d.level ?? "—"}</TableCell>
                    <TableCell>{d.is_active ? "Active" : "Inactive"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete ${d.title}?`)) delMut.mutate(d.id); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Designation</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div>
                <Label>Department</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(depts as any[]).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Level (number)</Label><Input type="number" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => mut.mutate()} disabled={!form.title || mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}