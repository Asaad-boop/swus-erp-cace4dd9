import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart, CheckCircle2, Truck, Wallet, Banknote, AlertTriangle, XCircle,
  TrendingUp, UserPlus, Repeat, RefreshCw, ArrowUpRight, ArrowDownRight,
  Package, Boxes, Megaphone, Activity, Users, Sparkles, Calendar,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  Line, ComposedChart,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useBrand, type Brand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/")({
  head: () => ({ meta: [{ title: "Dashboard — SynqWithUs ERP" }] }),
  component: DashboardPage,
});

// ---------- helpers ----------
const BDT = (n: number) =>
  "৳" + Math.round(n).toLocaleString("en-IN");
const compact = (n: number) =>
  n >= 1e7 ? (n / 1e7).toFixed(1) + "Cr"
  : n >= 1e5 ? (n / 1e5).toFixed(1) + "L"
  : n >= 1e3 ? (n / 1e3).toFixed(1) + "k"
  : String(Math.round(n));

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month";
const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today", yesterday: "Yesterday", "7d": "Last 7 Days",
  "30d": "Last 30 Days", month: "This Month",
};
function getRange(key: RangeKey): { from: Date; to: Date; prevFrom: Date; prevTo: Date; days: number } {
  const now = new Date();
  const start = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const end = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  let from: Date, to: Date;
  if (key === "today") { from = start(now); to = end(now); }
  else if (key === "yesterday") { const y = new Date(now); y.setDate(y.getDate()-1); from = start(y); to = end(y); }
  else if (key === "7d") { from = start(new Date(now.getTime() - 6*86400e3)); to = end(now); }
  else if (key === "30d") { from = start(new Date(now.getTime() - 29*86400e3)); to = end(now); }
  else { from = start(new Date(now.getFullYear(), now.getMonth(), 1)); to = end(now); }
  const ms = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - ms);
  const days = Math.max(1, Math.round(ms / 86400e3) + 1);
  return { from, to, prevFrom, prevTo, days };
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ---------- page ----------
function DashboardPage() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = brandIds.length > 0;
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const range = useMemo(() => getRange(rangeKey), [rangeKey]);
  const [lastSync, setLastSync] = useState(new Date());

  // user greeting
  const { data: me } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { name: "there" };
      const { data: p } = await supabase
        .from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return { name: (p?.display_name as string) || u.user.email?.split("@")[0] || "there" };
    },
    staleTime: 5 * 60 * 1000,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ predicate: q => Array.isArray(q.queryKey) && String(q.queryKey[0]).startsWith("dash-") });
    setLastSync(new Date());
  };
  useEffect(() => {
    const t = setInterval(refreshAll, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white">
        <div className="px-4 md:px-6 py-6 max-w-[1600px] mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                {greeting()}, {me?.name ?? "..."} <span className="inline-block">👋</span>
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                SynqWithUs ERP · {new Date().toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric" })}
                {" · "}
                <span className="text-slate-400">
                  {isAllBrands ? `All Brands (${brands.length})` : activeBrand?.name ?? ""}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/10 text-xs text-slate-200">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Synced {timeAgo(lastSync)}
              </div>
              <Button size="sm" variant="secondary" onClick={refreshAll} className="gap-1.5">
                <RefreshCw className="size-3.5" /> Refresh
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary" className="gap-1.5">
                    <Calendar className="size-3.5" /> {RANGE_LABELS[rangeKey]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(RANGE_LABELS) as RangeKey[]).map(k => (
                    <DropdownMenuItem key={k} onClick={() => setRangeKey(k)}>
                      {RANGE_LABELS[k]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-8 max-w-[1600px] mx-auto space-y-8">
        <KpiStrip brandIds={brandIds} enabled={enabled} range={range} onNav={(to) => navigate({ to: to as any })} />

        {isAllBrands && brands.length > 1 && (
          <BrandComparison brands={brands} range={range} />
        )}

        <TrendChart brandIds={brandIds} enabled={enabled} range={range} brands={brands} isAllBrands={isAllBrands} />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <CourierCard brandIds={brandIds} enabled={enabled} range={range} />
          <CodOutstandingCard brandIds={brandIds} enabled={enabled} />
          <ReturnsCard brandIds={brandIds} enabled={enabled} range={range} />
          <ImportsCard brandIds={brandIds} enabled={enabled} />
        </div>

        <FinanceSection brandIds={brandIds} enabled={enabled} range={range} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <InventoryHealth brandIds={brandIds} enabled={enabled} />
          <div className="lg:col-span-2">
            <LowStockList brandIds={brandIds} enabled={enabled} />
          </div>
        </div>

        <MarketingCard brandIds={brandIds} enabled={enabled} range={range} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopProducts brandIds={brandIds} enabled={enabled} range={range} />
          <TopCustomers brandIds={brandIds} enabled={enabled} range={range} />
        </div>

        <NeedsAttention brandIds={brandIds} enabled={enabled} />

        <LiveOrdersFeed brandIds={brandIds} enabled={enabled} />

        <SystemFooter lastSync={lastSync} />
      </div>
    </div>
  );
}

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

// ---------- KPI STRIP ----------
function KpiStrip({
  brandIds, enabled, range, onNav,
}: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange>; onNav: (to: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-kpi", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const inRange = (q: any) => q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const inPrev = (q: any) => q.gte("created_at", range.prevFrom.toISOString()).lte("created_at", range.prevTo.toISOString());

      const [cur, prev, confirmed, inTransit, codPending, attention, cancelled, items, users] = await Promise.all([
        inRange(applyBrandScope(supabase.from("orders").select("total"), brandIds)),
        inPrev(applyBrandScope(supabase.from("orders").select("total"), brandIds)),
        inRange(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .in("status", ["confirmed", "packaging", "packed", "ready_to_ship", "shipped", "delivered"]),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["shipped", "in_transit"]),
        applyBrandScope(supabase.from("orders").select("total,partial_amount,payment_status"), brandIds)
          .eq("payment_method", "cod").neq("payment_status", "paid").neq("status", "cancelled").neq("status", "returned"),
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any]).lt("created_at", new Date(Date.now() - 3*86400e3).toISOString()),
        inRange(applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds))
          .eq("status", "cancelled"),
        inRange(applyBrandScope(supabase.from("orders").select("user_id"), brandIds))
          .not("user_id", "is", null),
        applyBrandScope(supabase.from("orders").select("user_id, created_at"), brandIds).not("user_id", "is", null),
      ]);

      const curRows = cur.data ?? [];
      const prevRows = prev.data ?? [];
      const curOrders = curRows.length;
      const prevOrders = prevRows.length;
      const revenue = curRows.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const prevRevenue = prevRows.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const codRows = codPending.data ?? [];
      const codAmount = codRows.reduce((s: number, r: any) =>
        s + Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0)), 0);

      // new vs returning: customers in range whose earliest order is also in range
      const firstSeen = new Map<string, string>();
      for (const r of (users.data ?? []) as any[]) {
        const u = r.user_id as string; const t = r.created_at as string;
        if (!firstSeen.has(u) || t < firstSeen.get(u)!) firstSeen.set(u, t);
      }
      const seenInRange = new Set<string>();
      const newCust = new Set<string>(); const retCust = new Set<string>();
      for (const r of (items.data ?? []) as any[]) {
        const u = r.user_id as string;
        if (seenInRange.has(u)) continue;
        seenInRange.add(u);
        const first = firstSeen.get(u);
        if (first && first >= range.from.toISOString() && first <= range.to.toISOString()) newCust.add(u);
        else retCust.add(u);
      }

      const confirmRate = curOrders > 0 ? (confirmed.count ?? 0) / curOrders * 100 : 0;
      const cancelRate = curOrders > 0 ? (cancelled.count ?? 0) / curOrders * 100 : 0;
      const aov = curOrders > 0 ? revenue / curOrders : 0;
      const trend = (a: number, b: number) => b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100;

      return {
        curOrders, prevOrders, revenue, prevRevenue,
        confirmed: confirmed.count ?? 0, confirmRate,
        inTransit: inTransit.count ?? 0,
        codAmount, codCount: codRows.length,
        attention: attention.count ?? 0,
        cancelled: cancelled.count ?? 0, cancelRate,
        aov, newCust: newCust.size, retCust: retCust.size,
        ordersTrend: trend(curOrders, prevOrders),
        revTrend: trend(revenue, prevRevenue),
      };
    },
  });

  const cards = [
    { icon: ShoppingCart, label: "Orders", value: data?.curOrders ?? 0, trend: data?.ordersTrend, sub: "vs previous", tone: "indigo", to: "/erp/orders/web" },
    { icon: CheckCircle2, label: "Confirmed", value: data?.confirmed ?? 0, sub: `${(data?.confirmRate ?? 0).toFixed(0)}% confirm rate`, tone: "emerald", to: "/erp/orders/web" },
    { icon: Truck, label: "In Transit", value: data?.inTransit ?? 0, sub: "Pathao + Steadfast", tone: "blue", to: "/erp/orders/web" },
    { icon: Wallet, label: "Revenue", value: BDT(data?.revenue ?? 0), trend: data?.revTrend, sub: "vs previous", tone: "emerald", to: "/erp/finance" },
    { icon: Banknote, label: "COD Pending", value: BDT(data?.codAmount ?? 0), sub: `${data?.codCount ?? 0} orders`, tone: "amber", to: "/erp/reconciliation" },
    { icon: AlertTriangle, label: "Attention", value: data?.attention ?? 0, sub: "needs action", tone: "rose", to: "/erp/orders/web" },
    { icon: XCircle, label: "Cancelled", value: data?.cancelled ?? 0, sub: `${(data?.cancelRate ?? 0).toFixed(1)}% cancel rate`, tone: "rose", to: "/erp/orders/web" },
    { icon: TrendingUp, label: "AOV", value: BDT(data?.aov ?? 0), sub: "avg order value", tone: "slate" },
    { icon: UserPlus, label: "New Customers", value: data?.newCust ?? 0, sub: "first orders", tone: "violet" },
    { icon: Repeat, label: "Returning", value: data?.retCust ?? 0, sub: "repeat customers", tone: "violet" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {cards.map((c, i) => (
        <button
          key={i}
          onClick={() => c.to && onNav(c.to)}
          className={cn(
            "group text-left bg-card rounded-xl border p-5 hover:shadow-lg transition-all duration-200",
            c.to && "cursor-pointer hover:-translate-y-0.5 hover:border-foreground/20"
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</span>
            <span className={cn("rounded-lg p-2", toneBg(c.tone))}>
              <c.icon className={cn("size-4", toneFg(c.tone))} />
            </span>
          </div>
          {isLoading ? <Skeleton className="h-9 w-28" /> : (
            <div className="text-3xl font-bold tracking-tight tabular-nums leading-none">{c.value}</div>
          )}
          <div className="mt-2.5 flex items-center gap-1.5 min-h-[20px]">
            {typeof (c as any).trend === "number" ? (
              <TrendChip trend={(c as any).trend} />
            ) : null}
            <span className="text-xs text-muted-foreground truncate">{c.sub}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function TrendChip({ trend }: { trend: number }) {
  const up = trend >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
      up ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
         : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
    )}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(trend).toFixed(1)}%
    </span>
  );
}

function trendSub(t: number | undefined) {
  if (t === undefined) return "vs previous period";
  const sign = t >= 0 ? "+" : "";
  return `${sign}${t.toFixed(1)}% vs previous`;
}
function toneBg(t: string) {
  return {
    indigo: "bg-indigo-50 dark:bg-indigo-950/30",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30",
    blue: "bg-blue-50 dark:bg-blue-950/30",
    amber: "bg-amber-50 dark:bg-amber-950/30",
    rose: "bg-rose-50 dark:bg-rose-950/30",
    slate: "bg-slate-100 dark:bg-slate-800",
    violet: "bg-violet-50 dark:bg-violet-950/30",
  }[t] ?? "bg-muted";
}
function toneFg(t: string) {
  return {
    indigo: "text-indigo-600", emerald: "text-emerald-600", blue: "text-blue-600",
    amber: "text-amber-600", rose: "text-rose-600", slate: "text-slate-600",
    violet: "text-violet-600",
  }[t] ?? "text-foreground";
}

// ---------- BRAND COMPARISON ----------
function BrandComparison({ brands, range }: { brands: Brand[]; range: ReturnType<typeof getRange> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Brand Comparison</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="py-2 pr-4 font-medium">Metric</th>
              {brands.map(b => (
                <th key={b.id} className="py-2 pr-4 font-medium">
                  <div className="flex items-center gap-2">
                    {b.logo_url && <img src={b.logo_url} alt="" className="size-5 rounded object-cover" />}
                    {b.name}
                  </div>
                </th>
              ))}
              <th className="py-2 pr-4 font-medium">Combined</th>
            </tr>
          </thead>
          <BrandComparisonRows brands={brands} range={range} />
        </table>
      </CardContent>
    </Card>
  );
}

function BrandComparisonRows({ brands, range }: { brands: Brand[]; range: ReturnType<typeof getRange> }) {
  const queries = brands.map(b => useQuery({
    queryKey: ["dash-brand-cmp", b.id, range.from.toISOString(), range.to.toISOString()],
    staleTime: 60_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const inR = (q: any) => q.gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const [today, pending, delivered, revRows, lowStock, returnRows] = await Promise.all([
        inR(supabase.from("orders").select("id", { count: "exact", head: true })).eq("brand_id", b.id),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", b.id)
          .in("status", ["new","confirmed","packaging","packed","ready_to_ship"]),
        inR(supabase.from("orders").select("id", { count: "exact", head: true })).eq("brand_id", b.id).eq("status","delivered"),
        inR(supabase.from("orders").select("total")).eq("brand_id", b.id).eq("status","delivered"),
        supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }).eq("brand_id", b.id).eq("is_resolved", false),
        inR(supabase.from("orders").select("id", { count: "exact", head: true })).eq("brand_id", b.id).eq("status","returned"),
      ]);
      const rev = (revRows.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const deliv = delivered.count ?? 0;
      const ret = returnRows.count ?? 0;
      return {
        today: today.count ?? 0,
        pending: pending.count ?? 0,
        delivered: deliv,
        revenue: rev,
        lowStock: lowStock.count ?? 0,
        returnRate: deliv + ret > 0 ? (ret / (deliv + ret)) * 100 : 0,
      };
    },
  }));

  const sumKey = (k: keyof NonNullable<typeof queries[0]["data"]>) =>
    queries.reduce((s, q) => s + Number(q.data?.[k] ?? 0), 0);

  const rows: Array<{ label: string; key: string; fmt?: (v: any) => string }> = [
    { label: "Orders (range)", key: "today" },
    { label: "Revenue (range)", key: "revenue", fmt: (v) => BDT(v) },
    { label: "Pending", key: "pending" },
    { label: "Delivered (range)", key: "delivered" },
    { label: "Low Stock", key: "lowStock" },
    { label: "Return Rate", key: "returnRate", fmt: (v) => v.toFixed(1) + "%" },
  ];

  return (
    <tbody>
      {rows.map(row => (
        <tr key={row.label} className="border-b last:border-0">
          <td className="py-2.5 pr-4 text-muted-foreground">{row.label}</td>
          {queries.map((q, i) => (
            <td key={brands[i].id} className="py-2.5 pr-4 font-medium tabular-nums">
              {q.isLoading ? <Skeleton className="h-4 w-16" /> :
                (row.fmt ? row.fmt(q.data?.[row.key as keyof NonNullable<typeof q.data>] ?? 0)
                  : String(q.data?.[row.key as keyof NonNullable<typeof q.data>] ?? 0))}
            </td>
          ))}
          <td className="py-2.5 pr-4 font-semibold tabular-nums">
            {row.key === "returnRate" ? "—" : (row.fmt ? row.fmt(sumKey(row.key as any)) : sumKey(row.key as any))}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

// ---------- TREND CHART ----------
function TrendChart({
  brandIds, enabled, range, brands, isAllBrands,
}: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange>; brands: Brand[]; isAllBrands: boolean }) {
  const [mode, setMode] = useState<"revenue" | "orders" | "both">("both");

  const { data, isLoading } = useQuery({
    queryKey: ["dash-trend", brandIds.join(","), range.from.toISOString(), range.to.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("created_at, total, brand_id"), brandIds
      ).gte("created_at", range.from.toISOString()).lte("created_at", range.to.toISOString());
      const buckets = new Map<string, any>();
      const days = Math.min(range.days, 60);
      for (let i = 0; i < days; i++) {
        const d = new Date(range.from); d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        const init: any = { date: key, label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), orders: 0, revenue: 0 };
        for (const b of brands) init["b_" + b.id] = 0;
        buckets.set(key, init);
      }
      for (const r of (rows ?? []) as any[]) {
        const key = (r.created_at as string).slice(0, 10);
        const b = buckets.get(key); if (!b) continue;
        b.orders += 1;
        b.revenue += Number(r.total ?? 0);
        if (r.brand_id && b["b_" + r.brand_id] !== undefined) b["b_" + r.brand_id] += Number(r.total ?? 0);
      }
      return Array.from(buckets.values());
    },
  });

  const colors = ["#6366f1", "#f97316", "#10b981", "#ec4899", "#8b5cf6"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Revenue & Orders Trend</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{""}{range.from.toLocaleDateString()} → {range.to.toLocaleDateString()}</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {(["revenue","orders","both"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={cn("text-xs px-2.5 py-1 rounded capitalize transition",
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {m}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? <Skeleton className="h-64 w-full" /> : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="rev" tickFormatter={(v) => compact(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: any) => [n.toString().startsWith("Orders") ? v : BDT(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {(mode === "revenue" || mode === "both") && (
                  isAllBrands && brands.length > 1 ? brands.map((b, i) => (
                    <Area key={b.id} yAxisId="rev" type="monotone" dataKey={"b_" + b.id} name={b.name}
                      stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.15} strokeWidth={2} />
                  )) : (
                    <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue"
                      stroke="#6366f1" fill="#6366f1" fillOpacity={0.18} strokeWidth={2} />
                  )
                )}
                {(mode === "orders" || mode === "both") && (
                  <Line yAxisId="ord" type="monotone" dataKey="orders" name="Orders" stroke="#64748b" strokeDasharray="4 4" strokeWidth={2} dot={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- COURIER ----------
function CourierCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-courier", brandIds.join(","), range.from.toISOString()],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("courier_shipments").select("provider, status"), brandIds
      );
      const agg: Record<string, { transit: number; delivered: number; returned: number; failed: number; total: number }> = {};
      for (const r of (rows ?? []) as any[]) {
        const p = (r.provider as string) || "other";
        agg[p] ??= { transit: 0, delivered: 0, returned: 0, failed: 0, total: 0 };
        const s = (r.status as string) || "";
        agg[p].total++;
        if (/deliver/i.test(s)) agg[p].delivered++;
        else if (/return/i.test(s)) agg[p].returned++;
        else if (/fail|cancel|lost/i.test(s)) agg[p].failed++;
        else agg[p].transit++;
      }
      return agg;
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Truck className="size-4 text-blue-600" /> Courier Status</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Skeleton className="h-32" /> : Object.keys(data ?? {}).length === 0 ? (
          <p className="text-sm text-muted-foreground">No courier data yet.</p>
        ) : (
          Object.entries(data!).map(([provider, s]) => {
            const success = s.total ? (s.delivered / s.total) * 100 : 0;
            return (
              <div key={provider} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium capitalize">{provider}</span>
                  <span className="text-emerald-600 font-semibold">{success.toFixed(0)}% success</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[11px]">
                  <Stat label="Transit" v={s.transit} />
                  <Stat label="Delivered" v={s.delivered} c="text-emerald-600" />
                  <Stat label="Returned" v={s.returned} c="text-amber-600" />
                  <Stat label="Failed" v={s.failed} c="text-rose-600" />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
function Stat({ label, v, c }: { label: string; v: number; c?: string }) {
  return <div className="bg-muted/50 rounded px-1.5 py-1"><div className="text-muted-foreground">{label}</div><div className={cn("font-semibold", c)}>{v}</div></div>;
}

// ---------- COD OUTSTANDING ----------
function CodOutstandingCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-cod", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("total, partial_amount, delivered_at, created_at, payment_status, status"), brandIds
      ).eq("payment_method", "cod").neq("payment_status", "paid").neq("status", "cancelled").neq("status", "returned");
      const cutoff = Date.now() - 14 * 86400e3;
      let amount = 0, count = 0, overdue = 0;
      for (const r of (rows ?? []) as any[]) {
        const due = Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0));
        if (due <= 0) continue;
        amount += due; count++;
        const ref = r.delivered_at ?? r.created_at;
        if (ref && new Date(ref).getTime() < cutoff) overdue += due;
      }
      return { amount, count, overdue };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Banknote className="size-4 text-amber-600" /> COD Outstanding</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : (
          <>
            <div className="text-2xl font-bold">{BDT(data?.amount ?? 0)}</div>
            <div className="text-xs text-muted-foreground">{data?.count ?? 0} orders pending</div>
            {(data?.overdue ?? 0) > 0 && (
              <div className="mt-2 text-xs flex items-center gap-1.5 text-rose-600">
                <span className="size-1.5 rounded-full bg-rose-500" />
                Overdue &gt;14d: <span className="font-semibold">{BDT(data!.overdue)}</span>
              </div>
            )}
            <Link to="/erp/reconciliation" className="mt-3 inline-flex text-xs text-indigo-600 hover:underline">View queue →</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- RETURNS ----------
function ReturnsCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-returns", brandIds.join(","), range.from.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const [pendingQc, inTransit, monthly, refunds] = await Promise.all([
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds).eq("return_status", "pending_qc"),
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds).eq("return_status", "in_transit"),
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds).gte("created_at", range.from.toISOString()),
        applyBrandScope(supabase.from("erp_return_cases").select("refund_amount"), brandIds).neq("refund_status", "completed"),
      ]);
      const refundDue = (refunds.data ?? []).reduce((s: number, r: any) => s + Number(r.refund_amount ?? 0), 0);
      return { pendingQc: pendingQc.count ?? 0, inTransit: inTransit.count ?? 0, monthly: monthly.count ?? 0, refundDue };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Repeat className="size-4 text-amber-600" /> Returns & Exchanges</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-muted-foreground text-xs">Pending QC</div><div className="font-semibold text-amber-600">{data?.pendingQc ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">In Transit</div><div className="font-semibold">{data?.inTransit ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">This Range</div><div className="font-semibold">{data?.monthly ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">Refunds Due</div><div className="font-semibold text-rose-600">{BDT(data?.refundDue ?? 0)}</div></div>
            </div>
            <Link to="/erp/returns" className="mt-3 inline-flex text-xs text-indigo-600 hover:underline">View returns →</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- IMPORTS ----------
function ImportsCard({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-imports", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("imp_purchase_orders").select("status, due_bdt, shipped_at"), brandIds
      ).not("status", "in", "(received,cancelled)");
      let active = 0, inTransit = 0, due = 0;
      for (const r of (rows ?? []) as any[]) {
        active++;
        if (r.shipped_at && r.status !== "received") inTransit++;
        due += Number(r.due_bdt ?? 0);
      }
      return { active, inTransit, due };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Package className="size-4 text-violet-600" /> Import Status</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20" /> : (
          <>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-muted-foreground text-xs">Active POs</div><div className="font-semibold">{data?.active ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">In Transit</div><div className="font-semibold">{data?.inTransit ?? 0}</div></div>
              <div><div className="text-muted-foreground text-xs">Dues</div><div className="font-semibold text-rose-600">{BDT(data?.due ?? 0)}</div></div>
            </div>
            <Link to="/erp/imports" className="mt-3 inline-flex text-xs text-indigo-600 hover:underline">View imports →</Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- FINANCE ----------
function FinanceSection({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-finance", brandIds.join(","), range.from.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
      const [accounts, rev, items, txns] = await Promise.all([
        applyBrandScope(supabase.from("erp_accounts").select("account_type, account_subtype, name, current_balance"), brandIds).eq("is_active", true),
        applyBrandScope(supabase.from("orders").select("total"), brandIds).eq("status", "delivered").gte("created_at", monthStart.toISOString()),
        applyBrandScope(supabase.from("order_items").select("cost_price, quantity, orders!inner(brand_id, status, created_at)"), brandIds, "orders.brand_id" as any)
          .eq("orders.status", "delivered").gte("orders.created_at", monthStart.toISOString()),
        applyBrandScope(supabase.from("erp_transactions").select("amount, type, account_id"), brandIds).gte("transaction_date", monthStart.toISOString().slice(0,10)),
      ]);
      const accs = (accounts.data ?? []) as any[];
      const byType = (sub: string) => accs.filter(a => (a.account_subtype || a.account_type) === sub)
        .reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
      const cash = accs.filter(a => a.account_type === "cash" && !a.account_subtype).reduce((s,a)=>s+Number(a.current_balance ?? 0),0);
      const bkash = accs.filter(a => (a.account_subtype === "bkash") || /bkash/i.test(a.name)).reduce((s,a)=>s+Number(a.current_balance ?? 0),0);
      const nagad = accs.filter(a => (a.account_subtype === "nagad") || /nagad/i.test(a.name)).reduce((s,a)=>s+Number(a.current_balance ?? 0),0);
      const bank = accs.filter(a => a.account_type === "bank").reduce((s,a)=>s+Number(a.current_balance ?? 0),0);
      const ar = byType("accounts_receivable") + accs.filter(a => /receivable/i.test(a.name)).reduce((s,a)=>s+Number(a.current_balance ?? 0),0);
      const ap = byType("accounts_payable") + accs.filter(a => /payable/i.test(a.name)).reduce((s,a)=>s+Number(a.current_balance ?? 0),0);
      const revenue = (rev.data ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
      const cogs = (items.data ?? []).reduce((s: number, r: any) => s + Number(r.cost_price ?? 0) * Number(r.quantity ?? 0), 0);
      const expenses = (txns.data ?? []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
      const gross = revenue - cogs;
      const net = gross - expenses;
      return { cash, bkash, nagad, bank, ar, ap, revenue, cogs, gross, expenses, net };
    },
  });

  const balances = [
    { label: "Cash", icon: "💵", value: data?.cash ?? 0 },
    { label: "bKash", icon: "📱", value: data?.bkash ?? 0 },
    { label: "Nagad", icon: "📱", value: data?.nagad ?? 0 },
    { label: "Bank", icon: "🏦", value: data?.bank ?? 0 },
    { label: "Receivable", icon: "📤", value: data?.ar ?? 0 },
    { label: "Payable", icon: "📥", value: data?.ap ?? 0 },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Wallet className="size-4 text-emerald-600" /> Finance Snapshot</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {balances.map(b => (
              <div key={b.label} className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1"><span>{b.icon}</span>{b.label}</div>
                {isLoading ? <Skeleton className="h-5 w-20 mt-1" /> :
                  <div className="text-base font-semibold tabular-nums mt-0.5">{BDT(b.value)}</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">P&amp;L This Month</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {isLoading ? <Skeleton className="h-32" /> : (<>
            <PLRow label="Revenue" v={data?.revenue ?? 0} />
            <PLRow label="COGS" v={-(data?.cogs ?? 0)} />
            <div className="border-t pt-1.5"><PLRow label="Gross" v={data?.gross ?? 0} bold sub={data?.revenue ? `${((data!.gross/data!.revenue)*100).toFixed(1)}%` : undefined} /></div>
            <PLRow label="Expenses" v={-(data?.expenses ?? 0)} />
            <div className="border-t pt-1.5"><PLRow label="Net Profit" v={data?.net ?? 0} bold positive /></div>
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}
function PLRow({ label, v, bold, positive, sub }: { label: string; v: number; bold?: boolean; positive?: boolean; sub?: string }) {
  const cls = v < 0 ? "text-rose-600" : positive ? "text-emerald-600" : "";
  return (
    <div className="flex justify-between items-baseline">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-medium")}>{label}{sub && <span className="text-xs ml-1 text-muted-foreground">({sub})</span>}</span>
      <span className={cn("tabular-nums", bold && "font-semibold", cls)}>{BDT(v)}</span>
    </div>
  );
}

// ---------- INVENTORY ----------
function InventoryHealth({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-inv", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const [stock, low, out] = await Promise.all([
        applyBrandScope(supabase.from("products").select("total_cost_value"), brandIds).eq("is_active", true),
        applyBrandScope(supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }), brandIds).eq("is_resolved", false),
        applyBrandScope(supabase.from("products").select("id", { count: "exact", head: true }), brandIds).eq("is_active", true).eq("stock", 0),
      ]);
      const value = (stock.data ?? []).reduce((s: number, r: any) => s + Number(r.total_cost_value ?? 0), 0);
      return { value, low: low.count ?? 0, out: out.count ?? 0 };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Boxes className="size-4 text-indigo-600" /> Inventory Health</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? <Skeleton className="h-28" /> : (<>
          <div className="flex justify-between"><span className="text-muted-foreground">Stock Value</span><span className="font-semibold tabular-nums">{BDT(data?.value ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Low Stock</span><span className="font-semibold text-amber-600">{data?.low ?? 0} products</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Out of Stock</span><span className="font-semibold text-rose-600">{data?.out ?? 0} products</span></div>
          <Link to="/erp/inventory" className="inline-flex text-xs text-indigo-600 hover:underline">View inventory →</Link>
        </>)}
      </CardContent>
    </Card>
  );
}

function LowStockList({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-lowstock", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("low_stock_alerts").select("current_stock, threshold, product_id, products(title)"), brandIds
      ).eq("is_resolved", false).order("current_stock", { ascending: true }).limit(5);
      return rows ?? [];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Low Stock Products</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No low stock alerts 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left py-2">Product</th><th className="text-right">Stock</th><th className="text-right">Threshold</th><th></th></tr></thead>
            <tbody>
              {(data as any[]).map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 truncate max-w-[200px]">{r.products?.title ?? "Untitled"}</td>
                  <td className="text-right font-semibold text-rose-600 tabular-nums">{r.current_stock}</td>
                  <td className="text-right text-muted-foreground tabular-nums">{r.threshold}</td>
                  <td className="text-right"><Link to="/erp/inventory" className="text-xs text-indigo-600 hover:underline">Reorder</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- MARKETING ----------
function MarketingCard({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-mkt", brandIds.join(","), range.from.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const last7Start = new Date(Date.now() - 6*86400e3).toISOString().slice(0,10);
      const { data: rows } = await applyBrandScope(
        supabase.from("mkt_insights_daily").select("date, spend, meta_purchases, meta_purchase_value"), brandIds
      ).gte("date", last7Start);
      const todayKey = new Date().toISOString().slice(0,10);
      let spendToday = 0, purchToday = 0, valToday = 0;
      const series = new Map<string, { date: string; spend: number; revenue: number }>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - (6-i)*86400e3).toISOString().slice(0,10);
        series.set(d, { date: d, spend: 0, revenue: 0 });
      }
      for (const r of (rows ?? []) as any[]) {
        if (r.date === todayKey) { spendToday += Number(r.spend ?? 0); purchToday += Number(r.meta_purchases ?? 0); valToday += Number(r.meta_purchase_value ?? 0); }
        const s = series.get(r.date); if (s) { s.spend += Number(r.spend ?? 0); s.revenue += Number(r.meta_purchase_value ?? 0); }
      }
      const roas = spendToday > 0 ? valToday / (spendToday * 110) : 0; // assume $1 ~ 110 BDT
      const cpo = purchToday > 0 ? (spendToday * 110) / purchToday : 0;
      return { spendToday, spendTodayBdt: spendToday * 110, roas, purchToday, cpo, series: Array.from(series.values()) };
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Megaphone className="size-4 text-pink-600" /> Marketing Snapshot</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <KV label="Today Spend" v={`$${(data?.spendToday ?? 0).toFixed(2)} / ${BDT(data?.spendTodayBdt ?? 0)}`} />
            <KV label="ROAS" v={`${(data?.roas ?? 0).toFixed(2)}x`} tone="emerald" />
            <KV label="Meta Orders" v={String(data?.purchToday ?? 0)} />
            <KV label="CPO" v={BDT(data?.cpo ?? 0)} />
            <div className="md:col-span-1 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series ?? []}>
                  <Area type="monotone" dataKey="spend" stroke="#ec4899" fill="#ec4899" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function KV({ label, v, tone }: { label: string; v: string; tone?: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className={cn("text-base font-semibold tabular-nums", tone === "emerald" && "text-emerald-600")}>{v}</div></div>;
}

// ---------- TOP PRODUCTS & CUSTOMERS ----------
function TopProducts({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-top-prod", brandIds.join(","), range.from.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("order_items").select("name, quantity, line_total, orders!inner(brand_id, status, created_at)"),
        brandIds, "orders.brand_id" as any
      ).eq("orders.status", "delivered")
       .gte("orders.created_at", range.from.toISOString())
       .lte("orders.created_at", range.to.toISOString());
      const agg = new Map<string, { name: string; units: number; revenue: number }>();
      for (const r of (rows ?? []) as any[]) {
        const k = r.name as string;
        const cur = agg.get(k) ?? { name: k, units: 0, revenue: 0 };
        cur.units += Number(r.quantity ?? 0);
        cur.revenue += Number(r.line_total ?? 0);
        agg.set(k, cur);
      }
      return Array.from(agg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="size-4 text-amber-500" /> Top Products</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left py-2 w-6">#</th><th className="text-left">Product</th><th className="text-right">Units</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>
              {data!.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground">{i+1}</td>
                  <td className="truncate max-w-[200px]">{r.name}</td>
                  <td className="text-right tabular-nums">{r.units}</td>
                  <td className="text-right font-semibold tabular-nums">{BDT(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TopCustomers({ brandIds, enabled, range }: { brandIds: string[]; enabled: boolean; range: ReturnType<typeof getRange> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-top-cust", brandIds.join(","), range.from.toISOString()],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("shipping_name, shipping_phone, total"), brandIds
      ).eq("status", "delivered")
       .gte("created_at", range.from.toISOString())
       .lte("created_at", range.to.toISOString());
      const agg = new Map<string, { name: string; orders: number; value: number }>();
      for (const r of (rows ?? []) as any[]) {
        const k = (r.shipping_phone as string) || (r.shipping_name as string) || "Unknown";
        const cur = agg.get(k) ?? { name: (r.shipping_name as string) || k, orders: 0, value: 0 };
        cur.orders++; cur.value += Number(r.total ?? 0);
        agg.set(k, cur);
      }
      return Array.from(agg.values()).sort((a, b) => b.value - a.value).slice(0, 5);
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="size-4 text-violet-600" /> Top Customers</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-32" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left py-2 w-6">#</th><th className="text-left">Customer</th><th className="text-right">Orders</th><th className="text-right">Value</th></tr></thead>
            <tbody>
              {data!.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground">{i+1}</td>
                  <td className="truncate max-w-[200px]">{r.name}</td>
                  <td className="text-right tabular-nums">{r.orders}</td>
                  <td className="text-right font-semibold tabular-nums">{BDT(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- NEEDS ATTENTION ----------
function NeedsAttention({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dash-attention", brandIds.join(",")],
    enabled, staleTime: 60_000,
    queryFn: async () => {
      const threeDaysAgo = new Date(Date.now() - 3*86400e3).toISOString();
      const fourteenDaysAgo = new Date(Date.now() - 14*86400e3).toISOString();
      const twoDaysAgo = new Date(Date.now() - 2*86400e3).toISOString();
      const [stuck, overdueCod, oldQc, lowStock, importLate] = await Promise.all([
        applyBrandScope(supabase.from("orders").select("id", { count: "exact", head: true }), brandIds)
          .in("status", ["new" as any, "processing" as any]).lt("created_at", threeDaysAgo),
        applyBrandScope(supabase.from("orders").select("total, partial_amount"), brandIds)
          .eq("payment_method", "cod").neq("payment_status", "paid").neq("status", "cancelled")
          .lt("created_at", fourteenDaysAgo),
        applyBrandScope(supabase.from("erp_return_cases").select("id", { count: "exact", head: true }), brandIds)
          .eq("return_status", "pending_qc").lt("created_at", twoDaysAgo),
        applyBrandScope(supabase.from("low_stock_alerts").select("id", { count: "exact", head: true }), brandIds)
          .eq("is_resolved", false),
        applyBrandScope(supabase.from("imp_purchase_orders").select("id", { count: "exact", head: true }), brandIds)
          .not("status", "in", "(received,cancelled)")
          .lt("order_date", new Date(Date.now() - 45*86400e3).toISOString().slice(0,10)),
      ]);
      const codAmount = (overdueCod.data ?? []).reduce((s: number, r: any) =>
        s + Math.max(0, Number(r.total ?? 0) - Number(r.partial_amount ?? 0)), 0);
      const items: Array<{ level: "red"|"amber"|"green"; text: string; count?: string; to: string }> = [];
      if ((stuck.count ?? 0) > 0) items.push({ level: "red", text: `Orders stuck in Processing > 3 days`, count: String(stuck.count), to: "/erp/orders/web" });
      if (codAmount > 0) items.push({ level: "red", text: `COD overdue > 14 days`, count: BDT(codAmount), to: "/erp/reconciliation" });
      if ((oldQc.count ?? 0) > 0) items.push({ level: "amber", text: `Returns pending QC > 2 days`, count: String(oldQc.count), to: "/erp/returns" });
      if ((lowStock.count ?? 0) > 0) items.push({ level: "amber", text: `Products below reorder point`, count: String(lowStock.count), to: "/erp/inventory" });
      if ((importLate.count ?? 0) > 0) items.push({ level: "amber", text: `Import PO overdue`, count: String(importLate.count), to: "/erp/imports" });
      return items;
    },
  });

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("dash.dismissed") ?? "[]")); }
    catch { return new Set(); }
  });
  const dismiss = (k: string) => {
    const next = new Set(dismissed); next.add(k);
    setDismissed(next);
    localStorage.setItem("dash.dismissed", JSON.stringify(Array.from(next)));
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> Needs Attention</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24" /> : (
          (data ?? []).filter(a => !dismissed.has(a.text)).length === 0 ? (
            <p className="text-sm text-muted-foreground">All clear ✨</p>
          ) : (
            <ul className="space-y-2">
              {(data ?? []).filter(a => !dismissed.has(a.text)).map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("size-2 rounded-full shrink-0",
                      a.level === "red" ? "bg-rose-500" : a.level === "amber" ? "bg-amber-500" : "bg-emerald-500")} />
                    <span className="text-sm truncate">{a.text}</span>
                    {a.count && <Badge variant="secondary" className="ml-1 tabular-nums">{a.count}</Badge>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link to={a.to as any} className="text-xs text-indigo-600 hover:underline">View →</Link>
                    <button onClick={() => dismiss(a.text)} className="text-xs text-muted-foreground hover:text-foreground px-1">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </CardContent>
    </Card>
  );
}

// ---------- LIVE ORDERS FEED ----------
type LiveOrder = { id: string; created_at: string; total: number; status: string; shipping_name: string | null };

function LiveOrdersFeed({ brandIds, enabled }: { brandIds: string[]; enabled: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<LiveOrder[]>({
    queryKey: ["dash-live", brandIds.join(",")],
    enabled, staleTime: 30_000,
    queryFn: async () => {
      const { data: rows } = await applyBrandScope(
        supabase.from("orders").select("id, created_at, total, status, shipping_name"), brandIds
      ).order("created_at", { ascending: false }).limit(10);
      return (rows ?? []) as LiveOrder[];
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const ch = supabase.channel("dash-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey: ["dash-live", brandIds.join(",")] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, brandIds, qc]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><Activity className="size-4 text-emerald-600" /> Live Orders</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40" /> : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent orders.</p>
        ) : (
          <ul className="divide-y">
            {data!.map(o => (
              <li key={o.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground tabular-nums w-16 shrink-0">{timeAgo(new Date(o.created_at))}</span>
                  <span className="text-sm truncate">{o.shipping_name ?? "Guest"}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{BDT(o.total)}</span>
                  <Badge variant="outline" className="capitalize text-xs">{o.status}</Badge>
                  <Link to="/erp/orders/$orderId" params={{ orderId: o.id }} className="text-xs text-indigo-600 hover:underline">Open</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- FOOTER ----------
function SystemFooter({ lastSync }: { lastSync: Date }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t pt-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>✅ DB Connected</span>
        <span>✅ Realtime Active</span>
        <span>Synced {timeAgo(lastSync)}</span>
      </div>
      <span>SynqWithUs ERP · v1.0</span>
    </div>
  );
}
