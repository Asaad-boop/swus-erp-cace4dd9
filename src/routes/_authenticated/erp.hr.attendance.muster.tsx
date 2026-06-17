import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileSpreadsheet, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { getMusterRoll } from "@/lib/erp/hr/attendance.functions";
import { getAttendanceCell } from "@/lib/erp/hr/punch.functions";
import { listDepartments } from "@/lib/erp/hr/hr.functions";
import { exportAoaXlsx } from "@/lib/erp/hr/excel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/erp/hr/attendance/muster")({
  head: () => ({ meta: [{ title: "Muster Roll — HR" }] }),
  component: MusterPage,
});

const CODE: Record<string, { code: string; tone: string }> = {
  present: { code: "P", tone: "bg-emerald-100 text-emerald-700" },
  late: { code: "L", tone: "bg-amber-100 text-amber-700" },
  half_day: { code: "H", tone: "bg-orange-100 text-orange-700" },
  absent: { code: "A", tone: "bg-red-100 text-red-700" },
  leave: { code: "LV", tone: "bg-blue-100 text-blue-700" },
  holiday: { code: "HD", tone: "bg-violet-100 text-violet-700" },
  week_off: { code: "WO", tone: "bg-slate-100 text-slate-600" },
};

function MusterPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dept, setDept] = useState("all");
  const [cellOpen, setCellOpen] = useState<{ empId: string; date: string; name: string } | null>(null);

  const musterFn = useServerFn(getMusterRoll);
  const deptsFn = useServerFn(listDepartments);
  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => deptsFn() });
  const { data, isLoading } = useQuery({
    queryKey: ["muster", year, month, dept],
    queryFn: () => musterFn({ data: { year, month, departmentId: dept === "all" ? undefined : dept } }),
  });

  const days = useMemo(() => Array.from({ length: data?.lastDay ?? 0 }, (_, i) => i + 1), [data?.lastDay]);

  function exportCsv() {
    if (!data) return;
    const header = ["Code", "Employee", ...days.map((d) => `${data.from.slice(0,7)}-${String(d).padStart(2,"0")}`), "P", "A", "L"];
    const rows: string[] = [header.join(",")];
    for (const e of data.employees as any[]) {
      const att = (data.attendance as any)[e.id] ?? {};
      let p = 0, a = 0, l = 0;
      const cells = days.map((d) => {
        const dateStr = `${data.from.slice(0,7)}-${String(d).padStart(2,"0")}`;
        const r: any = att[dateStr];
        if (!r) return "";
        if (["present","late","half_day"].includes(r.status)) p++;
        if (r.status === "absent") a++;
        if (r.status === "leave") l++;
        return CODE[r.status]?.code ?? r.status;
      });
      rows.push([e.employee_code, e.full_name, ...cells, p, a, l].join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `muster-${year}-${String(month).padStart(2,"0")}.csv`;
    link.click();
  }

  function exportExcel() {
    if (!data) return;
    const header = ["Code", "Employee", ...days.map((d) => `${data.from.slice(0,7)}-${String(d).padStart(2,"0")}`), "Present", "Absent", "Leave", "Late Days", "OT Hours"];
    const aoa: any[][] = [header];
    for (const e of data.employees as any[]) {
      const att = (data.attendance as any)[e.id] ?? {};
      let p = 0, a = 0, l = 0, late = 0, ot = 0;
      const cells = days.map((d) => {
        const dateStr = `${data.from.slice(0,7)}-${String(d).padStart(2,"0")}`;
        const r: any = att[dateStr];
        if (!r) return "";
        if (["present","late","half_day"].includes(r.status)) p++;
        if (r.status === "absent") a++;
        if (r.status === "leave") l++;
        if (r.status === "late") late++;
        if (r.ot_min) ot += Number(r.ot_min) / 60;
        return CODE[r.status]?.code ?? r.status;
      });
      aoa.push([e.employee_code, e.full_name, ...cells, p, a, l, late, Math.round(ot * 10) / 10]);
    }
    exportAoaXlsx(aoa, `${year}-${String(month).padStart(2,"0")}`, `muster-${year}-${String(month).padStart(2,"0")}`);
  }

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Muster Roll</h1>
            <p className="text-sm text-muted-foreground">Monthly attendance grid</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 mr-2" />Export Excel</Button>
        </div>

        <Card><CardContent className="p-4 space-y-3">
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <Label className="text-xs">Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (<SelectItem key={m} value={String(m)}>{new Date(2000, m-1).toLocaleString("en", { month: "long" })}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {(depts as any[]).map((d: any) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground ml-auto flex gap-3 flex-wrap">
              {Object.entries(CODE).map(([k, v]) => (<span key={k} className={`px-1.5 py-0.5 rounded ${v.tone}`}>{v.code} = {k}</span>))}
            </div>
          </div>

          <div className="overflow-auto border rounded-md max-h-[70vh]">
            <table className="text-xs w-full">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left sticky left-0 bg-card z-20 min-w-[160px]">Employee</th>
                  {days.map((d) => {
                    const dateStr = `${data?.from.slice(0,7) ?? ""}-${String(d).padStart(2,"0")}`;
                    const isHol = !!(data?.holidays as any)?.[dateStr];
                    const dow = data ? new Date(dateStr).getDay() : 0;
                    return (
                      <th key={d} className={`px-1 py-2 text-center min-w-[28px] ${isHol ? "bg-violet-50" : dow === 5 ? "bg-slate-50" : ""}`}>
                        {d}
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 text-center bg-emerald-50">P</th>
                  <th className="px-2 py-2 text-center bg-red-50">A</th>
                  <th className="px-2 py-2 text-center bg-blue-50">L</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td className="text-center py-8 text-muted-foreground" colSpan={days.length + 4}>Loading…</td></tr>
                ) : (data?.employees ?? []).length === 0 ? (
                  <tr><td className="text-center py-8 text-muted-foreground" colSpan={days.length + 4}>No employees</td></tr>
                ) : (data?.employees as any[]).map((e: any) => {
                  const att = (data?.attendance as any)?.[e.id] ?? {};
                  let p = 0, a = 0, l = 0;
                  return (
                    <tr key={e.id} className="border-b hover:bg-accent/30">
                      <td className="px-2 py-1.5 sticky left-0 bg-card font-medium">
                        {e.full_name}
                        <div className="text-[10px] text-muted-foreground">{e.employee_code}</div>
                      </td>
                      {days.map((d) => {
                        const dateStr = `${data!.from.slice(0,7)}-${String(d).padStart(2,"0")}`;
                        const r: any = att[dateStr];
                        if (r) {
                          if (["present","late","half_day"].includes(r.status)) p++;
                          if (r.status === "absent") a++;
                          if (r.status === "leave") l++;
                        }
                        const code = r ? CODE[r.status] : null;
                        return (
                          <td key={d} className="px-1 py-1 text-center">
                            {code ? (
                              <button
                                className={`inline-block w-6 rounded ${code.tone} hover:ring-2 ring-primary cursor-pointer`}
                                title={r.note ?? r.status}
                                onClick={() => setCellOpen({ empId: e.id, date: dateStr, name: e.full_name })}
                              >
                                {code.code}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center font-medium text-emerald-700">{p}</td>
                      <td className="text-center font-medium text-red-700">{a}</td>
                      <td className="text-center font-medium text-blue-700">{l}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      </div>
      {cellOpen && <CellDetailDialog data={cellOpen} onClose={() => setCellOpen(null)} />}
    </div>
  );
}

function CellDetailDialog({ data, onClose }: { data: { empId: string; date: string; name: string }; onClose: () => void }) {
  const fn = useServerFn(getAttendanceCell);
  const { data: cell, isLoading } = useQuery({
    queryKey: ["att-cell", data.empId, data.date],
    queryFn: () => fn({ data: { employee_id: data.empId, date: data.date } }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{data.name} — {data.date}</DialogTitle></DialogHeader>
        {isLoading ? <div className="py-6 text-center text-muted-foreground">Loading…</div> : !cell?.row ? <div className="py-6 text-center text-muted-foreground">No record</div> : (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2 items-center">
              <Badge>{cell.row.status}</Badge>
              {cell.row.late_min ? <span className="text-amber-600">{cell.row.late_min} min late</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-xs text-muted-foreground">Check In</div><div className="font-mono">{cell.row.check_in_time ? new Date(cell.row.check_in_time).toLocaleTimeString() : (cell.row.in_time ? new Date(cell.row.in_time).toLocaleTimeString() : "—")}</div></div>
              <div><div className="text-xs text-muted-foreground">Check Out</div><div className="font-mono">{cell.row.check_out_time ? new Date(cell.row.check_out_time).toLocaleTimeString() : (cell.row.out_time ? new Date(cell.row.out_time).toLocaleTimeString() : "—")}</div></div>
              <div><div className="text-xs text-muted-foreground">Break</div><div className="font-mono">{cell.row.break_start ? `${new Date(cell.row.break_start).toLocaleTimeString()} – ${cell.row.break_end ? new Date(cell.row.break_end).toLocaleTimeString() : "…"}` : "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Total Hours</div><div className="font-mono">{cell.row.total_hours ? `${cell.row.total_hours}h` : (cell.row.work_min ? `${(cell.row.work_min/60).toFixed(1)}h` : "—")}</div></div>
            </div>
            {cell.row.check_in_lat && cell.row.check_in_lng && (
              <a href={`https://maps.google.com/?q=${cell.row.check_in_lat},${cell.row.check_in_lng}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary text-xs hover:underline">
                <MapPin className="h-3 w-3" /> Open check-in location in Maps
              </a>
            )}
            {cell.selfieSignedUrl && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Check-in selfie</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cell.selfieSignedUrl} alt="selfie" className="max-h-64 rounded border" />
              </div>
            )}
            {cell.row.note && <div className="text-xs italic">{cell.row.note}</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}