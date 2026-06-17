import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Edit2, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listDesignations, listDepartments, upsertDesignation, deleteDesignation } from "@/lib/erp/hr/hr.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";
import { StatusPill } from "@/components/erp/hr/ui/status-pill";

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
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <PageHeader
          title="Designations"
          subtitle="Job titles & seniority levels"
          actions={<Button size="sm" onClick={openNew} className="rounded-lg bg-gray-900 hover:bg-gray-800"><Plus className="h-4 w-4 mr-1.5" /> Add Designation</Button>}
        />
        {(rows as any[]).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <EmptyState icon={Briefcase} title="No designations yet" description="Create job titles employees can be assigned to." />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {(rows as any[]).map((d) => (
              <div key={d.id} className="group px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{d.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{deptMap.get(d.department_id ?? "") ?? "No department"}{d.level ? ` · Level ${d.level}` : ""}</div>
                </div>
                <StatusPill tone={d.is_active ? "active" : "inactive"} dot>{d.is_active ? "Active" : "Inactive"}</StatusPill>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => { if (confirm(`Delete ${d.title}?`)) delMut.mutate(d.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

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