import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { TrendingUp, Award, Flame, Clock, Target, Plane } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getMyPerformance } from "@/lib/erp/hr/me.functions";

export const Route = createFileRoute("/_authenticated/me/performance")({
  head: () => ({ meta: [{ title: "My Performance" }] }),
  component: PerformancePage,
});

function PerformancePage() {
  const [days, setDays] = useState(90);
  const fn = useServerFn(getMyPerformance);
  const { data } = useQuery({ queryKey: ["me", "perf", days], queryFn: () => fn({ data: { days } }) });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-violet-600" /> Performance</h1>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
            <TabsTrigger value="180">180d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Big ring + streak */}
      <div className="grid gap-3 sm:grid-cols-2">
        <RingCard
          label="Attendance"
          value={data?.attendance_pct ?? 0}
          icon={Target}
          tone="text-emerald-600"
          ringColor="rgb(16 185 129)"
        />
        <RingCard
          label="Punctuality"
          value={data?.punctuality_pct ?? 0}
          icon={Award}
          tone="text-blue-600"
          ringColor="rgb(59 130 246)"
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Flame} label="On-time streak" value={String(data?.streak ?? 0)} hint="days" tone="text-orange-600" />
        <Stat icon={Clock} label="Total work" value={`${Math.round((data?.total_work_minutes ?? 0) / 60)}h`} tone="text-blue-600" />
        <Stat icon={TrendingUp} label="Overtime" value={`${Math.round((data?.total_ot_minutes ?? 0) / 60)}h`} tone="text-amber-600" />
        <Stat icon={Plane} label="Absent" value={String(data?.absent_count ?? 0)} hint="days" tone="text-rose-600" />
      </div>

      {/* Weekly sparkline */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Weekly work hours</h3>
          <span className="text-xs text-muted-foreground">Last {Math.min((data?.weekly?.length ?? 0), 16)} weeks</span>
        </div>
        <WeeklyChart weeks={(data?.weekly ?? []).slice(-16)} />
      </Card>

      {/* Counts breakdown */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3">Breakdown · last {days} days</h3>
        <div className="space-y-2.5">
          <Bar label="Present (on-time)" value={data?.punctual_count ?? 0} max={(data?.present_count ?? 0) + (data?.absent_count ?? 0)} color="bg-emerald-500" />
          <Bar label="Late" value={data?.late_count ?? 0} max={(data?.present_count ?? 0) + (data?.absent_count ?? 0)} color="bg-amber-500" />
          <Bar label="Absent" value={data?.absent_count ?? 0} max={(data?.present_count ?? 0) + (data?.absent_count ?? 0)} color="bg-rose-500" />
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className={cn("h-3.5 w-3.5", tone)} />{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function RingCard({ label, value, icon: Icon, tone, ringColor }: any) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const r = 38;
  const C = 2 * Math.PI * r;
  const off = C - (pct / 100) * C;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-3">
        <Icon className={cn("h-3.5 w-3.5", tone)} /> {label}
      </div>
      <div className="flex items-center gap-4">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
          <circle
            cx="50" cy="50" r={r} fill="none" stroke={ringColor} strokeWidth="10"
            strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div>
          <div className="text-3xl font-bold tabular-nums">{Math.round(pct)}%</div>
          <div className="text-xs text-muted-foreground">score</div>
        </div>
      </div>
    </Card>
  );
}

function WeeklyChart({ weeks }: { weeks: { week: string; minutes: number }[] }) {
  if (!weeks.length) {
    return <div className="h-32 grid place-items-center text-xs text-muted-foreground">No data yet</div>;
  }
  const max = Math.max(1, ...weeks.map((w) => w.minutes));
  return (
    <div className="flex items-end gap-1.5 h-32">
      {weeks.map((w, i) => {
        const h = (w.minutes / max) * 100;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition">
              {Math.round(w.minutes / 60)}h
            </div>
            <div className="w-full rounded-t bg-gradient-to-t from-primary/50 to-primary" style={{ height: `${h}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{value}</span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden">
        <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}