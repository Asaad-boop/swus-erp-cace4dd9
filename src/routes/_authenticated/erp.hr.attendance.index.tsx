import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, Clock, AlertCircle, Users, Download, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import {
  listAttendance, markAttendance, deleteAttendance, getAttendanceKpis, listShifts,
} from "@/lib/erp/hr/attendance.functions";
import { listEmployees, listDepartments } from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/attendance/")({
  head: () => ({ meta: [{ title: "Attendance — HR" }] }),
  component: AttendancePage,
});

const STATUS_TONE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-800",
  late: "bg-amber-100 text-amber-800",
  half_day: "bg-orange-100 text-orange-800",
  absent: "bg-red-100 text-red-800",
  leave: "bg-blue-100 text-blue-800",
  holiday: "bg-violet-100 text-violet-800",
  week_off: "bg-slate-100 text-slate-700",
};

function AttendancePage() {
  const qc = useQueryClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);

  const listFn = useServerFn(listAttendance);
  const kpiFn = useServerFn(getAttendanceKpis);
  const deptsFn = useServerFn(listDepartments);
  const delFn = useServerFn(deleteAttendance);

  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => deptsFn() });
  const { data: kpi } = useQuery({ queryKey: ["att-kpi", date], queryFn: () => kpiFn({ data: { date } }) });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["att-list", date, dept, status],
    queryFn: () => listFn({ data: { from: date, to: date, departmentId: dept === "all" ? undefined : dept, status } }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["att-list"] }); qc.invalidateQueries({ queryKey: ["att-kpi"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  function exportCsv() {
    const lines = ["Code,Name,Date,Status,In,Out,Late(min),OT(min),Work(min),Note"];
    for (const r of rows as any[]) {
      lines.push([
        r.employee?.employee_code, r.employee?.full_name, r.date, r.status,
        r.in_time ?? "", r.out_time ?? "", r.late_min, r.ot_min, r.work_min, (r.note ?? "").replace(/[\n,]/g, " "),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${date}.csv`;
    a.click();
  }

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
            <p className="text-sm text-muted-foreground">Daily punch-in / out, late, overtime</p>
          </div>
          <div className="flex gap-2">
            <Link to="/erp/hr/attendance/muster" className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent">
              <CalendarCheck className="h-4 w-4" /> Muster Roll
            </Link>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Mark</Button>
              </DialogTrigger>
              <MarkDialog defaultDate={date} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["att-list"] }); qc.invalidateQueries({ queryKey: ["att-kpi"] }); }} />
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={Users} label="Total" value={kpi?.totalEmployees ?? 0} />
          <KpiCard icon={CalendarCheck} label="Present" value={kpi?.present ?? 0} tone="text-emerald-600" />
          <KpiCard icon={Clock} label="Late" value={kpi?.late ?? 0} tone="text-amber-600" />
          <KpiCard icon={AlertCircle} label="Absent" value={kpi?.absent ?? 0} tone="text-red-600" />
          <KpiCard icon={CalendarCheck} label="On leave" value={kpi?.onLeave ?? 0} tone="text-blue-600" />
          <KpiCard icon={Clock} label="Avg hrs" value={`${kpi?.avgWorkHours ?? 0}h`} />
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Select value={dept} onValueChange={setDept}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {(depts as any[]).map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Object.keys(STATUS_TONE).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">OT</TableHead>
                    <TableHead className="text-right">Work</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                  ) : (rows as any[]).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No attendance for this date</TableCell></TableRow>
                  ) : (rows as any[]).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{r.employee?.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.employee?.employee_code}</div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className={STATUS_TONE[r.status]}>{r.status}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{r.in_time ? new Date(r.in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.out_time ? new Date(r.out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell className="text-right">{r.late_min || ""}</TableCell>
                      <TableCell className="text-right">{r.ot_min || ""}</TableCell>
                      <TableCell className="text-right">{r.work_min ? `${(r.work_min / 60).toFixed(1)}h` : ""}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => delMut.mutate(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number | string; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5"><Icon className={`h-3.5 w-3.5 ${tone ?? ""}`} />{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}

function MarkDialog({ defaultDate, onDone }: { defaultDate: string; onDone: () => void }) {
  const empsFn = useServerFn(listEmployees);
  const shiftsFn = useServerFn(listShifts);
  const markFn = useServerFn(markAttendance);
  const { data: emps } = useQuery({ queryKey: ["hr-emp-mini"], queryFn: () => empsFn({ data: { pageSize: 500 } }) });
  const { data: shifts = [] } = useQuery({ queryKey: ["hr-shifts"], queryFn: () => shiftsFn() });

  const [empId, setEmpId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [shiftId, setShiftId] = useState<string>("none");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [status, setStatus] = useState<any>("present");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () => markFn({ data: {
      employee_id: empId, date,
      in_time: inTime ? new Date(`${date}T${inTime}`).toISOString() : null,
      out_time: outTime ? new Date(`${date}T${outTime}`).toISOString() : null,
      shift_id: shiftId === "none" ? null : shiftId,
      status, note: note || null,
    }}),
    onSuccess: () => { toast.success("Saved"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Mark attendance</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Employee</Label>
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {(emps?.rows ?? []).map((e: any) => (<SelectItem key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <Label>Shift</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(shifts as any[]).map((s: any) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>In time</Label><Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} /></div>
          <div><Label>Out time</Label><Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} /></div>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["present","late","half_day","absent","leave","holiday","week_off"].map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button disabled={!empId || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}