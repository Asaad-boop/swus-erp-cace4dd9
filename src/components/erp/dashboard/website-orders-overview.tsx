import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Range = { from: Date; to: Date };

const CONFIRMED = ["complete", "advance_payment", "on_hold"] as const;

// Human labels + color per web_status
const STATUS_META: Record<string, { label: string; tone: string }> = {
  complete:              { label: "Complete",            tone: "bg-emerald-500" },
  advance_payment:       { label: "Advance Payment",     tone: "bg-emerald-400" },
  on_hold:               { label: "On Hold",             tone: "bg-amber-400" },
  processing:            { label: "Processing",          tone: "bg-slate-400" },
  no_response:           { label: "No Response",         tone: "bg-slate-300" },
  good_but_no_response:  { label: "Good · No Response",  tone: "bg-slate-400" },
  incomplete:            { label: "Incomplete",          tone: "bg-orange-400" },
  cancelled:             { label: "Cancelled",           tone: "bg-rose-500" },
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
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          ) : (data?.status.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">No website orders in this range</div>
          ) : (
            <div className="space-y-2">
              {data!.status.map((s) => {
                const pct = data!.total > 0 ? (s.count / data!.total) * 100 : 0;
                return (
                  <div key={s.key} className="grid grid-cols-[minmax(110px,1fr)_minmax(0,2fr)_auto] items-center gap-3 text-[12px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("size-1.5 rounded-full shrink-0", s.tone)} />
                      <span className="text-slate-700 truncate">{s.label}</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className={cn("h-full", s.tone)} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="tabular-nums text-slate-600 text-right w-16 text-[11px]">
                      {s.count} <span className="text-slate-400">· {pct.toFixed(0)}%</span>
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