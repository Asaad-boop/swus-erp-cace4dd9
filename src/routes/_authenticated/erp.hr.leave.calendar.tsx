import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listLeaveRequests } from "@/lib/erp/hr/leave.functions";
import { listHolidays } from "@/lib/erp/hr/attendance.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/leave/calendar")({
  head: () => ({ meta: [{ title: "Leave Calendar — HR" }] }),
  component: LeaveCalendar,
});

function LeaveCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const reqFn = useServerFn(listLeaveRequests);
  const holFn = useServerFn(listHolidays);
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: reqs = [] } = useQuery({
    queryKey: ["leave-cal", year, month],
    queryFn: () => reqFn({ data: { status: "approved", from: monthStart, to: monthEnd } }),
  });
  const { data: hols = [] } = useQuery({ queryKey: ["hr-holidays", year], queryFn: () => holFn({ data: { year } }) });

  const grid = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = first.getDay();
    const cells: { d: number | null; date: string | null }[] = [];
    for (let i = 0; i < offset; i++) cells.push({ d: null, date: null });
    for (let i = 1; i <= lastDay; i++) {
      cells.push({ d: i, date: `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}` });
    }
    while (cells.length % 7) cells.push({ d: null, date: null });
    return cells;
  }, [year, month, lastDay]);

  const eventsByDate = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of reqs as any[]) {
      let d = new Date(r.from_date);
      const end = new Date(r.to_date);
      while (d <= end) {
        const key = d.toISOString().slice(0, 10);
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(r);
        d.setDate(d.getDate() + 1);
      }
    }
    return m;
  }, [reqs]);

  const holsByDate = useMemo(() => new Map((hols as any[]).map((h: any) => [h.date, h])), [hols]);

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leave Calendar</h1>
            <p className="text-sm text-muted-foreground">Team-wide approved leaves and holidays</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-sm font-semibold w-40 text-center">{new Date(year, month).toLocaleString("en", { month: "long", year: "numeric" })}</div>
            <Button size="icon" variant="outline" onClick={() => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <Card><CardContent className="p-3">
          <div className="grid grid-cols-7 gap-1 text-xs">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (<div key={d} className="text-center text-muted-foreground font-medium py-2">{d}</div>))}
            {grid.map((c, i) => {
              if (!c.date) return <div key={i} className="bg-muted/30 rounded min-h-[110px]" />;
              const evs = eventsByDate.get(c.date) ?? [];
              const hol: any = holsByDate.get(c.date);
              const dow = new Date(c.date).getDay();
              return (
                <div key={i} className={`rounded border min-h-[110px] p-1.5 ${dow === 5 ? "bg-slate-50" : ""} ${hol ? "bg-violet-50 border-violet-200" : ""}`}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-semibold">{c.d}</span>
                    {hol && <span className="text-violet-700 truncate text-[10px]" title={hol.name}>{hol.name}</span>}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((e: any) => (
                      <div key={e.id} className="text-[10px] px-1 py-0.5 rounded truncate" title={`${e.employee?.full_name} — ${e.leave_type?.name}`} style={{ backgroundColor: `${e.leave_type?.color}22`, color: e.leave_type?.color }}>
                        {e.employee?.full_name}
                      </div>
                    ))}
                    {evs.length > 3 && <div className="text-[10px] text-muted-foreground">+{evs.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}