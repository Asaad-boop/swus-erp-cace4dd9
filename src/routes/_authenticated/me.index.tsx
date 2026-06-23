import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Clock, LogIn, LogOut, Coffee, Play, MapPin, Loader2, AlertCircle,
  CalendarCheck2, TrendingUp, Plane, Wallet, ArrowRight, Sparkles,
  Briefcase, CheckCircle2, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getMyToday, getMyDashboardStats } from "@/lib/erp/hr/me.functions";
import { punchIn, punchOut, punchBreak } from "@/lib/erp/hr/punch.functions";

export const Route = createFileRoute("/_authenticated/me/")({
  head: () => ({ meta: [{ title: "My Workspace" }] }),
  component: MeHome,
});

function formatMin(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function timeStr(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Shubho shokal";
  if (h < 17) return "Shubho dupur";
  if (h < 20) return "Shubho bikal";
  return "Shubho rat";
}

function MeHome() {
  const qc = useQueryClient();
  const todayFn = useServerFn(getMyToday);
  const statsFn = useServerFn(getMyDashboardStats);
  const pIn = useServerFn(punchIn);
  const pOut = useServerFn(punchOut);
  const pBr = useServerFn(punchBreak);

  const { data: today, isLoading } = useQuery({
    queryKey: ["me", "today"],
    queryFn: () => todayFn(),
    refetchInterval: 60_000,
  });
  const { data: stats } = useQuery({ queryKey: ["me", "stats"], queryFn: () => statsFn() });

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const employee: any = today?.employee;
  const att: any = today?.today;
  const shift: any = today?.shift;

  const state: "out" | "in" | "break" | "done" = useMemo(() => {
    if (!att) return "out";
    if (att.check_out_time) return "done";
    if (att.break_start && !att.break_end) return "break";
    if (att.check_in_time) return "in";
    return "out";
  }, [att]);

  const liveWorkMin = useMemo(() => {
    if (!att?.check_in_time) return 0;
    const start = new Date(att.check_in_time).getTime();
    const end = att.check_out_time ? new Date(att.check_out_time).getTime() : now.getTime();
    let breakMin = 0;
    if (att.break_start) {
      const bStart = new Date(att.break_start).getTime();
      const bEnd = att.break_end ? new Date(att.break_end).getTime() : now.getTime();
      breakMin = Math.max(0, Math.round((bEnd - bStart) / 60000));
    }
    return Math.max(0, Math.round((end - start) / 60000) - breakMin);
  }, [att, now]);

  const tryGeo = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 4000, enableHighAccuracy: false },
      );
    });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["me", "today"] });
    qc.invalidateQueries({ queryKey: ["me", "stats"] });
  };

  const inMut = useMutation({
    mutationFn: async () => {
      const g = await tryGeo();
      return pIn({ data: { employee_id: employee.id, lat: g?.lat ?? null, lng: g?.lng ?? null } });
    },
    onSuccess: () => { toast.success("Checked in"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const outMut = useMutation({
    mutationFn: async () => {
      const g = await tryGeo();
      return pOut({ data: { employee_id: employee.id, lat: g?.lat ?? null, lng: g?.lng ?? null } });
    },
    onSuccess: () => { toast.success("Checked out"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const breakMut = useMutation({
    mutationFn: (action: "start" | "end") => pBr({ data: { employee_id: employee.id, action } }),
    onSuccess: () => { refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const noEmployee = !isLoading && !employee;

  if (noEmployee) {
    return (
      <Card className="p-8 text-center space-y-3">
        <AlertCircle className="h-10 w-10 mx-auto text-amber-500" />
        <h2 className="text-lg font-semibold">No employee record linked</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Apnar account ekhono HR e ekjon employee hisheb e link hoyni. HR team ke bolen apnar profile create kore user account link kore dite.
        </p>
        <Button asChild variant="outline"><Link to="/erp">Back to ERP</Link></Button>
      </Card>
    );
  }

  const statusTone =
    state === "out" ? "from-slate-700 via-slate-800 to-slate-900"
    : state === "in" ? "from-emerald-500 via-emerald-600 to-teal-700"
    : state === "break" ? "from-amber-500 via-orange-500 to-orange-700"
    : "from-indigo-500 via-blue-600 to-blue-800";

  const statusLabel =
    state === "out" ? "Not checked in"
    : state === "in" ? "Working"
    : state === "break" ? "On break"
    : "Done for today";

  return (
    <div className="space-y-5">
      {/* HERO PUNCH CARD */}
      <Card
        className={cn(
          "relative overflow-hidden border-0 p-5 sm:p-8 text-white shadow-2xl rounded-2xl",
          "bg-gradient-to-br",
          statusTone,
        )}
      >
        {/* Decorative glows */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-black/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{
          backgroundImage: "radial-gradient(circle at 20% 20%, white 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }} />
        <div className="relative space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                {greeting(now)}
              </div>
              <div className="truncate text-2xl font-bold sm:text-3xl">
                {employee?.display_name || employee?.full_name || "Hello"}
              </div>
              {employee?.designations?.name && (
                <div className="mt-0.5 truncate text-xs text-white/70">
                  {employee.designations.name}
                  {employee?.departments?.name ? ` · ${employee.departments.name}` : ""}
                </div>
              )}
            </div>
            <Badge
              variant="secondary"
              className="bg-white/15 text-white border border-white/20 backdrop-blur-md shrink-0 px-3 py-1 text-[11px] font-semibold tracking-wide"
            >
              <span className={cn(
                "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                state === "in" ? "bg-emerald-200 animate-pulse" :
                state === "break" ? "bg-amber-200 animate-pulse" :
                state === "done" ? "bg-blue-200" : "bg-slate-300",
              )} />
              {statusLabel}
            </Badge>
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-5">
            <div>
              <div className="font-mono text-5xl font-bold tabular-nums tracking-tight sm:text-6xl drop-shadow-sm">
                {timeStr(now)}
              </div>
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-white/75">
                <Clock className="h-3 w-3" />
                {shift?.name
                  ? `${shift.name} · ${shift.start_time?.slice(0, 5)} – ${shift.end_time?.slice(0, 5)}`
                  : "No shift assigned"}
              </div>
            </div>
            {att?.check_in_time && (
              <div className="rounded-xl bg-white/10 px-4 py-2.5 text-right backdrop-blur-md border border-white/15">
                <div className="text-[10px] font-medium uppercase tracking-wider text-white/70">Worked today</div>
                <div className="font-mono text-2xl font-bold tabular-nums">{formatMin(liveWorkMin)}</div>
              </div>
            )}
          </div>

          {/* Action button */}
          <div className="grid gap-2">
            {state === "out" && (
              <Button
                size="lg"
                className="h-14 w-full bg-white text-emerald-700 font-bold text-base shadow-lg hover:bg-white/90"
                disabled={inMut.isPending || !employee}
                onClick={() => inMut.mutate()}
              >
                {inMut.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                Check In
              </Button>
            )}
            {state === "in" && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="lg"
                  className="h-14 bg-white/15 hover:bg-white/25 text-white font-semibold backdrop-blur border border-white/20"
                  disabled={breakMut.isPending}
                  onClick={() => breakMut.mutate("start")}
                >
                  <Coffee className="mr-2 h-5 w-5" /> Break
                </Button>
                <Button
                  size="lg"
                  className="h-14 bg-white text-emerald-700 font-bold shadow-lg hover:bg-white/90"
                  disabled={outMut.isPending}
                  onClick={() => outMut.mutate()}
                >
                  {outMut.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogOut className="mr-2 h-5 w-5" />}
                  Check Out
                </Button>
              </div>
            )}
            {state === "break" && (
              <Button
                size="lg"
                className="h-14 w-full bg-white text-amber-700 font-bold text-base shadow-lg hover:bg-white/90"
                disabled={breakMut.isPending}
                onClick={() => breakMut.mutate("end")}
              >
                <Play className="mr-2 h-5 w-5" /> Resume Work
              </Button>
            )}
            {state === "done" && (
              <div className="rounded-xl bg-white/15 px-4 py-3 text-center text-sm font-medium backdrop-blur">
                ✓ Done for today — {att?.total_hours ? `${att.total_hours}h` : formatMin(liveWorkMin)} logged
              </div>
            )}
          </div>

          {/* Sub info */}
          <div className="flex items-center gap-3 text-xs text-white/70">
            {att?.check_in_time && (
              <span className="inline-flex items-center gap-1">
                <LogIn className="h-3 w-3" /> In {new Date(att.check_in_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {att?.check_out_time && (
              <span className="inline-flex items-center gap-1">
                <LogOut className="h-3 w-3" /> Out {new Date(att.check_out_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {att?.late_min > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-white/20 px-1.5 py-0.5">
                {att.late_min}m late
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={Clock}
          label="This week"
          value={formatMin(stats?.week_minutes ?? 0)}
          tone="text-blue-600"
        />
        <KpiCard
          icon={CalendarCheck2}
          label="Present (mo)"
          value={String(stats?.month_present ?? 0)}
          hint={`${stats?.month_late ?? 0} late`}
          tone="text-emerald-600"
        />
        <KpiCard
          icon={Plane}
          label="Leave left"
          value={String(stats?.leave_remaining ?? 0)}
          hint="days"
          tone="text-violet-600"
        />
        <KpiCard
          icon={TrendingUp}
          label="Overtime"
          value={formatMin(stats?.month_ot_minutes ?? 0)}
          hint="this month"
          tone="text-amber-600"
        />
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink to="/me/attendance" icon={CalendarCheck2} title="Attendance" desc="Calendar & log" />
        <QuickLink to="/me/leave" icon={Plane} title="Leave" desc="Apply & balance" />
        <QuickLink to="/me/payslips" icon={Wallet} title="Payslips" desc="Salary & YTD" />
      </div>

      {/* Recent payslips */}
      {stats?.latest_payslips && stats.latest_payslips.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <h3 className="font-semibold">Recent payslips</h3>
            </div>
            <Link to="/me/payslips" className="text-xs text-primary inline-flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y">
            {(stats.latest_payslips as any[]).slice(0, 4).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {p.hr_payroll_runs?.month
                      ? new Date(p.hr_payroll_runs.year, p.hr_payroll_runs.month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.paid_at ? "Paid" : p.hr_payroll_runs?.status || "Draft"}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold">৳{Number(p.net_pay || 0).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, hint, tone,
}: { icon: any; label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", tone)} />
        {label}
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function QuickLink({ to, icon: Icon, title, desc }: { to: string; icon: any; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}