import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listEmployees, listDepartments } from "@/lib/erp/hr/hr.functions";
import { listShifts } from "@/lib/erp/hr/attendance.functions";
import { assignShift, bulkAssignShiftByDepartment, getCurrentShiftMap } from "@/lib/erp/hr/profile.functions";
import { useHrAccess } from "@/lib/erp/hr/role-gate";

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
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Assign Shifts</h1>
            <p className="text-sm text-muted-foreground">Set the working shift for each employee</p>
          </div>
          {access.canManageEmployees && (
            <Button onClick={() => setBulkOpen(true)} variant="outline" size="sm">
              <Users className="h-4 w-4 mr-1.5" /> Bulk by department
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Current Shift</TableHead>
                  <TableHead>Assign New</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emps.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No employees.</TableCell></TableRow>
                ) : emps.map((e: any) => {
                  const cur = (shiftMap as any)[e.id];
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{e.full_name}</div>
                        <div className="text-xs text-muted-foreground">{e.employee_code}</div>
                      </TableCell>
                      <TableCell>
                        {cur?.hr_shifts ? (
                          <Badge variant="outline">{cur.hr_shifts.name} · {cur.hr_shifts.start_time}–{cur.hr_shifts.end_time}</Badge>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <Select value={pending[e.id] ?? ""} onValueChange={(v) => setPending({ ...pending, [e.id]: v })}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="Select shift" /></SelectTrigger>
                          <SelectContent>
                            {shiftOpts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" disabled={!pending[e.id] || !access.canManageEmployees} onClick={() => assignMut.mutate({ emp: e.id, shift: pending[e.id] })}>
                          <Save className="h-3 w-3 mr-1" /> Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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