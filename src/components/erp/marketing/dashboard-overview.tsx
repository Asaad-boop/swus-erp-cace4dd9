import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  ShoppingBag,
  TrendingUp,
  Target,
  Receipt,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDashboardSummary,
  type DashboardSummary,
} from "@/lib/erp/marketing/dashboard.functions";

const fmtBDT = (n: number) =>
  `৳${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtUSD = (n: number) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtMult = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);
const fmtNum = (n: number) => Number(n).toLocaleString();

export function DashboardOverview({ brandId }: { brandId: string }) {
  const fn = useServerFn(getDashboardSummary);
  const q = useQuery({
    queryKey: ["mkt", "dashboard-summary", brandId],
    queryFn: () => fn({ data: { brandId } }),
    enabled: !!brandId,
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 minutes
  });

  if (q.isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }
  const d: DashboardSummary | undefined = q.data;
  if (!d) return null;

  const showToday = d.today.spend_bdt > 0 || d.today.attributed_orders > 0;
  const showTrend = d.trend7d.some((r) => r.spend_bdt > 0 || r.confirmed_revenue_bdt > 0);
  const showTop = d.topCampaigns.length > 0;
  const showPacing = d.budgetPacing.length > 0;

  return (
    <div className="space-y-5">
      {/* TODAY STRIP */}
      {showToday && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Today · {d.today.date_bd} (auto-refresh 5 min)
            </h2>
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
            <TodayKpi
              icon={Wallet}
              label="Spend Today"
              value={fmtBDT(d.today.spend_bdt)}
              sub={fmtUSD(d.today.spend_usd)}
            />
            <TodayKpi
              icon={Receipt}
              label="Revenue Today"
              value={fmtBDT(d.today.confirmed_revenue_bdt)}
              sub={`${d.today.confirmed_orders} confirmed`}
            />
            <TodayKpi
              icon={Activity}
              label="Meta ROAS"
              value={fmtMult(d.today.meta_roas)}
              sub="Meta reported"
            />
            <TodayKpi
              icon={TrendingUp}
              label="Real ROAS"
              value={fmtMult(d.today.confirmed_roas)}
              sub="Confirmed revenue"
              tone={
                d.today.confirmed_roas != null && d.today.confirmed_roas >= 2
                  ? "good"
                  : d.today.confirmed_roas != null && d.today.confirmed_roas < 1
                    ? "bad"
                    : undefined
              }
            />
            <TodayKpi
              icon={ShoppingBag}
              label="Orders Today"
              value={fmtNum(d.today.attributed_orders)}
              sub={`Meta: ${d.today.meta_orders}`}
            />
            <TodayKpi
              icon={Target}
              label="CPO"
              value={d.today.cpo_bdt != null ? fmtBDT(d.today.cpo_bdt) : "—"}
              sub="Cost / confirmed order"
            />
          </div>
        </section>
      )}

      {/* ROAS COMPARISON */}
      {showToday && d.today.spend_bdt > 0 && (
        <Card className="rounded-xl border-gray-100 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-base">ROAS Reality Check — Today</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <RoasRow
                label="Meta ROAS"
                hint="Meta reported conversions / spend"
                value={d.today.meta_roas}
                tone="meta"
              />
              <RoasRow
                label="Confirmed ROAS"
                hint="Confirmed orders ÷ spend (real)"
                value={d.today.confirmed_roas}
                tone="confirmed"
              />
              <RoasRow
                label="Delivered ROAS"
                hint="Delivered orders ÷ spend (actual cash)"
                value={d.today.delivered_roas}
                tone="delivered"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 7-DAY TREND */}
        {showTrend && (
          <Card className="rounded-xl border-gray-100 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-base">Spend vs Revenue — Last 7 days</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.trend7d} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => v.slice(5)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()
                    }
                  />
                  <RTooltip
                    formatter={(v: any) => fmtBDT(Number(v))}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="spend_bdt"
                    name="Spend"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="confirmed_revenue_bdt"
                    name="Confirmed Rev"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="delivered_revenue_bdt"
                    name="Delivered Rev"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* TOP 5 */}
        {showTop && (
          <Card className="rounded-xl border-gray-100 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-base">Top 5 Campaigns — Real ROAS (7d)</CardTitle>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={d.topCampaigns.map((c) => ({
                    name: c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name,
                    roas: Number((c.true_roas ?? 0).toFixed(2)),
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 80, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={150}
                  />
                  <RTooltip
                    formatter={(v: any) => `${Number(v).toFixed(2)}×`}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="roas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* BUDGET PACING */}
      {showPacing && (
        <Card className="rounded-xl border-gray-100 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-base">Budget Pacing — Active Campaigns (Today)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <BudgetSummaryStrip rows={d.budgetPacing} />
            {d.budgetPacing.map((p) => (
              <BudgetRow key={p.campaign_id} row={p} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TodayKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card className="rounded-xl border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-150">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#1877F2]/8 text-[#1877F2]">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
        <div
          className={cn(
            "text-2xl font-bold tabular-nums leading-tight",
            tone === "good" && "text-emerald-600",
            tone === "bad" && "text-red-600",
          )}
        >
          {value}
        </div>
        {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function RoasRow({
  label,
  hint,
  value,
  tone,
}: {
  label: string;
  hint: string;
  value: number | null;
  tone: "meta" | "confirmed" | "delivered";
}) {
  const cls = {
    meta:      { text: "text-[#1877F2]", bg: "bg-[#1877F2]/8",  ring: "ring-[#1877F2]/20" },
    confirmed: { text: "text-purple-600", bg: "bg-purple-50",   ring: "ring-purple-200" },
    delivered: { text: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  }[tone];
  return (
    <div className={cn("rounded-xl border border-gray-100 p-5 ring-1", cls.bg, cls.ring)}>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
        {label}
      </div>
      <div className={cn("text-3xl font-bold tabular-nums", cls.text)}>
        {fmtMult(value)}
      </div>
      <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>
    </div>
  );
}

function BudgetRow({ row }: { row: DashboardSummary["budgetPacing"][number] }) {
  const pct = Math.min(100, row.pct);
  const tone =
    row.status === "over"
      ? "bg-red-500"
      : row.status === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500";
  const badge =
    row.status === "over" ? (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 animate-pulse">🔴 Over</Badge>
    ) : row.status === "warn" ? (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">🟡 Near</Badge>
    ) : (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">🟢 On track</Badge>
    );
  const projected = row.projected_monthly_bdt || row.spent_today_bdt * 30;
  const projectedUsd = row.projected_monthly_usd || row.spent_today_usd * 30;
  const hasLifetime = row.lifetime_budget_bdt != null && row.lifetime_budget_bdt > 0;
  const lifetimePct = Math.min(100, row.pct_lifetime ?? 0);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium truncate mr-2">{row.name}</span>
        {badge}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
        <span>
          Budget:{" "}
          <span className="text-foreground">{fmtBDT(row.daily_budget_bdt)}</span>
          <span className="text-muted-foreground/70"> ({fmtUSD(row.daily_budget_usd)})</span>/day
        </span>
        <span>·</span>
        <span>
          Spent:{" "}
          <span className="text-foreground">{fmtBDT(row.spent_today_bdt)}</span>
          <span className="text-muted-foreground/70"> ({fmtUSD(row.spent_today_usd)})</span>
        </span>
        <span>·</span>
        <span className="ml-auto tabular-nums font-medium">{row.pct.toFixed(0)}%</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", tone, row.status === "over" && "animate-pulse")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hasLifetime && (
        <div className="mt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>
              Lifetime:{" "}
              <span className="text-foreground">{fmtBDT(row.lifetime_budget_bdt!)}</span>
              <span className="text-muted-foreground/70"> ({fmtUSD(row.lifetime_budget_usd ?? 0)})</span>
            </span>
            <span>·</span>
            <span>
              MTD:{" "}
              <span className="text-foreground">{fmtBDT(row.spent_this_month_bdt)}</span>
              <span className="text-muted-foreground/70"> ({fmtUSD(row.spent_this_month_usd)})</span>
            </span>
            <span className="ml-auto tabular-nums font-medium">{lifetimePct.toFixed(0)}%</span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${lifetimePct}%` }} />
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-1">
        Projected ~ {fmtBDT(projected)} ({fmtUSD(projectedUsd)})/month at current pace
      </div>
    </div>
  );
}

function BudgetSummaryStrip({ rows }: { rows: DashboardSummary["budgetPacing"] }) {
  const totalDaily = rows.reduce((s, r) => s + r.daily_budget_bdt, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent_today_bdt, 0);
  const overCount = rows.filter((r) => r.status === "over").length;
  const overallPct = totalDaily > 0 ? (totalSpent / totalDaily) * 100 : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border bg-muted/30 p-3">
      <SummaryStat label="Total Daily Budget" value={fmtBDT(totalDaily)} />
      <SummaryStat label="Spent Today" value={fmtBDT(totalSpent)} sub={`${overallPct.toFixed(0)}% used`} />
      <SummaryStat label="Active Campaigns" value={String(rows.length)} />
      <SummaryStat
        label="Over Limit"
        value={String(overCount)}
        tone={overCount > 0 ? "bad" : undefined}
      />
    </div>
  );
}

function SummaryStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums mt-0.5", tone === "bad" && "text-red-600 animate-pulse")}>
        {value}
      </div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
