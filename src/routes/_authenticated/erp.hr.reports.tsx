import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { PageHeader } from "@/components/erp/hr/ui/page-header";

export const Route = createFileRoute("/_authenticated/erp/hr/reports")({
  head: () => ({ meta: [{ title: "Reports — HR" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader title="HR Reports" subtitle="Headcount, attendance, leave, payroll, anniversaries" />
        <Tabs defaultValue="headcount">
          <TabsList className="flex-wrap h-auto bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
            {[
              ["headcount","Headcount"],["attendance","Attendance"],["leave","Leave"],
              ["payroll","Payroll"],["anniv","Birthdays & Anniversaries"],
            ].map(([v,l]) => (
              <TabsTrigger key={v} value={v} className="rounded-lg data-[state=active]:bg-gray-900 data-[state=active]:text-white">{l}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="headcount" className="mt-5"><HeadcountReport /></TabsContent>
          <TabsContent value="attendance" className="mt-5"><AttendanceReport /></TabsContent>
          <TabsContent value="leave" className="mt-5"><LeaveReport /></TabsContent>
          <TabsContent value="payroll" className="mt-5"><PayrollReport /></TabsContent>
          <TabsContent value="anniv" className="mt-5"><AnnivReport /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ReportCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">{children}</div>;
}

const thCls = "bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold";

function HeadcountReport() {
  const [groupBy, setGroupBy] = useState<"department"|"designation"|"employment_type"|"status">("department");
  const fn = useServerFn(headcountReport);
  const { data = [] } = useQuery({ queryKey: ["rpt-headcount", groupBy], queryFn: () => fn({ data: { groupBy } }) });
  const total = (data as any[]).reduce((a, b) => a + b.count, 0);
  return (
    <ReportCard>
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-end">
          <div>
            <Label>Group by</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="w-48 h-9 rounded-lg border-gray-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="designation">Designation</SelectItem>
                <SelectItem value="employment_type">Employment Type</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={() => exportToXlsx(data as any[], "Headcount", `headcount-${groupBy}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </div>
      <div className="text-sm text-gray-500">Total: <span className="font-semibold text-gray-900 tabular-nums">{total}</span></div>
      <Table>
        <TableHeader><TableRow className="border-gray-100 hover:bg-transparent"><TableHead className={thCls}>{groupBy.replace("_"," ")}</TableHead><TableHead className={`${thCls} text-right`}>Count</TableHead><TableHead className={`${thCls} text-right`}>%</TableHead></TableRow></TableHeader>
        <TableBody>
          {(data as any[]).map((r, i) => (
            <TableRow key={i} className="border-gray-100"><TableCell>{r.label}</TableCell><TableCell className="text-right font-semibold tabular-nums">{r.count}</TableCell><TableCell className="text-right text-gray-500 tabular-nums">{total ? Math.round((r.count/total)*100) : 0}%</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportCard>
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
    <ReportCard>
      <div className="flex justify-between items-end flex-wrap gap-2">
        <div className="flex gap-2 items-end">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border-gray-200" /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border-gray-200" /></div>
        </div>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={() => exportToXlsx(data as any[], "Attendance", `attendance-${from}-to-${to}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="border-gray-100 hover:bg-transparent">
            <TableHead className={thCls}>Employee</TableHead>
            {["Present","Late","Absent","Half-day","Leave","OT (h)","Hours"].map(h => <TableHead key={h} className={`${thCls} text-right`}>{h}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {(data as any[]).map((r, i) => (
              <TableRow key={i} className="border-gray-100">
                <TableCell className="font-medium text-gray-900">{r.name} <span className="text-xs text-gray-500 font-mono">({r.employee_code})</span></TableCell>
                <TableCell className="text-right tabular-nums">{r.present}</TableCell>
                <TableCell className="text-right tabular-nums">{r.late}</TableCell>
                <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                <TableCell className="text-right tabular-nums">{r.half_day}</TableCell>
                <TableCell className="text-right tabular-nums">{r.leave}</TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(r.ot_hours * 10)/10}</TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(r.total_hours * 10)/10}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ReportCard>
  );
}

function LeaveReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const fn = useServerFn(leaveSummaryReport);
  const { data = [] } = useQuery({ queryKey: ["rpt-leave", year], queryFn: () => fn({ data: { year } }) });
  return (
    <ReportCard>
      <div className="flex justify-between items-end">
        <div>
          <Label>Year</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28 h-9 rounded-lg border-gray-200" />
        </div>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={() => exportToXlsx(data as any[], "Leave", `leave-${year}`)}>
          <Download className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </div>
      <Table>
        <TableHeader><TableRow className="border-gray-100 hover:bg-transparent">
          <TableHead className={thCls}>Employee</TableHead><TableHead className={thCls}>Type</TableHead>
          <TableHead className={`${thCls} text-right`}>Allocated</TableHead><TableHead className={`${thCls} text-right`}>Used</TableHead><TableHead className={`${thCls} text-right`}>Remaining</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(data as any[]).map((r, i) => (
            <TableRow key={i} className="border-gray-100">
              <TableCell className="font-medium text-gray-900">{r.name} <span className="text-xs text-gray-500 font-mono">({r.employee_code})</span></TableCell>
              <TableCell>{r.leave_type}</TableCell>
              <TableCell className="text-right tabular-nums">{r.allocated}</TableCell>
              <TableCell className="text-right tabular-nums">{r.used}</TableCell>
              <TableCell className="text-right font-bold tabular-nums">{r.remaining}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportCard>
  );
}

function PayrollReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const fn = useServerFn(payrollReport);
  const { data = [] } = useQuery({ queryKey: ["rpt-payroll", year], queryFn: () => fn({ data: { year } }) });
  const total = (data as any[]).reduce((a, b) => a + Number(b.net_pay), 0);
  return (
    <ReportCard>
      <div className="flex justify-between items-end">
        <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28 h-9 rounded-lg border-gray-200" /></div>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={() => exportToXlsx(data as any[], "Payroll", `payroll-${year}`)}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
      </div>
      <div className="text-sm text-gray-500">Total net paid this year: <span className="font-bold text-gray-900 tabular-nums">৳{total.toLocaleString("en-BD")}</span></div>
      <Table>
        <TableHeader><TableRow className="border-gray-100 hover:bg-transparent"><TableHead className={thCls}>Month</TableHead><TableHead className={thCls}>Employee</TableHead><TableHead className={`${thCls} text-right`}>Gross</TableHead><TableHead className={`${thCls} text-right`}>Net</TableHead><TableHead className={thCls}>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {(data as any[]).map((r, i) => (
            <TableRow key={i} className="border-gray-100">
              <TableCell className="font-mono text-xs">{r.year}-{String(r.month).padStart(2,"0")}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className="text-right tabular-nums">৳{Number(r.gross).toLocaleString("en-BD")}</TableCell>
              <TableCell className="text-right font-bold tabular-nums">৳{Number(r.net_pay).toLocaleString("en-BD")}</TableCell>
              <TableCell className="text-xs text-gray-600">{r.payment_status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportCard>
  );
}

function AnnivReport() {
  const fn = useServerFn(getHrKpis);
  const { data } = useQuery({ queryKey: ["hr-kpis"], queryFn: () => fn() });
  const bdays = data?.upcomingBirthdays ?? [];
  const annivs = data?.upcomingAnniversaries ?? [];
  return (
    <div className="grid md:grid-cols-2 gap-5">
      <ReportCard>
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Birthdays (next 30 days)</h3>
          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => exportToXlsx(bdays as any[], "Birthdays", "birthdays")}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
        </div>
        {bdays.length === 0 ? <div className="text-sm text-gray-500">No upcoming birthdays.</div> : (
          <Table>
            <TableHeader><TableRow className="border-gray-100 hover:bg-transparent"><TableHead className={thCls}>Name</TableHead><TableHead className={thCls}>Date</TableHead><TableHead className={`${thCls} text-right`}>In Days</TableHead></TableRow></TableHeader>
            <TableBody>{bdays.map((b: any) => <TableRow key={b.id} className="border-gray-100"><TableCell className="font-medium">{b.name}</TableCell><TableCell className="font-mono text-xs">{b.date}</TableCell><TableCell className="text-right tabular-nums">{b.in}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </ReportCard>
      <ReportCard>
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Work Anniversaries (next 30 days)</h3>
          <Button size="sm" variant="outline" className="rounded-lg" onClick={() => exportToXlsx(annivs as any[], "Anniversaries", "anniversaries")}><Download className="h-4 w-4 mr-1.5" />Excel</Button>
        </div>
        {annivs.length === 0 ? <div className="text-sm text-gray-500">No upcoming anniversaries.</div> : (
          <Table>
            <TableHeader><TableRow className="border-gray-100 hover:bg-transparent"><TableHead className={thCls}>Name</TableHead><TableHead className={thCls}>Date</TableHead><TableHead className={`${thCls} text-right`}>Years</TableHead></TableRow></TableHeader>
            <TableBody>{annivs.map((a: any) => <TableRow key={a.id} className="border-gray-100"><TableCell className="font-medium">{a.name}</TableCell><TableCell className="font-mono text-xs">{a.date}</TableCell><TableCell className="text-right tabular-nums font-semibold">{a.years}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </ReportCard>
    </div>
  );
}