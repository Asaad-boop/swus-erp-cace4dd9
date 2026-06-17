import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import {
  headcountReport, attendanceReport, leaveSummaryReport, payrollReport,
} from "@/lib/erp/hr/reports.functions";
import { getHrKpis } from "@/lib/erp/hr/hr.functions";
import { exportToXlsx } from "@/lib/erp/hr/excel";

export const Route = createFileRoute("/_authenticated/erp/hr/reports")({
  head: () => ({ meta: [{ title: "Reports — HR" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HR Reports</h1>
          <p className="text-sm text-muted-foreground">Headcount, attendance, leave, payroll, anniversaries</p>
        </div>
        <Tabs defaultValue="headcount">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="headcount">Headcount</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="anniv">Birthdays & Anniversaries</TabsTrigger>
          </TabsList>
          <TabsContent value="headcount" className="mt-4"><HeadcountReport /></TabsContent>
          <TabsContent value="attendance" className="mt-4"><AttendanceReport /></TabsContent>
          <TabsContent value="leave" className="mt-4"><LeaveReport /></TabsContent>
          <TabsContent value="payroll" className="mt-4"><PayrollReport /></TabsContent>
          <TabsContent value="anniv" className="mt-4"><AnnivReport /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function HeadcountReport() {
  const [groupBy, setGroupBy] = useState<"department"|"designation"|"employment_type"|"status">("department");
  const fn = useServerFn(headcountReport);
  const { data = [] } = useQuery({ queryKey: ["rpt-headcount", groupBy], queryFn: () => fn({ data: { groupBy } }) });
  const total = (data as any[]).reduce((a, b) => a + b.count, 0);
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-end">
          <div>
            <Label>Group by</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="designation">Designation</SelectItem>
                <SelectItem value="employment_type">Employment Type</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportToXlsx(data as any[], "Headcount", `headcount-${groupBy}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">Total: {total}</div>
      <Table>
        <TableHeader><TableRow><TableHead>{groupBy.replace("_"," ")}</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
        <TableBody>
          {(data as any[]).map((r, i) => (
            <TableRow key={i}><TableCell>{r.label}</TableCell><TableCell className="text-right font-semibold">{r.count}</TableCell><TableCell className="text-right text-muted-foreground">{total ? Math.round((r.count/total)*100) : 0}%</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function AttendanceReport() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today.toISOString().slice(0,10));
  const fn = useServerFn(attendanceReport);
  const { data = [] } = useQuery({ queryKey: ["rpt-att", from, to], queryFn: () => fn({ data: { from, to } }) });
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex justify-between items-end flex-wrap gap-2">
        <div className="flex gap-2 items-end">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <Button size="sm" variant="outline" onClick={() => exportToXlsx(data as any[], "Attendance", `attendance-${from}-to-${to}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead>
            <TableHead className="text-right">Present</TableHead>
            <TableHead className="text-right">Late</TableHead>
            <TableHead className="text-right">Absent</TableHead>
            <TableHead className="text-right">Half-day</TableHead>
            <TableHead className="text-right">Leave</TableHead>
            <TableHead className="text-right">OT (h)</TableHead>
            <TableHead className="text-right">Hours</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data as any[]).map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.name} <span className="text-xs text-muted-foreground">({r.employee_code})</span></TableCell>
                <TableCell className="text-right">{r.present}</TableCell>
                <TableCell className="text-right">{r.late}</TableCell>
                <TableCell className="text-right">{r.absent}</TableCell>
                <TableCell className="text-right">{r.half_day}</TableCell>
                <TableCell className="text-right">{r.leave}</TableCell>
                <TableCell className="text-right">{Math.round(r.ot_hours * 10)/10}</TableCell>
                <TableCell className="text-right">{Math.round(r.total_hours * 10)/10}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent></Card>
  );
}

function LeaveReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const fn = useServerFn(leaveSummaryReport);
  const { data = [] } = useQuery({ queryKey: ["rpt-leave", year], queryFn: () => fn({ data: { year } }) });
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <Label>Year</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        </div>
        <Button size="sm" variant="outline" onClick={() => exportToXlsx(data as any[], "Leave", `leave-${year}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Employee</TableHead><TableHead>Type</TableHead>
          <TableHead className="text-right">Allocated</TableHead><TableHead className="text-right">Used</TableHead><TableHead className="text-right">Remaining</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(data as any[]).map((r, i) => (
            <TableRow key={i}>
              <TableCell>{r.name} <span className="text-xs text-muted-foreground">({r.employee_code})</span></TableCell>
              <TableCell>{r.leave_type}</TableCell>
              <TableCell className="text-right">{r.allocated}</TableCell>
              <TableCell className="text-right">{r.used}</TableCell>
              <TableCell className="text-right font-semibold">{r.remaining}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function PayrollReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const fn = useServerFn(payrollReport);
  const { data = [] } = useQuery({ queryKey: ["rpt-payroll", year], queryFn: () => fn({ data: { year } }) });
  const total = (data as any[]).reduce((a, b) => a + Number(b.net_pay), 0);
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex justify-between items-end">
        <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></div>
        <Button size="sm" variant="outline" onClick={() => exportToXlsx(data as any[], "Payroll", `payroll-${year}`)}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
      </div>
      <div className="text-sm text-muted-foreground">Total net paid this year: ৳{total.toLocaleString("en-BD")}</div>
      <Table>
        <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Employee</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {(data as any[]).map((r, i) => (
            <TableRow key={i}>
              <TableCell>{r.year}-{String(r.month).padStart(2,"0")}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className="text-right">৳{Number(r.gross).toLocaleString("en-BD")}</TableCell>
              <TableCell className="text-right font-semibold">৳{Number(r.net_pay).toLocaleString("en-BD")}</TableCell>
              <TableCell>{r.payment_status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function AnnivReport() {
  const fn = useServerFn(getHrKpis);
  const { data } = useQuery({ queryKey: ["hr-kpis"], queryFn: () => fn() });
  const bdays = data?.upcomingBirthdays ?? [];
  const annivs = data?.upcomingAnniversaries ?? [];
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card><CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Birthdays (next 30 days)</h3>
          <Button size="sm" variant="outline" onClick={() => exportToXlsx(bdays as any[], "Birthdays", "birthdays")}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
        </div>
        {bdays.length === 0 ? <div className="text-sm text-muted-foreground">No upcoming birthdays.</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Date</TableHead><TableHead className="text-right">In Days</TableHead></TableRow></TableHeader>
            <TableBody>{bdays.map((b: any) => <TableRow key={b.id}><TableCell>{b.name}</TableCell><TableCell>{b.date}</TableCell><TableCell className="text-right">{b.in}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Work Anniversaries (next 30 days)</h3>
          <Button size="sm" variant="outline" onClick={() => exportToXlsx(annivs as any[], "Anniversaries", "anniversaries")}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
        </div>
        {annivs.length === 0 ? <div className="text-sm text-muted-foreground">No upcoming anniversaries.</div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Years</TableHead></TableRow></TableHeader>
            <TableBody>{annivs.map((a: any) => <TableRow key={a.id}><TableCell>{a.name}</TableCell><TableCell>{a.date}</TableCell><TableCell className="text-right">{a.years}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}