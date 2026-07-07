import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Check, RotateCcw, PieChart, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Range = { from: Date; to: Date };

const CONFIRMED = ["complete", "advance_payment", "on_hold"] as const;

// Human labels + color per web_status (hex used by donut SVG + dots)
const STATUS_META: Record<string, { label: string; color: string }> = {
  complete:              { label: "Complete",            color: "#10b981" },
  advance_payment:       { label: "Advance Payment",     color: "#34d399" },
  on_hold:               { label: "On Hold",             color: "#fbbf24" },
  processing:            { label: "Processing",          color: "#94a3b8" },
  no_response:           { label: "No Response",         color: "#cbd5e1" },
  good_but_no_response:  { label: "Good · No Response",  color: "#64748b" },
  incomplete:            { label: "Incomplete",          color: "#fb923c" },
  cancelled:             { label: "Cancelled",           color: "#f43f5e" },
};
const FALLBACK_COLOR = "#cbd5e1";

export function WebsiteOrdersOverview({
  brandIds, enabled, range, rangeLabel,
}: { brandIds: string[]; enabled: boolean; range: Range; rangeLabel: string }) {
  const [localRange, setLocalRange] = useState<Range | null>(null);
  const activeRange = localRange ?? range;
  const activeLabel = localRange ? formatRangeLabel(localRange) : rangeLabel;

  const { data, isLoading } = useQuery({
    queryKey: ["dash-web-overview", brandIds.join(","), activeRange.from.toISOString(), activeRange.to.toISOString()],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const inR = (q: any) => q.gte("created_at", activeRange.from.toISOString()).lte("created_at", activeRange.to.toISOString());

      // Today (start of local day) — used for "Today's Sales" split.
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
      const inToday = (q: any) => q.gte("created_at", startToday.toISOString()).lte("created_at", endToday.toISOString());

      const [webRange, todayManual, todayWebConfirmed, todayAll] = await Promise.all([
        inR(applyBrandScope(supabase.from("orders").select("web_status,source,total"), brandIds))
          .in("source", ["website", "pixel"]),
        inToday(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .eq("source", "manual"),
        inToday(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .in("source", ["website", "pixel"])
          .in("web_status", CONFIRMED as unknown as string[]),
        inToday(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)),
      ]);

      const rows = (webRange.data ?? []) as { web_status: string | null; total: number | null }[];
      const total = rows.length;
      const statusCounts: Record<string, number> = {};
      const statusValue: Record<string, number> = {};
      let confirmed = 0;
      let totalValue = 0;
      for (const r of rows) {
        const s = r.web_status ?? "unknown";
        const v = Number(r.total ?? 0);
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        statusValue[s] = (statusValue[s] ?? 0) + v;
        totalValue += v;
        if (CONFIRMED.includes(s as any)) confirmed += 1;
      }

      const status = Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({
          key,
          count,
          value: statusValue[key] ?? 0,
          label: STATUS_META[key]?.label ?? key,
          color: STATUS_META[key]?.color ?? FALLBACK_COLOR,
        }));

      return {
        total,
        totalValue,
        confirmed,
        confirmRate: total > 0 ? (confirmed / total) * 100 : 0,
        status,
        todayManual: todayManual.count ?? 0,
        todayWebConfirmed: todayWebConfirmed.count ?? 0,
        todayAll: todayAll.count ?? 0,
      };
    },
  });

  return (
    <div className="rounded-xl border border-border/70 bg-gradient-to-br from-card to-card/60 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground truncate">
            Website Orders
          </div>
          <span className="text-[11px] text-muted-foreground/70">·</span>
          <span className="text-[11px] font-medium text-foreground/70 truncate">{activeLabel}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <RangePickerPopover
            value={activeRange}
            isCustom={!!localRange}
            onChange={setLocalRange}
            onReset={() => setLocalRange(null)}
          />
          <Link to={"/erp/orders/web" as any} className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-0.5 px-1.5">
            View <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] divide-y lg:divide-y-0 lg:divide-x divide-border/60">
        {/* LEFT: numbers */}
        <div className="p-4 grid grid-cols-2 gap-4">
          <Stat label="Website orders" value={data?.total} loading={isLoading} />
          <Stat
            label="Confirmed"
            value={data?.confirmed}
            sub={data ? `${data.confirmRate.toFixed(0)}% rate` : undefined}
            loading={isLoading}
          />
          <Stat label="Today · Manual" value={data?.todayManual} loading={isLoading} />
          <Stat label="Today · Web confirmed" value={data?.todayWebConfirmed} loading={isLoading} />
        </div>

        {/* RIGHT: status breakdown */}
        <StatusPanel data={data} isLoading={isLoading} />
      </div>
    </div>
  );
}

