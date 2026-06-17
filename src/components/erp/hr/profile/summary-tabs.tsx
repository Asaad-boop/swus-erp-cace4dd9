import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getEmployeeSummary } from "@/lib/erp/hr/profile.functions";

const STATUS_COLOR: Record<string, string> = {
  present: "bg-emerald-500",
  late: "bg-amber-500",
  absent: "bg-red-500",
  half_day: "bg-orange-400",
  leave: "bg-blue-500",
  holiday: "bg-slate-400",
  week_off: "bg-slate-300",
};

export function AttendanceSummaryTab({ employeeId }: { employeeId: string }) {
  const fn = useServerFn(getEmployeeSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["hr-emp-summary", employeeId],
    queryFn: () => fn({ data: { employeeId } }),
  });
  if (isLoading) return <Card><CardContent className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></CardContent></Card>;

  const today = new Date();
  const days: { date: string; row: any }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    const row = (data?.attendance ?? []).find((r: any) => r.date === d);
    days.push({ date: d, row });
  }
  const counts = { present: 0, late: 0, absent: 0, leave: 0 };
  for (const d of days) {
    if (!d.row) continue;
    if (d.row.status === "present") counts.present++;
    else if (d.row.status === "late") counts.late++;
    else if (d.row.status === "absent") counts.absent++;
    else if (d.row.status === "leave") counts.leave++;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <div className="rounded bg-emerald-50 p-2"><div className="text-xs text-muted-foreground">Present</div><div className="font-bold">{counts.present}</div></div>
          <div className="rounded bg-amber-50 p-2"><div className="text-xs text-muted-foreground">Late</div><div className="font-bold">{counts.late}</div></div>
          <div className="rounded bg-red-50 p-2"><div className="text-xs text-muted-foreground">Absent</div><div className="font-bold">{counts.absent}</div></div>
          <div className="rounded bg-blue-50 p-2"><div className="text-xs text-muted-foreground">Leave</div><div className="font-bold">{counts.leave}</div></div>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {days.map((d) => (
            <div
              key={d.date}
              title={`${d.date} — ${d.row?.status ?? "no record"}${d.row?.total_hours ? ` (${d.row.total_hours}h)` : ""}`}
              className={`aspect-square rounded ${d.row ? STATUS_COLOR[d.row.status] ?? "bg-slate-200" : "bg-slate-100"}`}
            />
          ))}
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
          <Legend color="bg-emerald-500" label="Present" />
          <Legend color="bg-amber-500" label="Late" />
          <Legend color="bg-red-500" label="Absent" />
          <Legend color="bg-orange-400" label="Half day" />
          <Legend color="bg-blue-500" label="Leave" />
          <Legend color="bg-slate-300" label="Off / Holiday" />
        </div>
        {data?.shifts && (data.shifts as any[]).length > 0 && (
          <div className="text-xs">
            <div className="font-semibold mb-1">Current shift</div>
            {(data.shifts as any[]).slice(0, 1).map((s: any) => (
              <div key={s.id}>{s.hr_shifts?.name} ({s.hr_shifts?.start_time}–{s.hr_shifts?.end_time}) — since {s.effective_from}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`inline-block h-2.5 w-2.5 rounded ${color}`} />{label}</span>;
}

export function LeaveSummaryTab({ employeeId }: { employeeId: string }) {
  const fn = useServerFn(getEmployeeSummary);
  const { data, isLoading } = useQuery({
    queryKey: ["hr-emp-summary", employeeId],
    queryFn: () => fn({ data: { employeeId } }),
  });
  if (isLoading) return <Card><CardContent className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></CardContent></Card>;
  const bal = (data?.balances ?? []) as any[];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground mb-2">Year {new Date().getFullYear()}</div>
        {bal.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No leave balances set for this year.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Carried</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bal.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Badge variant="outline" style={b.type?.color ? { borderColor: b.type.color, color: b.type.color } : {}}>
                      {b.type?.name ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{b.allocated}</TableCell>
                  <TableCell className="text-right">{b.carried}</TableCell>
                  <TableCell className="text-right">{b.used}</TableCell>
                  <TableCell className="text-right font-semibold">{b.remaining}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}