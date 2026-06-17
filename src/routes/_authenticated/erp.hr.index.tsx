import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, UserPlus, UserMinus, Wallet, Cake, PartyPopper, Activity, Clock, AlertTriangle, FileText, CheckCircle2, XCircle, ArrowRight, Building2, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, CartesianGrid } from "recharts";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { SectionLabel } from "@/components/erp/hr/ui/section-label";
import { StatCard } from "@/components/erp/hr/ui/stat-card";
import { StatusPill } from "@/components/erp/hr/ui/status-pill";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";
import { SkeletonCard } from "@/components/erp/hr/ui/skeletons";
import { HrAvatar } from "@/components/erp/hr/ui/avatar";
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
  const headcount = k?.headcount ?? 0;
  const presentPct = headcount > 0 ? Math.round((todayCounts.present / headcount) * 100) : 0;

  return (
    <div className="bg-[#FAFAFA] min-h-screen">
      <HrSubnav />
      <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
        <PageHeader
          title="HR Dashboard"
          subtitle={`Workforce snapshot · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
          actions={
            <Link
              to="/erp/hr/employees/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <UserPlus className="h-4 w-4" /> Add Employee
            </Link>
          }
        />

        {/* HERO KPI ROW */}
        <div>
          <SectionLabel>Today at a glance</SectionLabel>
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Present Today" value={todayCounts.present} icon={CheckCircle2} accent="emerald" hint={`${presentPct}% of ${headcount} employees`} loading={isLoading} />
            <StatCard label="Absent" value={todayCounts.absent} icon={XCircle} accent="red" hint="Marked or unmarked today" />
            <StatCard label="On Leave" value={todayCounts.on_leave} icon={UserMinus} accent="blue" hint="Approved leaves active today" />
            <StatCard label="Late Today" value={todayCounts.late} icon={Clock} accent="amber" hint="Past grace period" />
          </div>
        </div>

        {/* SECONDARY ROW */}
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Pending leaves</SectionLabel>
              <Link to="/erp/hr/leave" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{extras?.pendingLeaves?.length ?? 0}</div>
            {(extras?.pendingLeaves ?? []).length > 0 ? (
              <div className="mt-4 space-y-2.5">
                {(extras?.pendingLeaves ?? []).slice(0, 3).map((l: any) => (
                  <div key={l.id} className="flex items-center gap-2.5 text-sm">
                    <HrAvatar name={l.hr_employees?.full_name} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{l.hr_employees?.full_name ?? "—"}</div>
                      <div className="text-xs text-gray-500">{l.from_date} → {l.to_date} · {l.days}d</div>
                    </div>
                    <StatusPill tone="pending">Pending</StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-xs text-gray-500">No pending requests 🎉</div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Payroll · {new Date().toLocaleString("en", { month: "long" })}</SectionLabel>
              <Link to="/erp/hr/payroll" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
                Open <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <div className="text-3xl font-bold text-gray-900 tabular-nums">{fmtBdt(k?.totalMonthlyPayroll ?? 0)}</div>
            </div>
            <div className="mt-2">
              {payStatus?.exists ? (
                <StatusPill tone={payStatus.status === "finalized" ? "finalized" : "draft"} dot>
                  {payStatus.status === "finalized" ? "Finalized" : "Draft"}
                </StatusPill>
              ) : (
                <StatusPill tone="pending" dot>Not generated</StatusPill>
              )}
            </div>
            <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${payStatus?.status === "finalized" ? "bg-emerald-500" : payStatus?.exists ? "bg-amber-500" : "bg-gray-300"}`}
                style={{ width: payStatus?.status === "finalized" ? "100%" : payStatus?.exists ? "60%" : "10%" }}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Documents expiring</SectionLabel>
              {(extras?.expiringDocs?.length ?? 0) > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            </div>
            <div className="text-3xl font-bold text-gray-900 tabular-nums">{extras?.expiringDocs?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">Within next 30 days</div>
            {(extras?.expiringDocs ?? []).length > 0 ? (
              <div className="mt-4 space-y-1.5">
                {(extras?.expiringDocs ?? []).slice(0, 3).map((d: any) => (
                  <Link
                    key={d.id}
                    to="/erp/hr/employees/$id"
                    params={{ id: d.employee_id }}
                    className="flex items-center gap-2 text-sm p-1.5 -mx-1.5 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="truncate flex-1 text-gray-700">{d.title}</span>
                    <span className="text-xs text-gray-500 shrink-0">{d.expiry_date}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-xs text-gray-500">All documents up to date.</div>
            )}
          </div>
        </div>

        {/* CHARTS */}
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <SectionLabel>Attendance trend</SectionLabel>
                <div className="text-sm text-gray-500 mt-0.5">Last 30 days</div>
              </div>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </div>
            <div className="h-64">
              {isLoading ? (
                <SkeletonCard rows={4} className="border-0 shadow-none p-0" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={extras?.trend ?? []} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                      labelStyle={{ color: "#6B7280", fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="count" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3, fill: "#4F46E5", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionLabel>Leave distribution</SectionLabel>
            {(extras?.leaveDistribution ?? []).length === 0 ? (
              <div className="h-64 flex items-center justify-center">
                <EmptyState icon={CalendarDaysIcon} title="No leaves yet" />
              </div>
            ) : (
              <div className="h-64 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={extras?.leaveDistribution ?? []} dataKey="count" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                      {(extras?.leaveDistribution ?? []).map((d: any, i: number) => (
                        <Cell key={i} fill={d.color || ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6"][i % 6]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {(extras?.leaveDistribution ?? []).length > 0 && (
              <div className="mt-3 space-y-1.5">
                {(extras?.leaveDistribution ?? []).slice(0, 4).map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color || ["#4F46E5", "#10B981", "#F59E0B", "#EF4444"][i % 4] }} />
                      <span className="text-gray-700">{d.name}</span>
                    </div>
                    <span className="font-medium text-gray-900 tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DEPT HEADCOUNT + BIRTHDAYS */}
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionLabel>Headcount by department</SectionLabel>
              <Building2 className="h-4 w-4 text-gray-400" />
            </div>
            {(k?.byDepartment ?? []).length === 0 ? (
              <EmptyState icon={Building2} title="No departments yet" description="Add departments to see headcount distribution." />
            ) : (
              <div className="space-y-3">
                {(k?.byDepartment ?? []).slice(0, 8).map((d) => {
                  const max = Math.max(...(k?.byDepartment ?? []).map((x) => x.count), 1);
                  const pct = (d.count / max) * 100;
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-gray-700">{d.name}</span>
                        <span className="text-gray-500 tabular-nums">{d.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <SectionLabel>Birthdays & anniversaries · this month</SectionLabel>
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                  <Cake className="h-3.5 w-3.5 text-pink-500" /> Birthdays
                </div>
                {(k?.upcomingBirthdays ?? []).length === 0 ? (
                  <div className="text-xs text-gray-500 py-2">No birthdays in next 30 days.</div>
                ) : (
                  <div className="space-y-1.5">
                    {(k?.upcomingBirthdays ?? []).slice(0, 4).map((b) => (
                      <div key={b.id} className="flex items-center gap-2.5">
                        <HrAvatar name={b.name} size={28} />
                        <span className="text-sm text-gray-700 flex-1 truncate">{b.name}</span>
                        <StatusPill tone={b.in === 0 ? "approved" : "neutral"}>
                          {b.in === 0 ? "Today 🎂" : `in ${b.in}d`}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                  <PartyPopper className="h-3.5 w-3.5 text-amber-500" /> Work anniversaries
                </div>
                {(k?.upcomingAnniversaries ?? []).length === 0 ? (
                  <div className="text-xs text-gray-500 py-2">No upcoming anniversaries.</div>
                ) : (
                  <div className="space-y-1.5">
                    {(k?.upcomingAnniversaries ?? []).slice(0, 4).map((a) => (
                      <div key={a.id} className="flex items-center gap-2.5">
                        <HrAvatar name={a.name} size={28} />
                        <span className="text-sm text-gray-700 flex-1 truncate">
                          {a.name} <span className="text-gray-400">· {a.years}y</span>
                        </span>
                        <StatusPill tone={a.in === 0 ? "approved" : "neutral"}>
                          {a.in === 0 ? "Today" : `in ${a.in}d`}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MINI STATS FOOTER */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total headcount" value={k?.headcount ?? 0} icon={Users} accent="indigo" loading={isLoading} />
          <StatCard label="New this month" value={k?.newThisMonth ?? 0} icon={UserPlus} accent="emerald" />
          <StatCard label="Active shifts" value={(k as any)?.activeShifts ?? "—"} icon={Activity} accent="blue" />
          <StatCard label="Monthly payroll" value={fmtBdt(k?.totalMonthlyPayroll ?? 0)} icon={Wallet} accent="slate" loading={isLoading} />
        </div>
      </div>
    </div>
  );
}

// fallback icon for empty pie state — Lucide doesn't have CalendarDaysIcon shorthand
import { CalendarDays as CalendarDaysIcon } from "lucide-react";