import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ManageCampaignProductsDialog } from "@/components/erp/marketing/manage-campaign-products-dialog";
import { cn } from "@/lib/utils";
import { useMultiBrandPicker } from "@/components/erp/brand-picker-gate";
import {
  getPerformanceDashboard,
  type PerfRow,
  type DecisionBucket,
} from "@/lib/erp/marketing/performance.functions";
import { getDashboardSummary, type DashboardSummary } from "@/lib/erp/marketing/dashboard.functions";
import { syncBrandInsightsRange } from "@/lib/erp/marketing/meta.functions";
import {
  DateRangePicker,
  buildPreset,
  type MktRangeValue,
} from "@/components/erp/marketing/date-range-picker";
import {
  Activity,
  ShoppingBag,
  Wallet,
  TrendingUp,
  TrendingDown,
  XCircle,
  CheckCircle2,
  Search,
  RefreshCw,
  ArrowUpRight,
  MoreHorizontal,
  Package,
  ExternalLink,
  RotateCcw,
  BarChart3,
  Receipt,
  Target,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  component: MarketingCommandCenter,
});

// ─────────────────────────── formatters ───────────────────────────
const fmtUSD = (n: number) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtBDT = (n: number) => `৳${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtNum = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : n.toLocaleString();
const fmtPct = (n: number | null, digits = 2) =>
  n == null ? "—" : `${n.toFixed(digits)}%`;
const fmtMult = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);

// ─────────────────────────── decision config ───────────────────────────
const DECISIONS: Record<
  DecisionBucket,
  { label: string; dot: string; chip: string; accent: string; ring: string }
> = {
  scale: {
    label: "Scale Up",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    accent: "text-emerald-600",
    ring: "ring-emerald-500/30",
  },
  monitor: {
    label: "Monitor",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    accent: "text-amber-600",
    ring: "ring-amber-500/30",
  },
  optimize: {
    label: "Optimize",
    dot: "bg-purple-500",
    chip: "bg-purple-50 text-purple-700 border-purple-200",
    accent: "text-purple-600",
    ring: "ring-purple-500/30",
  },
  kill: {
    label: "Kill",
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-600 border-red-200",
    accent: "text-rose-600",
    ring: "ring-rose-500/30",
  },
  insufficient: {
    label: "Low data",
    dot: "bg-muted-foreground",
    chip: "bg-gray-50 text-gray-600 border-gray-200",
    accent: "text-muted-foreground",
    ring: "ring-border",
  },
};

// ─────────────────────────── page ───────────────────────────

function MarketingCommandCenter() {
  const { brandIds, selectedBrands, picker } = useMultiBrandPicker();
  const hasBrand = brandIds.length > 0;
  const brandLabel =
    selectedBrands.length === 0
      ? "—"
      : selectedBrands.length === 1
        ? selectedBrands[0].name
        : `${selectedBrands.length} brands`;
  const [dateRange, setDateRange] = useState<MktRangeValue>(() => buildPreset("7d"));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bucketFilter, setBucketFilter] = useState<DecisionBucket | "all">("all");
  const [sortBy, setSortBy] = useState<"true_roas" | "spend" | "profit" | "orders">("true_roas");
  const [isSyncing, setIsSyncing] = useState(false);
  const [manageProductsFor, setManageProductsFor] = useState<PerfRow | null>(null);

  const r = useMemo(() => ({ from: dateRange.from, to: dateRange.to }), [dateRange.from, dateRange.to]);

  const perfFn = useServerFn(getPerformanceDashboard);
  const summaryFn = useServerFn(getDashboardSummary);
  const syncRangeFn = useServerFn(syncBrandInsightsRange);
  const qc = useQueryClient();

  const perfQ = useQuery({
    queryKey: ["mkt-performance", brandIds.slice().sort().join(","), r.from, r.to],
    queryFn: () => perfFn({ data: { brandIds, ...r } }),
    enabled: hasBrand,
    staleTime: 30_000,
  });
  const summaryQ = useQuery({
    queryKey: ["mkt", "dashboard-summary", brandIds.slice().sort().join(",")],
    queryFn: () => summaryFn({ data: { brandIds } }),
    enabled: hasBrand,
    refetchInterval: 5 * 60 * 1000,
  });

  async function syncMeta() {
    if (!hasBrand) return;
    setIsSyncing(true);
    try {
      let totalRows = 0;
      for (const bid of brandIds) {
        const res = await syncRangeFn({ data: { brandId: bid, since: r.from, until: r.to } });
        totalRows += res.rows ?? 0;
      }
      toast.success(`Meta synced · ${totalRows} rows (${brandIds.length} brand${brandIds.length > 1 ? "s" : ""})`);
      await Promise.all([perfQ.refetch(), summaryQ.refetch()]);
    } catch (e: any) {
      toast.error(e?.message ?? "Meta sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  async function refreshData() {
    await qc.invalidateQueries({ queryKey: ["mkt-performance"] });
    await qc.invalidateQueries({ queryKey: ["mkt", "dashboard-summary"] });
    toast.success("Refreshed");
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setBucketFilter("all");
    setSortBy("true_roas");
    setDateRange(buildPreset("7d"));
  }

  const allRows = perfQ.data?.rows ?? [];
  const totals = perfQ.data?.totals;
  const summary = summaryQ.data;

  // Index budget pacing by campaign_id
  const pacingMap = useMemo(() => {
    const m = new Map<string, DashboardSummary["budgetPacing"][number]>();
    summary?.budgetPacing.forEach((p) => m.set(p.campaign_id, p));
    return m;
  }, [summary]);

  const filtered = useMemo(() => {
    let rows = allRows.filter((row) => {
      if (
        search &&
        !row.name.toLowerCase().includes(search.toLowerCase()) &&
        !row.external_id.includes(search)
      )
        return false;
      if (statusFilter !== "all") {
        const s = (row.effective_status ?? row.status ?? "").toUpperCase();
        if (statusFilter === "active" && s !== "ACTIVE") return false;
        if (statusFilter === "paused" && s !== "PAUSED") return false;
      }
      if (bucketFilter !== "all" && row.decision !== bucketFilter) return false;
      return true;
    });
    const key = sortBy;
    rows = [...rows].sort((a, b) => {
      const va =
        key === "true_roas"
          ? a.true_roas ?? -1
          : key === "spend"
            ? a.total_spend_bdt
            : key === "profit"
              ? a.profit_bdt
              : a.delivered_orders;
      const vb =
        key === "true_roas"
          ? b.true_roas ?? -1
          : key === "spend"
            ? b.total_spend_bdt
            : key === "profit"
              ? b.profit_bdt
              : b.delivered_orders;
      return vb - va;
    });
    return rows;
  }, [allRows, search, statusFilter, bucketFilter, sortBy]);

  const buckets = (["scale", "monitor", "optimize", "kill"] as DecisionBucket[]).map((b) => ({
    key: b,
    rows: allRows.filter((row) => row.decision === b),
  }));

  const isLoading = perfQ.isLoading || (hasBrand && !summary && summaryQ.isLoading);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[#1877F2]/5 via-background to-background p-5">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#1877F2]/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1877F2]/10 text-[#1877F2] ring-1 ring-[#1877F2]/20">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight">Marketing Command Center</h1>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {brandLabel} · Live KPIs, true ROAS & per-campaign budget pacing.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {picker}
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              <Button
                onClick={syncMeta}
                disabled={perfQ.isFetching || isSyncing || !hasBrand}
                className="gap-2 bg-[#1877F2] hover:bg-[#1877F2]/90"
              >
                <RefreshCw className={cn("h-4 w-4", (perfQ.isFetching || isSyncing) && "animate-spin")} />
                Sync Meta
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" title="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={refreshData} className="gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh data
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={resetFilters} className="gap-2">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset filters
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* ── HERO KPIs ───────────────────────────────────────────── */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <HeroKpi icon={Wallet} label="Spend" value={totals ? fmtBDT(totals.total_spend_bdt) : "—"} sub={totals ? fmtUSD(totals.total_spend_usd) : ""} tone="sky" />
          <HeroKpi icon={Receipt} label="Revenue" value={totals ? fmtBDT(totals.delivered_revenue_bdt) : "—"} sub="delivered" tone="violet" />
          <HeroKpi
            icon={totals && totals.profit_bdt >= 0 ? TrendingUp : TrendingDown}
            label="Profit"
            value={totals ? fmtBDT(totals.profit_bdt) : "—"}
            sub={totals ? `${fmtPct(totals.margin_pct == null ? null : totals.margin_pct * 100, 1)} margin` : ""}
            tone={!totals ? "indigo" : totals.profit_bdt > 0 ? "emerald" : totals.profit_bdt < 0 ? "rose" : "indigo"}
            emphasize
          />
          <HeroKpi
            icon={Target}
            label="True ROAS"
            value={totals ? fmtMult(totals.true_roas) : "—"}
            sub={totals ? `Meta ${fmtMult(totals.meta_roas)}` : ""}
            tone={!totals || totals.true_roas == null ? "indigo" : totals.true_roas >= 2 ? "emerald" : totals.true_roas >= 1 ? "amber" : "rose"}
            emphasize
          />
          <HeroKpi
            icon={ShoppingBag}
            label="Orders"
            value={totals ? totals.delivered_orders.toString() : "—"}
            sub={
              totals && totals.delivered_orders > 0
                ? `${fmtBDT(totals.total_spend_bdt / totals.delivered_orders)}/order`
                : `Meta: ${totals?.meta_purchases ?? 0}`
            }
            tone="emerald"
          />
          <HeroKpi
            icon={Activity}
            label="Active Campaigns"
            value={totals ? totals.active_campaigns.toString() : "—"}
            sub={`${allRows.length} total · ${fmtPct(totals?.ctr ?? null)} CTR`}
            tone="indigo"
          />
        </div>

        {/* ── TODAY + ROAS REALITY ────────────────────────────────── */}
        {summary && (summary.today.spend_bdt > 0 || summary.today.attributed_orders > 0) && (
          <Card className="p-4 rounded-2xl border-gray-100 shadow-sm bg-gradient-to-br from-emerald-50/40 via-card to-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Live · Today {summary.today.date_bd}
                </h2>
              </div>
              <span className="text-[10px] text-muted-foreground">auto-refresh 5 min</span>
            </div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <TodayKpi icon={Wallet} label="Spend" value={fmtBDT(summary.today.spend_bdt)} sub={fmtUSD(summary.today.spend_usd)} />
              <TodayKpi icon={Receipt} label="Revenue" value={fmtBDT(summary.today.confirmed_revenue_bdt)} sub={`${summary.today.confirmed_orders} confirmed`} />
              <TodayKpi icon={Activity} label="Meta ROAS" value={fmtMult(summary.today.meta_roas)} sub="reported" />
              <TodayKpi
                icon={TrendingUp}
                label="Real ROAS"
                value={fmtMult(summary.today.confirmed_roas)}
                sub="confirmed"
                tone={
                  summary.today.confirmed_roas != null && summary.today.confirmed_roas >= 2
                    ? "good"
                    : summary.today.confirmed_roas != null && summary.today.confirmed_roas < 1
                      ? "bad"
                      : undefined
                }
              />
              <TodayKpi icon={ShoppingBag} label="Orders" value={fmtNum(summary.today.attributed_orders)} sub={`Meta: ${summary.today.meta_orders}`} />
              <TodayKpi icon={Target} label="CPO" value={summary.today.cpo_bdt != null ? fmtBDT(summary.today.cpo_bdt) : "—"} sub="cost / confirmed" />
            </div>
          </Card>
        )}

        {/* ── DECISION + FILTERS BAR ──────────────────────────────── */}
        <div className="rounded-xl border bg-card p-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              Decisions
            </span>
            {buckets.map(({ key, rows }) => {
              const d = DECISIONS[key];
              const isActive = bucketFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setBucketFilter(isActive ? "all" : key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all shrink-0 hover:shadow-sm",
                    isActive
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/40"
                      : "border-transparent bg-muted/40 hover:bg-muted",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", d.dot)} aria-hidden />
                  <span className={cn("font-medium", d.accent)}>{d.label}</span>
                  <span className={cn("tabular-nums font-semibold", d.accent)}>{rows.length}</span>
                </button>
              );
            })}
            <span className="hidden md:block h-5 w-px bg-border mx-1" />
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaigns…"
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true_roas">Sort: True ROAS</SelectItem>
                <SelectItem value="spend">Sort: Spend</SelectItem>
                <SelectItem value="profit">Sort: Profit</SelectItem>
                <SelectItem value="orders">Sort: Orders</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── CAMPAIGN BEAST ROWS ─────────────────────────────────── */}
        <div className="space-y-2.5">
          {isLoading && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Loading campaigns…
            </Card>
          )}
          {!isLoading && filtered.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              {allRows.length === 0
                ? "No campaigns synced yet. Connect an ad account and run sync."
                : "No campaigns match the current filters."}
            </Card>
          )}
          {filtered.map((row) => (
            <CampaignBeastCard
              key={row.campaign_id}
              row={row}
              pacing={pacingMap.get(row.campaign_id)}
              onManageProducts={() => setManageProductsFor(row)}
            />
          ))}
        </div>

        <p className="text-xs text-muted-foreground px-1">
          Spend BDT = USD × per-account FX. Decision: True ROAS ≥3 Scale · 2-3 Monitor · 1-2 Optimize · &lt;1 Kill. Min ৳330 spend to evaluate.
        </p>
      </div>

      {manageProductsFor && brandIds.length === 1 && (
        <ManageCampaignProductsDialog
          open={!!manageProductsFor}
          onOpenChange={(o) => {
            if (!o) setManageProductsFor(null);
          }}
          campaignId={manageProductsFor.campaign_id}
          campaignName={manageProductsFor.name}
          brandId={brandIds[0]}
          status={manageProductsFor.effective_status ?? manageProductsFor.status}
        />
      )}
    </TooltipProvider>
  );
}

// ─────────────────────────── HeroKpi ───────────────────────────
function HeroKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "indigo",
  emphasize = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "indigo" | "sky" | "violet" | "amber" | "emerald" | "rose";
  emphasize?: boolean;
}) {
  const toneCls: Record<string, { chip: string; value: string; bar: string }> = {
    indigo: { chip: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20", value: "text-foreground", bar: "from-indigo-500/60 to-indigo-500/0" },
    sky: { chip: "bg-sky-500/10 text-sky-600 ring-sky-500/20", value: "text-foreground", bar: "from-sky-500/60 to-sky-500/0" },
    violet: { chip: "bg-violet-500/10 text-violet-600 ring-violet-500/20", value: "text-foreground", bar: "from-violet-500/60 to-violet-500/0" },
    amber: { chip: "bg-amber-500/10 text-amber-600 ring-amber-500/20", value: "text-amber-600", bar: "from-amber-500/60 to-amber-500/0" },
    emerald: { chip: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20", value: "text-emerald-600", bar: "from-emerald-500/60 to-emerald-500/0" },
    rose: { chip: "bg-rose-500/10 text-rose-600 ring-rose-500/20", value: "text-rose-600", bar: "from-rose-500/60 to-rose-500/0" },
  };
  const t = toneCls[tone];
  return (
    <Card className="relative overflow-hidden p-4 transition-all hover:shadow-md hover:-translate-y-px">
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r", t.bar)} />
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("grid h-7 w-7 place-items-center rounded-lg ring-1", t.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div
        className={cn(
          "font-bold tracking-tight tabular-nums leading-none",
          emphasize ? "text-[28px]" : "text-2xl",
          emphasize ? t.value : "text-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1.5 truncate">{sub}</div>}
    </Card>
  );
}

function TodayKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl bg-card border border-gray-100 p-3 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{label}</span>
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[#1877F2]/8 text-[#1877F2]">
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <div
        className={cn(
          "text-xl font-bold tabular-nums leading-tight",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-red-600",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

// ─────────────────────────── Campaign Beast Card ───────────────────────────

function CampaignBeastCard({
  row,
  pacing,
  onManageProducts,
}: {
  row: PerfRow;
  pacing?: DashboardSummary["budgetPacing"][number];
  onManageProducts: () => void;
}) {
  const d = DECISIONS[row.decision];
  const products = row.products ?? [];
  const primary = products[0];
  const extra = products.length - 1;
  const s = (row.effective_status ?? row.status ?? "").toUpperCase();
  const isActive = s === "ACTIVE";

  const profitTone =
    row.profit_bdt > 0 ? "text-emerald-600" : row.profit_bdt < 0 ? "text-rose-600" : "text-muted-foreground";
  const trueRoasTone =
    row.true_roas == null
      ? "text-muted-foreground"
      : row.true_roas >= 2
        ? "text-emerald-600"
        : row.true_roas >= 1
          ? "text-amber-600"
          : "text-rose-600";

  return (
    <Card
      className={cn(
        "overflow-hidden border-gray-100 shadow-sm hover:shadow-md transition-all",
        "ring-1 ring-transparent hover:ring-[#1877F2]/20",
      )}
    >
      <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
        {/* LEFT: identity + stats */}
        <div className="p-4 min-w-0">
          {/* Identity */}
          <div className="flex items-start gap-3 mb-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn("relative shrink-0 rounded-lg p-0.5 ring-2", d.ring)}>
                  {primary?.image ? (
                    <img
                      src={primary.image}
                      alt={primary.title ?? ""}
                      className="h-12 w-12 rounded-md object-cover bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-md border border-dashed border-border bg-muted/40 flex items-center justify-center">
                      <Package className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                  )}
                  {extra > 0 && (
                    <span className="absolute -bottom-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-[#1877F2] text-white text-[9px] font-semibold flex items-center justify-center border border-background">
                      +{extra}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[240px]">
                {products.length === 0 ? (
                  <div className="text-xs">No products linked</div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Linked products ({products.length})
                    </div>
                    {products.slice(0, 6).map((p) => (
                      <div key={p.id} className="text-xs truncate">• {p.title ?? p.sku ?? p.id}</div>
                    ))}
                    {products.length > 6 && (
                      <div className="text-[10px] text-muted-foreground">+{products.length - 6} more…</div>
                    )}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to="/erp/marketing/campaigns/$campaignId"
                  params={{ campaignId: row.campaign_id }}
                  className="font-semibold text-sm truncate hover:text-[#1877F2] group inline-flex items-center gap-1"
                >
                  <span className="truncate">{row.name}</span>
                  <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0" />
                </Link>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", d.chip)}>
                  {d.label}
                </Badge>
                {isActive ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-0 text-[10px] px-1.5 py-0 h-4">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                    {s || "—"}
                  </Badge>
                )}
                {row.is_breakeven ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    </TooltipTrigger>
                    <TooltipContent>Above breakeven</TooltipContent>
                  </Tooltip>
                ) : row.total_spend_bdt > 0 ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    </TooltipTrigger>
                    <TooltipContent>Below breakeven</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {row.account_name ?? "—"} · {row.decision_reason}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={onManageProducts} className="gap-2">
                  <Package className="h-3.5 w-3.5" />
                  Manage Products
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="gap-2">
                  <Link to="/erp/marketing/campaigns/$campaignId" params={{ campaignId: row.campaign_id }}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Detail
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
            <StatCell label="Spend" value={fmtBDT(row.total_spend_bdt)} sub={fmtUSD(row.spend_usd)} />
            <StatCell label="Orders" value={String(row.delivered_orders)} sub={row.meta_purchases ? `Meta: ${row.meta_purchases}` : undefined} />
            <StatCell label="CPP" value={row.actual_cost_per_purchase_bdt != null ? fmtBDT(row.actual_cost_per_purchase_bdt) : "—"} sub={row.meta_cost_per_purchase != null ? `Meta ${fmtUSD(row.meta_cost_per_purchase)}` : undefined} />
            <StatCell label="Revenue" value={row.delivered_revenue_bdt > 0 ? fmtBDT(row.delivered_revenue_bdt) : "—"} />
            <StatCell label="Profit" value={row.total_spend_bdt > 0 ? fmtBDT(row.profit_bdt) : "—"} valueClass={profitTone} sub={row.margin_pct != null ? `${fmtPct(row.margin_pct * 100, 1)} margin` : undefined} />
            <StatCell label="True ROAS" value={fmtMult(row.true_roas)} valueClass={cn("font-bold", trueRoasTone)} sub={`Meta ${fmtMult(row.meta_roas)}`} />
          </div>

          {/* CTR / clicks small row */}
          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
            <span>Impr {fmtNum(row.impressions)}</span>
            <span>·</span>
            <span>Clicks {fmtNum(row.clicks)}</span>
            <span>·</span>
            <span>CTR {fmtPct(row.ctr)}</span>
            <span>·</span>
            <span>CPC {row.cpc != null ? fmtUSD(row.cpc) : "—"}</span>
            {row.total_spend_bdt > 0 && <BreakevenPopover row={row} />}
          </div>
        </div>

        {/* RIGHT: BUDGET PACING PANEL */}
        <div className="border-t lg:border-t-0 lg:border-l border-gray-100 bg-gradient-to-br from-muted/30 to-transparent p-4 lg:w-[300px] flex flex-col justify-center">
          {pacing ? (
            <BudgetPanel pacing={pacing} />
          ) : isActive ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              <Zap className="h-4 w-4 mx-auto mb-1 opacity-50" />
              No budget data
              <div className="text-[10px] mt-0.5">ABO/CBO not synced</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-4">
              <span className="opacity-50">Paused — no live budget</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function StatCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums mt-0.5 truncate", valueClass)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/80 truncate">{sub}</div>}
    </div>
  );
}

function BudgetPanel({ pacing }: { pacing: DashboardSummary["budgetPacing"][number] }) {
  const pct = Math.min(100, pacing.pct);
  const tone =
    pacing.status === "over" ? "bg-red-500" : pacing.status === "warn" ? "bg-amber-500" : "bg-emerald-500";
  const statusBadge =
    pacing.status === "over" ? (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px] px-1.5 py-0 h-4 animate-pulse">Over</Badge>
    ) : pacing.status === "warn" ? (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] px-1.5 py-0 h-4">Near</Badge>
    ) : (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] px-1.5 py-0 h-4">On track</Badge>
    );
  const projected = pacing.projected_monthly_bdt || pacing.spent_today_bdt * 30;
  const projectedUsd = pacing.projected_monthly_usd || pacing.spent_today_usd * 30;
  const hasLifetime = pacing.lifetime_budget_bdt != null && pacing.lifetime_budget_bdt > 0;
  const lifetimePct = Math.min(100, pacing.pct_lifetime ?? 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Budget
        </span>
        {statusBadge}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-base font-bold tabular-nums truncate">
            {fmtBDT(pacing.daily_budget_bdt)}
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {fmtUSD(pacing.daily_budget_usd)}/day
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold tabular-nums">{pacing.pct.toFixed(0)}%</div>
          <div className="text-[10px] text-muted-foreground">used</div>
        </div>
      </div>

      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full transition-all", tone, pacing.status === "over" && "animate-pulse")}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] tabular-nums">
        <span className="text-muted-foreground">Spent today</span>
        <span className="font-medium">
          {fmtBDT(pacing.spent_today_bdt)}
          <span className="text-muted-foreground/70 ml-1">({fmtUSD(pacing.spent_today_usd)})</span>
        </span>
      </div>

      {hasLifetime && (
        <div className="pt-2 border-t border-gray-100 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">Lifetime</span>
            <span className="tabular-nums font-medium">{lifetimePct.toFixed(0)}%</span>
          </div>
          <div className="flex items-baseline justify-between text-[11px] tabular-nums">
            <span>
              <span className="font-medium">{fmtBDT(pacing.lifetime_budget_bdt!)}</span>
              <span className="text-muted-foreground/70"> ({fmtUSD(pacing.lifetime_budget_usd ?? 0)})</span>
            </span>
            <span className="text-muted-foreground">
              MTD <span className="text-foreground">{fmtBDT(pacing.spent_this_month_bdt)}</span>
            </span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${lifetimePct}%` }} />
          </div>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground pt-1 border-t border-gray-100">
        Projected <span className="font-medium text-foreground">{fmtBDT(projected)}</span> ({fmtUSD(projectedUsd)})/month
      </div>
    </div>
  );
}