function StatusPanel({ data, isLoading }: { data: any; isLoading: boolean }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
          Status breakdown
        </div>
        <div className="inline-flex items-center rounded-md border border-border/70 bg-background p-0.5 text-[11px]">
          <button
            onClick={() => setView("chart")}
            className={cn(
              "px-2 py-0.5 rounded-[5px] inline-flex items-center gap-1 transition-colors",
              view === "chart" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <PieChart className="size-3" /> Chart
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "px-2 py-0.5 rounded-[5px] inline-flex items-center gap-1 transition-colors",
              view === "table" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <Table2 className="size-3" /> Table
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-5">
          <Skeleton className="size-40 rounded-full" />
          <div className="flex-1 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-3 w-full" />)}
          </div>
        </div>
      ) : (data?.status.length ?? 0) === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">No website orders in this range</div>
      ) : view === "chart" ? (
        <StatusDonut segments={data.status} total={data.total} totalValue={data.totalValue} />
      ) : (
        <StatusTable segments={data.status} total={data.total} totalValue={data.totalValue} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Date + time range picker (presets + custom)
// -----------------------------------------------------------------------------

function RangePickerPopover({
  value, isCustom, onChange, onReset,
}: {
  value: Range;
  isCustom: boolean;
  onChange: (r: Range) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => toLocalInput(value.from));
  const [to, setTo] = useState(() => toLocalInput(value.to));

  const presets = useMemo(() => ([
    { key: "today", label: "Today", make: () => dayRange(0, 0) },
    { key: "yday",  label: "Yesterday", make: () => dayRange(1, 1) },
    { key: "7d",    label: "Last 7 days", make: () => dayRange(6, 0) },
    { key: "30d",   label: "Last 30 days", make: () => dayRange(29, 0) },
    { key: "mtd",   label: "Month to date", make: () => monthToDate() },
    { key: "1h",    label: "Last 1 hour", make: () => hoursBack(1) },
    { key: "6h",    label: "Last 6 hours", make: () => hoursBack(6) },
    { key: "24h",   label: "Last 24 hours", make: () => hoursBack(24) },
  ]), []);

  const apply = () => {
    const f = new Date(from); const t = new Date(to);
    if (isNaN(+f) || isNaN(+t) || f > t) return;
    onChange({ from: f, to: t });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) { setFrom(toLocalInput(value.from)); setTo(toLocalInput(value.to)); }
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 text-[11px] font-medium",
            isCustom && "border-blue-500/60 text-blue-700 bg-blue-50/60 hover:bg-blue-50"
          )}
        >
          <CalendarClock className="size-3.5" />
          {isCustom ? "Custom" : "Range"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 pointer-events-auto">
        <div className="grid grid-cols-[130px_minmax(0,1fr)]">
          <div className="border-r border-border/60 bg-muted/30 p-1.5 space-y-0.5">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => { onChange(p.make()); setOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded-md text-[12px] hover:bg-background hover:shadow-sm transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-3 space-y-2.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Custom range (with time)
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">From</span>
              <Input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 text-xs"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">To</span>
              <Input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 text-xs"
              />
            </label>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1"
                onClick={() => { onReset(); setOpen(false); }}>
                <RotateCcw className="size-3" /> Reset
              </Button>
              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={apply}>
                <Check className="size-3" /> Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dayRange(startDaysAgo: number, endDaysAgo: number): Range {
  const from = new Date(); from.setDate(from.getDate() - startDaysAgo); from.setHours(0, 0, 0, 0);
  const to = new Date(); to.setDate(to.getDate() - endDaysAgo); to.setHours(23, 59, 59, 999);
  return { from, to };
}
function monthToDate(): Range {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from, to: now };
}
function hoursBack(h: number): Range {
  const to = new Date();
  const from = new Date(to.getTime() - h * 3600_000);
  return { from, to };
}
function formatRangeLabel(r: Range) {
  const sameDay = r.from.toDateString() === r.to.toDateString();
  const fmtD = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fmtT = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? `${fmtD(r.from)} · ${fmtT(r.from)}–${fmtT(r.to)}`
    : `${fmtD(r.from)} ${fmtT(r.from)} → ${fmtD(r.to)} ${fmtT(r.to)}`;
}

type Segment = { key: string; count: number; value: number; label: string; color: string };

function fmtMoney(n: number) {
  return "৳" + Math.round(n).toLocaleString();
}

function StatusDonut({
  segments, total, totalValue,
}: { segments: Segment[]; total: number; totalValue: number }) {
  // SVG donut geometry
  const size = 180;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let acc = 0;
  const arcs = segments.map((s) => {
    const frac = total > 0 ? s.count / total : 0;
    const dash = frac * c;
    const offset = -acc * c; // rotate to next slot
    acc += frac;
    return { ...s, dash, gap: c - dash, offset, pct: frac * 100 };
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          {/* track */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={a.offset}
              className="transition-[stroke-dasharray] duration-500 hover:opacity-80"
            >
              <title>{`${a.label}: ${a.count} · ${a.pct.toFixed(1)}% · ${fmtMoney(a.value)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[9px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">Total Orders</div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 leading-none mt-1">
            {total.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">
            {fmtMoney(totalValue)}
          </div>
        </div>
      </div>

      <ul className="flex-1 min-w-0 space-y-2 max-h-[200px] overflow-y-auto pr-1">
        {arcs.map((s) => (
          <li
            key={s.key}
            className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 text-[12px] hover:bg-slate-50 -mx-1 px-1 py-0.5 rounded"
          >
            <span
              className="size-2.5 rounded-full shrink-0 mt-1"
              style={{ backgroundColor: s.color }}
            />
            <div className="min-w-0">
              <div className="text-slate-800 font-medium truncate">
                {s.label} <span className="text-slate-400 font-normal">({s.count})</span>
              </div>
              <div className="text-[10.5px] text-muted-foreground tabular-nums">{fmtMoney(s.value)}</div>
            </div>
            <span className="tabular-nums text-[11px] font-semibold text-slate-600 self-center">
              {s.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusTable({
  segments, total, totalValue,
}: { segments: Segment[]; total: number; totalValue: number }) {
  return (
    <div className="rounded-md border border-border/60 overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Status</th>
            <th className="text-right px-3 py-2 font-semibold">Orders</th>
            <th className="text-right px-3 py-2 font-semibold">Value</th>
            <th className="text-right px-3 py-2 font-semibold">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {segments.map((s) => {
            const pct = total > 0 ? (s.count / total) * 100 : 0;
            return (
              <tr key={s.key} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-800 truncate">{s.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{s.count}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtMoney(s.value)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
          <tr className="bg-muted/30 font-semibold">
            <td className="px-3 py-2 text-slate-800">Total</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{total}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmtMoney(totalValue)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-500">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, sub, loading }: { label: string; value?: number; sub?: string; loading: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-14" />
      ) : (
        <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value ?? 0}</div>
      )}
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}