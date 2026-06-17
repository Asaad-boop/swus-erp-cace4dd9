import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Edit2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listDepartments, upsertDepartment, deleteDepartment } from "@/lib/erp/hr/hr.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";
import { StatusPill } from "@/components/erp/hr/ui/status-pill";

export const Route = createFileRoute("/_authenticated/erp/hr/departments")({
  head: () => ({ meta: [{ title: "Departments — HR" }] }),
  component: Departments,
});

function Departments() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDepartments);
  const upsertFn = useServerFn(upsertDepartment);
  const delFn = useServerFn(deleteDepartment);
  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", is_active: true });

  const openNew = () => { setEditing(null); setForm({ name: "", code: "", description: "", is_active: true }); setOpen(true); };
  const openEdit = (d: any) => { setEditing(d); setForm({ name: d.name, code: d.code ?? "", description: d.description ?? "", is_active: d.is_active }); setOpen(true); };

  const mut = useMutation({
    mutationFn: () => upsertFn({ data: { id: editing?.id, name: form.name, code: form.code || null, description: form.description || null, is_active: form.is_active } as any }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["hr-depts"] }); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["hr-depts"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <PageHeader
          title="Departments"
          subtitle="Organizational units"
          actions={<Button size="sm" onClick={openNew} className="rounded-lg bg-gray-900 hover:bg-gray-800"><Plus className="h-4 w-4 mr-1.5" /> Add Department</Button>}
        />
        {(depts as any[]).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <EmptyState icon={Building2} title="No departments yet" description="Create your first department to organize employees." />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {(depts as any[]).map((d) => (
              <div key={d.id} className="group px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{d.name}</div>
                  {d.code && <div className="text-xs text-gray-500 font-mono mt-0.5">{d.code}</div>}
                </div>
                <StatusPill tone={d.is_active ? "active" : "inactive"} dot>{d.is_active ? "Active" : "Inactive"}</StatusPill>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => { if (confirm(`Delete ${d.name}?`)) delMut.mutate(d.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Department</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => mut.mutate()} disabled={!form.name || mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}