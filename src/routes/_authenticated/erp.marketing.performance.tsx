import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import {
  getPerformanceDashboard,
  type PerfRow,
  type DecisionBucket,
} from "@/lib/erp/marketing/performance.functions";
import { syncBrandInsightsRange } from "@/lib/erp/marketing/meta.functions";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
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
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/erp/marketing/performance")({
  component: PerformanceTablePage,
});

// ─────────────────────────── helpers ───────────────────────────

function fmtUSD(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function fmtBDT(n: number) {
  return `৳${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString();
}
function fmtPct(n: number | null, digits = 2) {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}
function fmtMult(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(2)}×`;
}

// ─────────────────────────── decision config ───────────────────────────

const DECISIONS: Record<
  DecisionBucket,
  { label: string; cls: string; dot: string; chip: string; icon: string; accent: string }
> = {
  scale: {
    label: "Scale Up",
    cls: "border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.02] hover:from-emerald-500/15",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: "🚀",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  monitor: {
    label: "Monitor",
    cls: "border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02] hover:from-amber-500/15",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    icon: "👀",
    accent: "text-amber-600 dark:text-amber-400",
  },
  optimize: {
    label: "Optimize",
    cls: "border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-500/[0.02] hover:from-purple-500/15",
    dot: "bg-purple-500",
    chip: "bg-purple-50 text-purple-700 border-purple-200",
    icon: "⚙️",
    accent: "text-purple-600 dark:text-purple-400",
  },
  kill: {
    label: "Kill",
    cls: "border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-rose-500/[0.02] hover:from-rose-500/15",
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-600 border-red-200",
    icon: "💀",
    accent: "text-rose-600 dark:text-rose-400",
  },
  insufficient: {
    label: "Not enough data",
    cls: "border-border bg-muted/40",
    dot: "bg-muted-foreground",
    chip: "bg-gray-50 text-gray-600 border-gray-200",
    icon: "•",
    accent: "text-muted-foreground",
  },
};

// ─────────────────────────── page ───────────────────────────

function PerformanceTablePage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const [dateRange, setDateRange] = useState<MktRangeValue>(() => buildPreset("7d"));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"meta" | "actual">("actual");
  const [bucketFilter, setBucketFilter] = useState<DecisionBucket | "all">("all");
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  const [manageProductsFor, setManageProductsFor] = useState<PerfRow | null>(null);

  const r = useMemo(() => ({ from: dateRange.from, to: dateRange.to }), [dateRange.from, dateRange.to]);

  const fn = useServerFn(getPerformanceDashboard);
  const syncRangeFn = useServerFn(syncBrandInsightsRange);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["mkt-performance", brandId, r.from, r.to],
    queryFn: () => fn({ data: { brandId: brandId!, ...r } }),
    enabled: !!brandId,
    staleTime: 30_000,
  });

  async function refreshMetaRange() {
    if (!brandId) return;
    setIsSyncingMeta(true);
    try {
      const res = await syncRangeFn({ data: { brandId, since: r.from, until: r.to } });
      toast.success(`Meta synced • ${res.rows} rows`);
      await q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Meta sync failed");
    } finally {
      setIsSyncingMeta(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setBucketFilter("all");
    setDateRange(buildPreset("7d"));
    toast.success("Filters reset");
  }

  async function refreshData() {
    await qc.invalidateQueries({ queryKey: ["mkt-performance", brandId] });
    toast.success("Data refreshed");
  }

  const allRows = q.data?.rows ?? [];
  const totals = q.data?.totals;

  const filtered = allRows.filter((row) => {
    if (search && !row.name.toLowerCase().includes(search.toLowerCase()) && !row.external_id.includes(search))
      return false;
    if (statusFilter !== "all") {
      const s = (row.effective_status ?? row.status ?? "").toUpperCase();
      if (statusFilter === "active" && s !== "ACTIVE") return false;
      if (statusFilter === "paused" && s !== "PAUSED") return false;
    }
    if (bucketFilter !== "all" && row.decision !== bucketFilter) return false;
    return true;
  });

  const buckets = (["scale", "monitor", "optimize", "kill"] as DecisionBucket[]).map((b) => ({
    key: b,
    rows: allRows.filter((row) => row.decision === b),
  }));

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-5">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight">Ad Performance</h1>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {effectiveBrand?.name ?? "—"} · Meta data vs delivered orders, BDT te true profit & decision.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            {picker}
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <Button
              variant="outline"
              onClick={refreshMetaRange}
              disabled={q.isFetching || isSyncingMeta}
              title="Sync selected Meta range"
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", (q.isFetching || isSyncingMeta) && "animate-spin")} />
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

        {/* HEADLINE METRICS — what a senior marketer reads first */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <HeroKpi
            icon={Wallet}
            label="Spend"
            value={totals ? fmtBDT(totals.total_spend_bdt) : "—"}
            sub={totals ? fmtUSD(totals.total_spend_usd) : ""}
            tone="sky"
          />
          <HeroKpi
            icon={Receipt}
            label="Revenue"
            value={totals ? fmtBDT(totals.delivered_revenue_bdt) : "—"}
            sub="delivered"
            tone="violet"
          />
          <HeroKpi
            icon={totals && totals.profit_bdt >= 0 ? TrendingUp : TrendingDown}
            label="Profit"
            value={totals ? fmtBDT(totals.profit_bdt) : "—"}
            sub={
              totals
                ? `${fmtPct(totals.margin_pct == null ? null : totals.margin_pct * 100, 1)} margin`
                : ""
            }
            tone={
              !totals
                ? "indigo"
                : totals.profit_bdt > 0
                  ? "emerald"
                  : totals.profit_bdt < 0
                    ? "rose"
                    : "indigo"
            }
            emphasize
          />
          <HeroKpi
            icon={Target}
            label="True ROAS"
            value={totals ? fmtMult(totals.true_roas) : "—"}
            sub={totals ? `Meta ${fmtMult(totals.meta_roas)}` : ""}
            tone={
              !totals || totals.true_roas == null
                ? "indigo"
                : totals.true_roas >= 2
                  ? "emerald"
                  : totals.true_roas >= 1
                    ? "amber"
                    : "rose"
            }
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

        {/* COMPACT DECISION STRIP — quick filter, much smaller than before */}
        <div className="rounded-xl border bg-card/40 p-2">
          <div className="flex items-center gap-2 overflow-x-auto">
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
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all shrink-0 hover:shadow-sm",
                    isActive
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/40"
                      : "border-transparent bg-background hover:border-border",
                  )}
                  title={d.label}
                >
                  <span className={cn("h-2 w-2 rounded-full", d.dot)} aria-hidden />
                  <span className={cn("font-medium", d.accent)}>{d.label}</span>
                  <span className={cn("tabular-nums font-semibold", d.accent)}>{rows.length}</span>
                </button>
              );
            })}
            {bucketFilter !== "all" && (
              <button
                onClick={() => setBucketFilter("all")}
                className="ml-auto text-[11px] text-primary hover:underline shrink-0 pr-2"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>


        {/* Filter bar + view toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns or IDs…"
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList>
              <TabsTrigger value="meta">Meta Ads Data</TabsTrigger>
              <TabsTrigger value="actual">Actual Results</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {view === "meta" ? <MetaHead /> : <ActualHead />}
              </TableHeader>
              <TableBody>
                {q.isLoading && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-sm text-muted-foreground">
                      Loading performance data…
                    </TableCell>
                  </TableRow>
                )}
                {!q.isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-10 text-sm text-muted-foreground">
                      {allRows.length === 0
                        ? "No campaigns synced yet. Connect an ad account and run sync."
                        : "No campaigns match the current filters."}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((row) =>
                  view === "meta" ? (
                    <MetaRow
                      key={row.campaign_id}
                      row={row}
                      onManageProducts={() => setManageProductsFor(row)}
                    />
                  ) : (
                    <ActualRow
                      key={row.campaign_id}
                      row={row}
                      onManageProducts={() => setManageProductsFor(row)}
                    />
                  ),
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground">
          Spend BDT = USD × per-account FX rate. Decision rules: True ROAS ≥3 → Scale, 2-3 → Monitor, 1-2 → Optimize, &lt;1 → Kill. Min ৳330 spend chai evaluate korte.
        </p>
      </div>

      {manageProductsFor && brandId && (
        <ManageCampaignProductsDialog
          open={!!manageProductsFor}
          onOpenChange={(o) => {
            if (!o) setManageProductsFor(null);
          }}
          campaignId={manageProductsFor.campaign_id}
          campaignName={manageProductsFor.name}
          brandId={brandId}
          status={manageProductsFor.effective_status ?? manageProductsFor.status}
        />
      )}
    </TooltipProvider>
  );
}

// ─────────────────────────── sub-components ───────────────────────────

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
    indigo: {
      chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/20",
      value: "text-foreground",
      bar: "from-indigo-500/60 to-indigo-500/0",
    },
    sky: {
      chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
      value: "text-foreground",
      bar: "from-sky-500/60 to-sky-500/0",
    },
    violet: {
      chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20",
      value: "text-foreground",
      bar: "from-violet-500/60 to-violet-500/0",
    },
    amber: {
      chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
      value: "text-amber-600 dark:text-amber-400",
      bar: "from-amber-500/60 to-amber-500/0",
    },
    emerald: {
      chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
      value: "text-emerald-600 dark:text-emerald-400",
      bar: "from-emerald-500/60 to-emerald-500/0",
    },
    rose: {
      chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
      value: "text-rose-600 dark:text-rose-400",
      bar: "from-rose-500/60 to-rose-500/0",
    },
  };
  const t = toneCls[tone];
  return (
    <Card className="relative overflow-hidden p-4 transition-all hover:shadow-md hover:-translate-y-px">
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r", t.bar)}
      />
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("grid h-7 w-7 place-items-center rounded-lg ring-1", t.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
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

function StatusBadge({ row }: { row: PerfRow }) {
  const s = (row.effective_status ?? row.status ?? "").toUpperCase();
  if (s === "ACTIVE")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 border-0">
        Active
      </Badge>
    );
  if (s === "PAUSED")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Paused
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {s || "—"}
    </Badge>
  );
}

function CampaignCell({ row }: { row: PerfRow }) {
  const d = DECISIONS[row.decision];
  const products = row.products ?? [];
  const primary = products[0];
  const extra = products.length - 1;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", d.dot)} />
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="font-semibold">{d.label}</div>
          <div className="text-xs">{row.decision_reason}</div>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative shrink-0">
            {primary?.image ? (
              <img
                src={primary.image}
                alt={primary.title ?? ""}
                className="h-9 w-9 rounded-md object-cover border border-border bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="h-9 w-9 rounded-md border border-dashed border-border bg-muted/40 flex items-center justify-center">
                <Package className="h-4 w-4 text-muted-foreground/60" />
              </div>
            )}
            {extra > 0 && (
              <span className="absolute -bottom-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center border border-background">
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
                <div key={p.id} className="text-xs truncate">
                  • {p.title ?? p.sku ?? p.id}
                </div>
              ))}
              {products.length > 6 && (
                <div className="text-[10px] text-muted-foreground">
                  +{products.length - 6} more…
                </div>
              )}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
      <Link
        to="/erp/marketing/campaigns/$campaignId"
        params={{ campaignId: row.campaign_id }}
        className="min-w-0 group"
      >
        <div className="flex items-center gap-1 font-medium truncate group-hover:text-primary">
          {row.name}
          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0" />
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {row.account_name ?? "—"}
        </div>
      </Link>
    </div>
  );
}

function SpendCell({ row }: { row: PerfRow }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">
          <div className="font-medium tabular-nums">{fmtBDT(row.total_spend_bdt)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{fmtUSD(row.spend_usd)}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-0.5">
          <div>Meta spend: {fmtUSD(row.spend_usd)} ({row.account_currency})</div>
          <div>Manual: {fmtBDT(row.manual_spend_bdt)}</div>
          <div className="border-t pt-0.5 mt-0.5">Total: {fmtBDT(row.total_spend_bdt)}</div>
          <div className="text-muted-foreground">Rate: 1 {row.account_currency} = ৳{row.fx_rate}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─────────────────────────── Meta view ───────────────────────────

function MetaHead() {
  return (
    <TableRow>
      <TableHead className="min-w-[240px]">Campaign</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Spend</TableHead>
      <TableHead className="text-right">Impr.</TableHead>
      <TableHead className="text-right">Clicks</TableHead>
      <TableHead className="text-right">CTR</TableHead>
      <TableHead className="text-right">CPC</TableHead>
      <TableHead className="text-right">Meta Purch.</TableHead>
      <TableHead className="text-right">CPP</TableHead>
      <TableHead className="text-right">Meta ROAS</TableHead>
      <TableHead className="w-10" />
    </TableRow>
  );
}

function MetaRow({ row, onManageProducts }: { row: PerfRow; onManageProducts: () => void }) {
  return (
    <TableRow>
      <TableCell>
        <CampaignCell row={row} />
      </TableCell>
      <TableCell>
        <StatusBadge row={row} />
      </TableCell>
      <TableCell className="text-right">
        <SpendCell row={row} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtNum(row.impressions)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtNum(row.clicks)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtPct(row.ctr)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.cpc != null ? fmtUSD(row.cpc) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.meta_purchases || "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.meta_cost_per_purchase != null ? fmtUSD(row.meta_cost_per_purchase) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">{fmtMult(row.meta_roas)}</TableCell>
      <TableCell className="text-right">
        <RowActionsMenu row={row} onManageProducts={onManageProducts} />
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────── Actual view ───────────────────────────

function ActualHead() {
  return (
    <TableRow>
      <TableHead className="min-w-[240px]">Campaign</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Spend</TableHead>
      <TableHead className="text-right">Orders</TableHead>
      <TableHead className="text-right">CPP</TableHead>
      <TableHead className="text-right">Revenue</TableHead>
      <TableHead className="text-right">Profit</TableHead>
      <TableHead className="text-right">Margin</TableHead>
      <TableHead className="text-center">Breakeven</TableHead>
      <TableHead className="text-right">Meta ROAS</TableHead>
      <TableHead className="text-right">True ROAS</TableHead>
      <TableHead className="w-10" />
    </TableRow>
  );
}

function ActualRow({ row, onManageProducts }: { row: PerfRow; onManageProducts: () => void }) {
  const profitTone =
    row.profit_bdt > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : row.profit_bdt < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  const trueRoasTone =
    row.true_roas == null
      ? "text-muted-foreground"
      : row.true_roas >= 2
        ? "text-emerald-600 dark:text-emerald-400"
        : row.true_roas >= 1
          ? "text-amber-600 dark:text-amber-400"
          : "text-rose-600 dark:text-rose-400";
  return (
    <TableRow>
      <TableCell>
        <CampaignCell row={row} />
      </TableCell>
      <TableCell>
        <StatusBadge row={row} />
      </TableCell>
      <TableCell className="text-right">
        <SpendCell row={row} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <div>{row.delivered_orders}</div>
        {row.meta_purchases > 0 && row.meta_purchases !== row.delivered_orders && (
          <div className="text-xs text-muted-foreground">Meta: {row.meta_purchases}</div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.actual_cost_per_purchase_bdt != null ? fmtBDT(row.actual_cost_per_purchase_bdt) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.delivered_revenue_bdt > 0 ? fmtBDT(row.delivered_revenue_bdt) : "—"}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums font-medium", profitTone)}>
        {row.total_spend_bdt > 0 ? fmtBDT(row.profit_bdt) : "—"}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", profitTone)}>
        {row.margin_pct != null ? fmtPct(row.margin_pct * 100, 1) : "—"}
      </TableCell>
      <TableCell className="text-center">
        {row.total_spend_bdt === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <BreakevenPopover row={row} />
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmtMult(row.meta_roas)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums font-semibold", trueRoasTone)}>
        {fmtMult(row.true_roas)}
      </TableCell>
      <TableCell className="text-right">
        <RowActionsMenu row={row} onManageProducts={onManageProducts} />
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────── Row actions + Breakeven popover ───────────────────────────

function RowActionsMenu({
  row,
  onManageProducts,
}: {
  row: PerfRow;
  onManageProducts: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onManageProducts} className="gap-2">
          <Package className="h-3.5 w-3.5" />
          Manage Products
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <Link
            to="/erp/marketing/campaigns/$campaignId"
            params={{ campaignId: row.campaign_id }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Campaign Detail
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BreakevenPopover({ row }: { row: PerfRow }) {
  const isBE = row.is_breakeven;
  // Calculate Min ROAS required = (cogs + op + spend) / spend
  const minRoasRequired =
    row.total_spend_bdt > 0
      ? (row.breakeven_revenue_bdt) / row.total_spend_bdt
      : null;
  // Max CPP based on avg order value if we have delivered orders
  const avgOrderValue =
    row.delivered_orders > 0 ? row.delivered_revenue_bdt / row.delivered_orders : null;
  const avgMargin =
    row.delivered_revenue_bdt > 0
      ? (row.delivered_revenue_bdt - row.cogs_bdt - row.operating_cost_bdt) /
        row.delivered_revenue_bdt
      : null;
  const maxCpp = avgOrderValue && avgMargin != null ? avgOrderValue * avgMargin : null;
  // Meta-side targets (USD)
  const metaCppTarget =
    maxCpp != null && row.fx_rate > 0 ? maxCpp / row.fx_rate : null;
  const metaRoasTarget = minRoasRequired; // same multiplier
  // Delivery rate: delivered orders / meta purchases
  const deliveryRate =
    row.meta_purchases > 0 ? row.delivered_orders / row.meta_purchases : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center justify-center">
          {isBE ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-rose-500" />
          )}
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
                isBE
                  ? "border-emerald-500/40 text-emerald-600"
                  : "border-rose-500/40 text-rose-600",
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
              value={
                isBE
                  ? "—"
                  : fmtBDT(Math.max(0, row.breakeven_revenue_bdt - row.delivered_revenue_bdt))
              }
              tone={isBE ? "good" : "bad"}
            />
          </div>

          <div className="border-t pt-2">
            <div className="font-semibold text-foreground mb-1">Actual targets (BDT)</div>
            <Stat
              label="Max CPP allowed"
              value={maxCpp != null ? fmtBDT(maxCpp) : "Need delivered orders"}
            />
            <Stat
              label="Min ROAS required"
              value={minRoasRequired != null ? fmtMult(minRoasRequired) : "—"}
            />
          </div>

          <div className="border-t pt-2">
            <div className="font-semibold text-foreground mb-1">Meta targets (USD)</div>
            <Stat
              label="Meta CPP target"
              value={metaCppTarget != null ? fmtUSD(metaCppTarget) : "—"}
              hint="Set this as your CPP cap in Ads Manager"
            />
            <Stat
              label="Meta ROAS target"
              value={metaRoasTarget != null ? fmtMult(metaRoasTarget) : "—"}
              hint="Meta should show this ROAS for breakeven"
            />
            <Stat
              label="Delivery rate"
              value={deliveryRate != null ? fmtPct(deliveryRate * 100, 1) : "—"}
              hint={
                deliveryRate != null && deliveryRate < 0.6
                  ? "Low delivery — confirm orders are converting"
                  : undefined
              }
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
  const cls =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
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
