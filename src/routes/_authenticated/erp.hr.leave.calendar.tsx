import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--hr-text-strong)]">Leave Calendar</h1>
            <p className="text-sm text-[color:var(--hr-text-muted)] mt-1">Team-wide approved leaves and holidays</p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-[color:var(--hr-border)] rounded-xl shadow-sm p-1.5">
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-sm font-semibold w-40 text-center text-[color:var(--hr-text-strong)]">{new Date(year, month).toLocaleString("en", { month: "long", year: "numeric" })}</div>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm p-4">
          <div className="grid grid-cols-7 gap-1.5 text-xs">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (<div key={d} className="text-center text-[color:var(--hr-text-muted)] font-semibold py-2 text-[11px] uppercase tracking-wider">{d}</div>))}
            {grid.map((c, i) => {
              if (!c.date) return <div key={i} className="bg-muted/40 rounded-lg min-h-[110px]" />;
              const evs = eventsByDate.get(c.date) ?? [];
              const hol: any = holsByDate.get(c.date);
              const dow = new Date(c.date).getDay();
              return (
                <div key={i} className={`rounded-lg border min-h-[110px] p-2 transition-colors ${hol ? "bg-violet-50 border-violet-100" : dow === 5 ? "bg-slate-50 border-[color:var(--hr-border)]" : "border-[color:var(--hr-border)] hover:bg-muted/40"}`}>
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="font-semibold text-[color:var(--hr-text-strong)]">{c.d}</span>
                    {hol && <span className="text-violet-700 truncate text-[10px]" title={hol.name}>{hol.name}</span>}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((e: any) => (
                      <div key={e.id} className="text-[10px] px-1.5 py-0.5 rounded font-medium truncate" title={`${e.employee?.full_name} — ${e.leave_type?.name}`} style={{ backgroundColor: `${e.leave_type?.color}22`, color: e.leave_type?.color }}>
                        {e.employee?.full_name}
                      </div>
                    ))}
                    {evs.length > 3 && <div className="text-[10px] text-[color:var(--hr-text-muted)] px-1">+{evs.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}