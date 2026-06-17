import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, UserPlus, UserMinus, Wallet, Cake, PartyPopper, ShieldAlert, Activity, Clock, AlertTriangle, FileText } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { getHrKpis } from "@/lib/erp/hr/hr.functions";
import { getHrDashboardExtras } from "@/lib/erp/hr/reports.functions";
import { getCurrentMonthPayrollStatus } from "@/lib/erp/hr/payroll.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/")({
  head: () => ({ meta: [{ title: "HR Dashboard" }] }),
  component: HrDashboard,
});

function fmtBdt(n: number) {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n)}`;
}

function HrDashboard() {
  const kpisFn = useServerFn(getHrKpis);
  const extrasFn = useServerFn(getHrDashboardExtras);
  const payStatusFn = useServerFn(getCurrentMonthPayrollStatus);
  const { data: k, isLoading } = useQuery({ queryKey: ["hr-kpis"], queryFn: () => kpisFn() });
  const { data: extras } = useQuery({ queryKey: ["hr-dashboard-extras"], queryFn: () => extrasFn() });
  const { data: payStatus } = useQuery({ queryKey: ["hr-pay-status"], queryFn: () => payStatusFn() });

  const todayCounts = extras?.todayCounts ?? { present: 0, late: 0, absent: 0, on_leave: 0 };

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
          <StatCard icon={Activity} label="Today Present" value={todayCounts.present} tone="text-emerald-600" />
          <StatCard icon={Clock} label="Today Late" value={todayCounts.late} tone="text-amber-600" />
          <StatCard icon={UserMinus} label="On Leave" value={todayCounts.on_leave} tone="text-blue-600" />
          <StatCard icon={ShieldAlert} label="Pending Leaves" value={extras?.pendingLeaves?.length ?? 0} tone="text-amber-600" />
          <StatCard icon={Wallet} label="Monthly payroll" value={fmtBdt(k?.totalMonthlyPayroll ?? 0)} loading={isLoading} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={UserPlus} label="New this month" value={k?.newThisMonth ?? 0} tone="text-emerald-600" />
          <StatCard icon={Wallet} label={`Payroll ${new Date().toLocaleString("en", { month: "short" })}`} value={payStatus?.exists ? (payStatus.status === "finalized" ? "Finalized" : "Draft") : "Not generated"} tone={payStatus?.exists ? "text-emerald-600" : "text-amber-600"} />
          <StatCard icon={FileText} label="Documents expiring" value={extras?.expiringDocs?.length ?? 0} tone="text-amber-600" />
          <StatCard icon={AlertTriangle} label="Today Absent" value={todayCounts.absent} tone="text-red-600" />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="p-5">
              <div className="text-sm font-semibold mb-3">Attendance trend (last 30 days)</div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={extras?.trend ?? []}>
                    <XAxis dataKey="date" hide />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm font-semibold mb-3">Leave type distribution</div>
              {(extras?.leaveDistribution ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No approved leaves yet.</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={extras?.leaveDistribution ?? []} dataKey="count" nameKey="name" outerRadius={70} label>
                        {(extras?.leaveDistribution ?? []).map((d: any, i: number) => (
                          <Cell key={i} fill={d.color || `hsl(${i * 60}, 70%, 50%)`} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {(extras?.pendingLeaves ?? []).length > 0 && (
          <Card>
            <CardContent className="p-5">
              <div className="flex justify-between items-center mb-3">
                <div className="text-sm font-semibold">Pending leave requests</div>
                <Link to="/erp/hr/leave" className="text-xs text-primary hover:underline">Manage →</Link>
              </div>
              <div className="space-y-1.5">
                {(extras?.pendingLeaves ?? []).map((l: any) => (
                  <div key={l.id} className="flex justify-between items-center text-sm border-l-2 border-amber-500 pl-2 py-1">
                    <div>
                      <div className="font-medium">{l.hr_employees?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.from_date} to {l.to_date} · {l.days} days</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {(extras?.expiringDocs ?? []).length > 0 && (
          <Card className="border-amber-300 bg-amber-50/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-2">
                <AlertTriangle className="h-4 w-4" /> Documents expiring within 30 days
              </div>
              <div className="space-y-1 text-sm">
                {(extras?.expiringDocs ?? []).map((d: any) => (
                  <Link key={d.id} to="/erp/hr/employees/$id" params={{ id: d.employee_id }} className="block hover:underline">
                    {d.title} <span className="text-xs text-muted-foreground">· expires {d.expiry_date}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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