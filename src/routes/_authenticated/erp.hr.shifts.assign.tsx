import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listEmployees, listDepartments } from "@/lib/erp/hr/hr.functions";
import { listShifts } from "@/lib/erp/hr/attendance.functions";
import { assignShift, bulkAssignShiftByDepartment, getCurrentShiftMap } from "@/lib/erp/hr/profile.functions";
import { useHrAccess } from "@/lib/erp/hr/role-gate";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { HrAvatar } from "@/components/erp/hr/ui/avatar";

export const Route = createFileRoute("/_authenticated/erp/hr/shifts/assign")({
  head: () => ({ meta: [{ title: "Assign Shifts — HR" }] }),
  component: ShiftsAssignPage,
});

function ShiftsAssignPage() {
  const qc = useQueryClient();
  const access = useHrAccess();
  const empsFn = useServerFn(listEmployees);
  const shiftsFn = useServerFn(listShifts);
  const deptsFn = useServerFn(listDepartments);
  const mapFn = useServerFn(getCurrentShiftMap);
  const assignFn = useServerFn(assignShift);
  const bulkFn = useServerFn(bulkAssignShiftByDepartment);

  const [search, setSearch] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDept, setBulkDept] = useState("");
  const [bulkShift, setBulkShift] = useState("");
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: empsData } = useQuery({ queryKey: ["hr-emp-assign", search], queryFn: () => empsFn({ data: { search, pageSize: 200 } }) });
  const { data: shifts = [] } = useQuery({ queryKey: ["hr-shifts"], queryFn: () => shiftsFn() });
  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => deptsFn() });
  const { data: shiftMap = {} } = useQuery({ queryKey: ["hr-shift-map"], queryFn: () => mapFn() });

  const shiftOpts = shifts as any[];
  const emps = empsData?.rows ?? [];

  const [pending, setPending] = useState<Record<string, string>>({});
  const assignMut = useMutation({
    mutationFn: async (v: { emp: string; shift: string }) =>
      assignFn({ data: { employee_id: v.emp, shift_id: v.shift, effective_from: new Date().toISOString().slice(0,10), effective_to: null } }),
    onSuccess: () => {
      toast.success("Shift assigned");
      qc.invalidateQueries({ queryKey: ["hr-shift-map"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkMut = useMutation({
    mutationFn: () => bulkFn({ data: { department_id: bulkDept, shift_id: bulkShift, effective_from: bulkDate } }),
    onSuccess: (d: any) => {
      toast.success(`Assigned ${d.count} employees`);
      qc.invalidateQueries({ queryKey: ["hr-shift-map"] });
      setBulkOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Assign Shifts"
          subtitle="Set the working shift for each employee"
          actions={access.canManageEmployees ? (
            <Button onClick={() => setBulkOpen(true)} variant="outline" size="sm" className="rounded-lg">
              <Users className="h-4 w-4 mr-1.5" /> Bulk by department
            </Button>
          ) : undefined}
        />

        <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm p-5 space-y-4">
          <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm h-9 rounded-lg border-[color:var(--hr-border)]" />
          <div className="border border-[color:var(--hr-border)] rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-[color:var(--hr-border)] hover:bg-transparent">
                  {["Employee","Current Shift","Assign New"].map(h => <TableHead key={h} className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">{h}</TableHead>)}
                  <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emps.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-[color:var(--hr-text-muted)] py-10">No employees.</TableCell></TableRow>
                ) : emps.map((e: any) => {
                  const cur = (shiftMap as any)[e.id];
                  return (
                    <TableRow key={e.id} className="border-[color:var(--hr-border)] hover:bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <HrAvatar name={e.full_name} src={e.photo_url} size={32} />
                          <div>
                            <div className="font-semibold text-sm text-[color:var(--hr-text-strong)]">{e.full_name}</div>
                            <div className="text-xs text-[color:var(--hr-text-muted)] font-mono">{e.employee_code}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {cur?.hr_shifts ? (
                          <Badge variant="outline" className="rounded-md font-medium">{cur.hr_shifts.name} · {cur.hr_shifts.start_time}–{cur.hr_shifts.end_time}</Badge>
                        ) : <span className="text-[color:var(--hr-text-muted)] text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <Select value={pending[e.id] ?? ""} onValueChange={(v) => setPending({ ...pending, [e.id]: v })}>
                          <SelectTrigger className="w-56 h-9 rounded-lg border-[color:var(--hr-border)]"><SelectValue placeholder="Select shift" /></SelectTrigger>
                          <SelectContent>
                            {shiftOpts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" className="rounded-lg bg-[color:var(--hr-accent)] hover:opacity-90 h-8" disabled={!pending[e.id] || !access.canManageEmployees} onClick={() => assignMut.mutate({ emp: e.id, shift: pending[e.id] })}>
                          <Save className="h-3 w-3 mr-1" /> Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Assign Shift by Department</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Department</Label>
              <Select value={bulkDept} onValueChange={setBulkDept}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(depts as any[]).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Shift</Label>
              <Select value={bulkShift} onValueChange={setBulkShift}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{shiftOpts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Effective From</Label>
              <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={() => bulkMut.mutate()} disabled={!bulkDept || !bulkShift || bulkMut.isPending}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}