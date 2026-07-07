import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { data, isLoading } = useQuery({
    queryKey: ["dash-web-overview", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const inR = (q: any) => q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());

      // Today (start of local day) — used for "Today's Sales" split.
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
      const inToday = (q: any) => q.gte("created_at", startToday.toISOString()).lte("created_at", endToday.toISOString());

      const [webRange, todayManual, todayWebConfirmed, todayAll] = await Promise.all([
        inR(applyBrandScope(supabase.from("orders").select("web_status,source"), brandIds))
          .in("source", ["website", "pixel"]),
        inToday(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .eq("source", "manual"),
        inToday(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .in("source", ["website", "pixel"])
          .in("web_status", CONFIRMED as unknown as string[]),
        inToday(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)),
      ]);

      const rows = (webRange.data ?? []) as { web_status: string | null }[];
      const total = rows.length;
      const statusCounts: Record<string, number> = {};
      let confirmed = 0;
      for (const r of rows) {
        const s = r.web_status ?? "unknown";
        statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        if (CONFIRMED.includes(s as any)) confirmed += 1;
      }

      const status = Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({
          key,
          count,
          label: STATUS_META[key]?.label ?? key,
          color: STATUS_META[key]?.color ?? FALLBACK_COLOR,
        }));

      return {
        total,
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
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground truncate">
          Website Orders · {rangeLabel}
        </div>
        <Link to={"/erp/orders/web" as any} className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-0.5">
          View <ArrowRight className="size-3" />
        </Link>
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

        {/* RIGHT: status list */}
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground mb-3">
            Status breakdown
          </div>
          {isLoading ? (
            <div className="flex items-center gap-5">
              <Skeleton className="size-32 rounded-full" />
              <div className="flex-1 space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-3 w-full" />)}
              </div>
            </div>
          ) : (data?.status.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">No website orders in this range</div>
          ) : (
            <StatusDonut segments={data!.status} total={data!.total} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDonut({
  segments, total,
}: { segments: { key: string; count: number; label: string; color: string }[]; total: number }) {
  // SVG donut geometry
  const size = 132;
  const stroke = 16;
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
    <div className="flex items-center gap-5">
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
              className="transition-[stroke-dasharray] duration-500"
            >
              <title>{`${a.label}: ${a.count} · ${a.pct.toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[9px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">Total</div>
          <div className="text-xl font-semibold tabular-nums tracking-tight text-slate-900 leading-none mt-0.5">
            {total}
          </div>
        </div>
      </div>

      <ul className="flex-1 min-w-0 space-y-1.5">
        {arcs.map((s) => (
          <li
            key={s.key}
            className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-[12px]"
          >
            <span
              className="size-2 rounded-[3px] shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-slate-700 truncate">{s.label}</span>
            <span className="tabular-nums text-slate-500 text-right text-[11px]">
              <span className="font-semibold text-slate-800">{s.count}</span>
              <span className="text-slate-400"> · {s.pct.toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
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