import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, Clock, AlertCircle, Users, Download, Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LivePunchPanel } from "@/components/erp/hr/attendance/live-punch-panel";
import {
  listAttendance, markAttendance, deleteAttendance, getAttendanceKpis, listShifts,
} from "@/lib/erp/hr/attendance.functions";
import { listEmployees, listDepartments } from "@/lib/erp/hr/hr.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { StatCard } from "@/components/erp/hr/ui/stat-card";
import { StatusPill, type StatusTone } from "@/components/erp/hr/ui/status-pill";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";

export const Route = createFileRoute("/_authenticated/erp/hr/attendance/")({
  head: () => ({ meta: [{ title: "Attendance — HR" }] }),
  component: AttendancePage,
});

const TONE: Record<string, StatusTone> = {
  present: "present", late: "late", half_day: "late",
  absent: "absent", leave: "leave", holiday: "holiday", week_off: "inactive",
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
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Attendance"
          subtitle="Daily punch-in / out, lateness, overtime"
          actions={
            <>
              <Link to="/erp/hr/attendance/muster">
                <Button variant="outline" size="sm" className="rounded-lg"><CalendarCheck className="h-4 w-4 mr-2" /> Muster Roll</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={exportCsv} className="rounded-lg"><Download className="h-4 w-4 mr-2" />Export</Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-lg bg-[color:var(--hr-accent)] hover:opacity-90"><Plus className="h-4 w-4 mr-2" />Mark</Button>
                </DialogTrigger>
                <MarkDialog defaultDate={date} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["att-list"] }); qc.invalidateQueries({ queryKey: ["att-kpi"] }); }} />
              </Dialog>
            </>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total" value={kpi?.totalEmployees ?? 0} icon={Users} accent="slate" />
          <StatCard label="Present" value={kpi?.present ?? 0} icon={CalendarCheck} accent="emerald" />
          <StatCard label="Late" value={kpi?.late ?? 0} icon={Clock} accent="amber" />
          <StatCard label="Absent" value={kpi?.absent ?? 0} icon={AlertCircle} accent="red" />
          <StatCard label="On Leave" value={kpi?.onLeave ?? 0} icon={CalendarCheck} accent="blue" />
          <StatCard label="Avg Hours" value={`${kpi?.avgWorkHours ?? 0}h`} icon={Clock} accent="indigo" />
        </div>

        <Tabs defaultValue="live">
          <TabsList className="bg-white border border-[color:var(--hr-border)] rounded-xl p-1 shadow-sm">
            <TabsTrigger value="live" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Live Punch</TabsTrigger>
            <TabsTrigger value="manual" className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">Manual / Records</TabsTrigger>
          </TabsList>
          <TabsContent value="live" className="mt-5">
            <LivePunchPanel />
          </TabsContent>
          <TabsContent value="manual" className="mt-5">
        <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44 h-9 rounded-lg border-[color:var(--hr-border)]" />
              </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Select value={dept} onValueChange={setDept}>
                  <SelectTrigger className="w-48 h-9 rounded-lg border-[color:var(--hr-border)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {(depts as any[]).map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-40 h-9 rounded-lg border-[color:var(--hr-border)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {Object.keys(TONE).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border border-[color:var(--hr-border)] rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-[color:var(--hr-border)] hover:bg-transparent">
                    {["Employee","Status","In","Out"].map(h => <TableHead key={h} className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">{h}</TableHead>)}
                    <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold text-right">Late</TableHead>
                    <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold text-right">OT</TableHead>
                    <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold text-right">Work</TableHead>
                    <TableHead className="bg-muted/40"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-[color:var(--hr-text-muted)] py-10">Loading…</TableCell></TableRow>
                  ) : (rows as any[]).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="p-0"><EmptyState icon={FileText} title="No attendance" description="No records for this date." /></TableCell></TableRow>
                  ) : (rows as any[]).map((r: any) => (
                    <TableRow key={r.id} className="border-[color:var(--hr-border)] hover:bg-muted/40">
                      <TableCell>
                        <div className="text-sm font-semibold text-[color:var(--hr-text-strong)]">{r.employee?.full_name}</div>
                        <div className="text-xs text-[color:var(--hr-text-muted)] font-mono">{r.employee?.employee_code}</div>
                      </TableCell>
                      <TableCell><StatusPill tone={TONE[r.status] ?? "neutral"} dot>{r.status}</StatusPill></TableCell>
                      <TableCell className="font-mono text-xs text-[color:var(--hr-text-strong)]">{r.in_time ? new Date(r.in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-[color:var(--hr-text-strong)]">{r.out_time ? new Date(r.out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-[color:var(--hr-text-strong)]">{r.late_min || ""}</TableCell>
                      <TableCell className="text-right tabular-nums text-[color:var(--hr-text-strong)]">{r.ot_min || ""}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-[color:var(--hr-text-strong)]">{r.work_min ? `${(r.work_min / 60).toFixed(1)}h` : ""}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => delMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
        </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
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