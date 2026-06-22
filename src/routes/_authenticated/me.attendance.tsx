import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getMyAttendanceMonth } from "@/lib/erp/hr/me.functions";

export const Route = createFileRoute("/_authenticated/me/attendance")({
  head: () => ({ meta: [{ title: "My Attendance" }] }),
  component: AttendancePage,
});

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLOR: Record<string, string> = {
  present: "bg-emerald-500 text-white",
  late: "bg-amber-500 text-white",
  half_day: "bg-orange-500 text-white",
  absent: "bg-rose-500 text-white",
  leave: "bg-violet-500 text-white",
  holiday: "bg-blue-500 text-white",
  weekend: "bg-muted text-muted-foreground",
  none: "bg-muted/40 text-muted-foreground",
};

function AttendancePage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<any | null>(null);
  const fn = useServerFn(getMyAttendanceMonth);
  const ym = ymOf(cursor);
  const { data } = useQuery({ queryKey: ["me", "att", ym], queryFn: () => fn({ data: { ym } }) });

  const byDate = useMemo(() => {
    const m: Record<string, any> = {};
    (data?.rows ?? []).forEach((r: any) => { m[r.date] = r; });
    return m;
  }, [data]);
  const holByDate = useMemo(() => {
    const m: Record<string, any> = {};
    (data?.holidays ?? []).forEach((h: any) => { m[h.date] = h; });
    return m;
  }, [data]);
  const leaveByDate = useMemo(() => {
    const m: Record<string, any> = {};
    (data?.leaves ?? []).forEach((l: any) => {
      const f = new Date(l.from_date);
      const t = new Date(l.to_date);
      for (let d = new Date(f); d <= t; d.setDate(d.getDate() + 1)) {
        m[d.toISOString().slice(0, 10)] = l;
      }
    });
    return m;
  }, [data]);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const summary = useMemo(() => {
    const rows = data?.rows ?? [];
    return {
      present: rows.filter((r: any) => r.status === "present").length,
      late: rows.filter((r: any) => r.status === "late").length,
      absent: rows.filter((r: any) => r.status === "absent").length,
      workMin: rows.reduce((s: number, r: any) => s + (r.work_min || 0), 0),
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="font-semibold text-lg w-40 text-center">
            {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-4 gap-2">
        <SummaryCell label="Present" value={summary.present} tone="text-emerald-600" />
        <SummaryCell label="Late" value={summary.late} tone="text-amber-600" />
        <SummaryCell label="Absent" value={summary.absent} tone="text-rose-600" />
        <SummaryCell label="Hours" value={`${Math.round(summary.workMin / 60)}h`} tone="text-blue-600" />
      </div>

      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground mb-2">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            const key = d.toISOString().slice(0, 10);
            const inMonth = d.getMonth() === cursor.getMonth();
            const att = byDate[key];
            const hol = holByDate[key];
            const lv = leaveByDate[key];
            const isWeekend = d.getDay() === 5 || d.getDay() === 6;
            const isFuture = d > new Date();
            const status = att?.status || (hol ? "holiday" : lv ? "leave" : isWeekend ? "weekend" : isFuture ? "none" : inMonth ? "none" : "none");
            const today = key === new Date().toISOString().slice(0, 10);
            return (
              <button
                key={key}
                onClick={() => setSelected({ date: key, att, hol, lv })}
                className={cn(
                  "aspect-square rounded-lg p-1 flex flex-col items-center justify-center transition relative",
                  STATUS_COLOR[status] || "bg-muted/30",
                  !inMonth && "opacity-30",
                  today && "ring-2 ring-primary ring-offset-1",
                )}
              >
                <span className="text-xs font-bold tabular-nums">{d.getDate()}</span>
                {att?.work_min ? (
                  <span className="text-[9px] opacity-80">{Math.round(att.work_min / 60)}h</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <Legend />
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {selected?.date ? new Date(selected.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Details"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            {selected?.hol && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-3">
                <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">🎉 {selected.hol.name}</div>
                <div className="text-xs text-blue-700 dark:text-blue-300">{selected.hol.type}</div>
              </div>
            )}
            {selected?.lv && (
              <div className="rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900 p-3">
                <div className="text-sm font-semibold">{selected.lv.hr_leave_types?.name ?? "Leave"} (approved)</div>
              </div>
            )}
            {selected?.att ? (
              <div className="space-y-2">
                <Row label="Status" value={<Badge className={cn("capitalize", STATUS_COLOR[selected.att.status])}>{selected.att.status}</Badge>} />
                <Row label="Check in" value={formatTime(selected.att.check_in_time)} />
                <Row label="Check out" value={formatTime(selected.att.check_out_time)} />
                <Row label="Break" value={selected.att.break_start ? `${formatTime(selected.att.break_start)} – ${formatTime(selected.att.break_end)}` : "—"} />
                <Row label="Work hours" value={selected.att.total_hours ? `${selected.att.total_hours}h` : selected.att.work_min ? `${Math.round(selected.att.work_min/60)}h` : "—"} />
                {selected.att.late_min > 0 && <Row label="Late" value={`${selected.att.late_min}m`} />}
                {selected.att.ot_min > 0 && <Row label="Overtime" value={`${selected.att.ot_min}m`} />}
              </div>
            ) : !selected?.hol && !selected?.lv ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No attendance recorded</div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCell({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <Card className="p-3 text-center">
      <div className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </Card>
  );
}
function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-dashed py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
function Legend() {
  const items = [
    ["bg-emerald-500", "Present"],
    ["bg-amber-500", "Late"],
    ["bg-rose-500", "Absent"],
    ["bg-violet-500", "Leave"],
    ["bg-blue-500", "Holiday"],
  ] as const;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
      {items.map(([c, l]) => (
        <div key={l} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <div className={cn("h-3 w-3 rounded", c)} /> {l}
        </div>
      ))}
    </div>
  );
}