import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, UserPlus, UserMinus, Wallet, Cake, PartyPopper, ShieldAlert, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { getHrKpis } from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/")({
  head: () => ({ meta: [{ title: "HR Dashboard" }] }),
  component: HrDashboard,
});

function fmtBdt(n: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}`;
}

function HrDashboard() {
  const kpisFn = useServerFn(getHrKpis);
  const { data: k, isLoading } = useQuery({ queryKey: ["hr-kpis"], queryFn: () => kpisFn() });

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">HR Dashboard</h1>
            <p className="text-sm text-muted-foreground">Workforce snapshot</p>
          </div>
          <Link
            to="/erp/hr/employees/new"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" /> Add Employee
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={Users} label="Headcount" value={k?.headcount ?? 0} loading={isLoading} />
          <StatCard icon={Activity} label="Active" value={k?.active ?? 0} tone="text-emerald-600" loading={isLoading} />
          <StatCard icon={ShieldAlert} label="Probation" value={k?.probation ?? 0} tone="text-amber-600" loading={isLoading} />
          <StatCard icon={UserMinus} label="On Leave" value={k?.onLeave ?? 0} tone="text-blue-600" loading={isLoading} />
          <StatCard icon={UserPlus} label="New this month" value={k?.newThisMonth ?? 0} tone="text-emerald-600" loading={isLoading} />
          <StatCard icon={Wallet} label="Monthly payroll" value={fmtBdt(k?.totalMonthlyPayroll ?? 0)} loading={isLoading} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="text-sm font-semibold mb-3">Headcount by department</div>
              {(k?.byDepartment ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No data yet.</div>
              ) : (
                <div className="space-y-2">
                  {(k?.byDepartment ?? []).slice(0, 8).map((d) => {
                    const max = Math.max(...(k?.byDepartment ?? []).map((x) => x.count), 1);
                    return (
                      <div key={d.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium">{d.name}</span>
                          <span className="text-muted-foreground">{d.count}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${(d.count / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Cake className="h-4 w-4 text-pink-500" /> Upcoming birthdays
              </div>
              {(k?.upcomingBirthdays ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No birthdays in next 30 days.</div>
              ) : (
                <div className="space-y-1.5">
                  {(k?.upcomingBirthdays ?? []).map((b) => (
                    <div key={b.id} className="flex justify-between text-sm">
                      <span>{b.name}</span>
                      <Badge variant="secondary">{b.in === 0 ? "Today" : `in ${b.in}d`}</Badge>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-sm font-semibold mt-5 mb-3 flex items-center gap-2">
                <PartyPopper className="h-4 w-4 text-amber-500" /> Work anniversaries
              </div>
              {(k?.upcomingAnniversaries ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No upcoming anniversaries.</div>
              ) : (
                <div className="space-y-1.5">
                  {(k?.upcomingAnniversaries ?? []).map((a) => (
                    <div key={a.id} className="flex justify-between text-sm">
                      <span>{a.name} <span className="text-muted-foreground">· {a.years}y</span></span>
                      <Badge variant="secondary">{a.in === 0 ? "Today" : `in ${a.in}d`}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone, loading }: {
  icon: typeof Users; label: string; value: number | string; tone?: string; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Icon className={`h-3.5 w-3.5 ${tone ?? ""}`} />
          {label}
        </div>
        <div className="text-2xl font-bold">{loading ? "…" : value}</div>
      </CardContent>
    </Card>
  );
}