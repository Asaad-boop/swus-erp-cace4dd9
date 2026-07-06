import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Globe, CheckCircle2, ShoppingBag, PenSquare, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Range = { from: Date; to: Date };

const CONFIRMED = ["complete", "advance_payment", "on_hold"] as const;

// Human labels + color per web_status
const STATUS_META: Record<string, { label: string; tone: string }> = {
  complete:              { label: "Complete",             tone: "bg-emerald-500" },
  advance_payment:       { label: "Advance Payment",      tone: "bg-emerald-400" },
  on_hold:               { label: "On Hold",              tone: "bg-amber-400" },
  processing:            { label: "Processing",           tone: "bg-indigo-400" },
  no_response:           { label: "No Response",          tone: "bg-slate-400" },
  good_but_no_response:  { label: "Good · No Response",   tone: "bg-slate-500" },
  incomplete:            { label: "Incomplete",           tone: "bg-orange-400" },
  cancelled:             { label: "Cancelled",            tone: "bg-rose-500" },
};

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
          tone: STATUS_META[key]?.tone ?? "bg-slate-300",
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
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="size-4 text-indigo-600 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 truncate">Website Orders & Today's Sales</h3>
          <span className="text-[11px] text-slate-500 truncate">· {rangeLabel}</span>
        </div>
        <Link to={"/erp/orders/web" as any} className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-0.5">
          Open <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        {/* LEFT: KPI numbers */}
        <div className="p-4 space-y-3">
          {/* Website in range */}
          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              icon={ShoppingBag}
              label={`Website orders · ${rangeLabel}`}
              value={data?.total ?? 0}
              tone="indigo"
              loading={isLoading}
            />
            <MiniStat
              icon={CheckCircle2}
              label="Website confirmed"
              value={data?.confirmed ?? 0}
              sub={data ? `${data.confirmRate.toFixed(0)}% confirm rate` : undefined}
              tone="emerald"
              loading={isLoading}
            />
          </div>

          {/* Today split */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500 mb-2">
              Today's Sales · {data?.todayAll ?? 0} total
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TodayCell
                icon={PenSquare}
                label="Manual created"
                value={data?.todayManual ?? 0}
                tone="violet"
                loading={isLoading}
              />
              <TodayCell
                icon={CheckCircle2}
                label="Website confirmed"
                value={data?.todayWebConfirmed ?? 0}
                tone="emerald"
                loading={isLoading}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Status breakdown */}
        <div className="p-4">
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500 mb-2">
            Website status breakdown · {rangeLabel}
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : (data?.status.length ?? 0) === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">No website orders in this range</div>
          ) : (
            <div className="space-y-1.5">
              {data!.status.map((s) => {
                const pct = data!.total > 0 ? (s.count / data!.total) * 100 : 0;
                return (
                  <div key={s.key} className="grid grid-cols-[minmax(120px,1fr)_minmax(0,2fr)_auto] items-center gap-2 text-[12px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("size-2 rounded-full shrink-0", s.tone)} />
                      <span className="text-slate-700 truncate">{s.label}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={cn("h-full rounded-full", s.tone)} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="tabular-nums text-slate-700 font-medium text-right w-14">
                      {s.count} <span className="text-slate-400 text-[10.5px]">· {pct.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon, label, value, sub, tone, loading,
}: { icon: any; label: string; value: number; sub?: string; tone: string; loading: boolean }) {
  const fg = tone === "indigo" ? "text-indigo-600"
          : tone === "emerald" ? "text-emerald-600"
          : tone === "violet" ? "text-violet-600" : "text-slate-600";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500 truncate">{label}</span>
        <Icon className={cn("size-3.5 shrink-0", fg)} />
      </div>
      {loading ? <Skeleton className="h-6 w-14" /> : (
        <div className="text-[22px] leading-none font-semibold tabular-nums text-slate-900">{value}</div>
      )}
      {sub && <div className="mt-1.5 text-[11px] text-slate-500 truncate">{sub}</div>}
    </div>
  );
}

function TodayCell({
  icon: Icon, label, value, tone, loading,
}: { icon: any; label: string; value: number; tone: string; loading: boolean }) {
  const fg = tone === "emerald" ? "text-emerald-600" : tone === "violet" ? "text-violet-600" : "text-slate-600";
  return (
    <div className="rounded-md bg-white border border-slate-200 p-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-slate-500 mb-1">
        <Icon className={cn("size-3", fg)} />
        <span className="truncate">{label}</span>
      </div>
      {loading ? <Skeleton className="h-5 w-10" /> : (
        <div className="text-[18px] leading-none font-semibold tabular-nums text-slate-900">{value}</div>
      )}
    </div>
  );
}