// ─────────────────────────── Breakeven popover ───────────────────────────
function BreakevenPopover({ row }: { row: PerfRow }) {
  const isBE = row.is_breakeven;
  const minRoasRequired =
    row.total_spend_bdt > 0 ? row.breakeven_revenue_bdt / row.total_spend_bdt : null;
  const avgOrderValue =
    row.delivered_orders > 0 ? row.delivered_revenue_bdt / row.delivered_orders : null;
  const avgMargin =
    row.delivered_revenue_bdt > 0
      ? (row.delivered_revenue_bdt - row.cogs_bdt - row.operating_cost_bdt) / row.delivered_revenue_bdt
      : null;
  const maxCpp = avgOrderValue && avgMargin != null ? avgOrderValue * avgMargin : null;
  const metaCppTarget = maxCpp != null && row.fx_rate > 0 ? maxCpp / row.fx_rate : null;
  const deliveryRate = row.meta_purchases > 0 ? row.delivered_orders / row.meta_purchases : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="ml-auto text-[11px] text-[#1877F2] hover:underline shrink-0">
          Breakeven →
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Breakeven Analysis</div>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                isBE ? "border-emerald-500/40 text-emerald-600" : "border-rose-500/40 text-rose-600",
              )}
            >
              {isBE ? "Profitable ✓" : "Below breakeven"}
            </Badge>
          </div>
          <div className="space-y-1 border-t pt-2">
            <Stat label="Current Profit" value={fmtBDT(row.profit_bdt)} tone={isBE ? "good" : "bad"} />
            <Stat label="Revenue needed" value={fmtBDT(row.breakeven_revenue_bdt)} />
            <Stat
              label="Gap to breakeven"
              value={isBE ? "—" : fmtBDT(Math.max(0, row.breakeven_revenue_bdt - row.delivered_revenue_bdt))}
              tone={isBE ? "good" : "bad"}
            />
          </div>
          <div className="border-t pt-2">
            <div className="font-semibold text-foreground mb-1">Actual targets (BDT)</div>
            <Stat label="Max CPP allowed" value={maxCpp != null ? fmtBDT(maxCpp) : "Need delivered orders"} />
            <Stat label="Min ROAS required" value={minRoasRequired != null ? fmtMult(minRoasRequired) : "—"} />
          </div>
          <div className="border-t pt-2">
            <div className="font-semibold text-foreground mb-1">Meta targets (USD)</div>
            <Stat label="Meta CPP target" value={metaCppTarget != null ? fmtUSD(metaCppTarget) : "—"} hint="Cap CPP in Ads Manager" />
            <Stat label="Meta ROAS target" value={minRoasRequired != null ? fmtMult(minRoasRequired) : "—"} />
            <Stat
              label="Delivery rate"
              value={deliveryRate != null ? fmtPct(deliveryRate * 100, 1) : "—"}
              hint={deliveryRate != null && deliveryRate < 0.6 ? "Low — confirm orders" : undefined}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  hint?: string;
}) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-foreground";
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-right">
        <div className={cn("font-medium tabular-nums", cls)}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground italic mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}