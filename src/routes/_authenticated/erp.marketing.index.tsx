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
  Eye,
  MousePointerClick,
  ShoppingBag,
  Wallet,
  TrendingUp,
  TrendingDown,
  Minus,
  XCircle,
  CheckCircle2,
  Search,
  RefreshCw,
  ArrowUpRight,
  MoreHorizontal,
  Package,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  component: PerformanceDashboard,
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
  { label: string; cls: string; dot: string; chip: string }
> = {
  scale: {
    label: "Scale Up",
    cls: "border-emerald-500/30 bg-emerald-500/5",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  monitor: {
    label: "Monitor",
    cls: "border-amber-500/30 bg-amber-500/5",
    dot: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  optimize: {
    label: "Optimize",
    cls: "border-orange-500/30 bg-orange-500/5",
    dot: "bg-orange-500",
    chip: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  kill: {
    label: "Kill",
    cls: "border-rose-500/30 bg-rose-500/5",
    dot: "bg-rose-500",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
  insufficient: {
    label: "Not enough data",
    cls: "border-border bg-muted/30",
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
  },
};

// ─────────────────────────── page ───────────────────────────

function PerformanceDashboard() {
  const { brandId, effectiveBrand, gate } = useBrandPicker();
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

  if (gate) return gate;

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
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ad Performance</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Meta ad-er real performance — Meta data vs delivered orders, BDT te true profit & decision.
            </p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* KPI strip */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <KpiCard
            icon={Activity}
            label="Active Campaigns"
            value={totals ? totals.active_campaigns.toString() : "—"}
            sub={`${allRows.length} total`}
          />
          <KpiCard
            icon={Wallet}
            label="Total Spend"
            value={totals ? fmtBDT(totals.total_spend_bdt) : "—"}
            sub={totals ? `${fmtUSD(totals.total_spend_usd)} USD` : ""}
          />
          <KpiCard
            icon={Eye}
            label="Impressions"
            value={totals ? fmtNum(totals.impressions) : "—"}
            sub={totals ? `${fmtPct(totals.ctr)} CTR` : ""}
          />
          <KpiCard
            icon={MousePointerClick}
            label="Clicks"
            value={totals ? fmtNum(totals.clicks) : "—"}
            sub={
              totals && totals.clicks > 0
                ? `${fmtBDT(totals.total_spend_bdt / totals.clicks)} CPC`
                : ""
            }
          />
          <KpiCard
            icon={ShoppingBag}
            label="Delivered Orders"
            value={totals ? totals.delivered_orders.toString() : "—"}
            sub={
              totals && totals.delivered_orders > 0
                ? `${fmtBDT(totals.total_spend_bdt / totals.delivered_orders)}/order`
                : `Meta: ${totals?.meta_purchases ?? 0}`
            }
          />
        </div>

        {/* Profit / ROAS strip (only Actual view) */}
        {view === "actual" && totals && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <SmallStat label="Revenue" value={fmtBDT(totals.delivered_revenue_bdt)} />
            <SmallStat
              label="Profit"
              value={fmtBDT(totals.profit_bdt)}
              tone={totals.profit_bdt > 0 ? "good" : totals.profit_bdt < 0 ? "bad" : "neutral"}
              icon={
                totals.profit_bdt > 0 ? TrendingUp : totals.profit_bdt < 0 ? TrendingDown : Minus
              }
            />
            <SmallStat
              label="Margin"
              value={fmtPct(totals.margin_pct == null ? null : totals.margin_pct * 100, 1)}
              tone={
                totals.margin_pct == null
                  ? "neutral"
                  : totals.margin_pct > 0
                    ? "good"
                    : "bad"
              }
            />
            <SmallStat
              label="True ROAS"
              value={fmtMult(totals.true_roas)}
              tone={
                totals.true_roas == null
                  ? "neutral"
                  : totals.true_roas >= 2
                    ? "good"
                    : totals.true_roas >= 1
                      ? "neutral"
                      : "bad"
              }
              sub={`Meta ROAS ${fmtMult(totals.meta_roas)}`}
            />
          </div>
        )}

        {/* Decision buckets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Campaign Decisions</h2>
            <span className="text-xs text-muted-foreground">
              {bucketFilter === "all"
                ? "Click a bucket to filter table"
                : `Filtering: ${DECISIONS[bucketFilter].label}`}
              {bucketFilter !== "all" && (
                <button
                  onClick={() => setBucketFilter("all")}
                  className="ml-2 text-primary hover:underline"
                >
                  clear
                </button>
              )}
            </span>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {buckets.map(({ key, rows }) => {
              const d = DECISIONS[key];
              const isActive = bucketFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setBucketFilter(isActive ? "all" : key)}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-all hover:shadow-sm",
                    d.cls,
                    isActive && "ring-2 ring-primary",
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", d.dot)} />
                      <span className="text-sm font-semibold">{d.label}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{rows.length}</span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No campaigns</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {rows.slice(0, 3).map((row) => (
                        <li key={row.campaign_id} className="text-xs">
                          <div className="truncate font-medium">{row.name}</div>
                          <div className="text-muted-foreground">
                            {fmtBDT(row.total_spend_bdt)} · {fmtMult(row.true_roas)}
                          </div>
                        </li>
                      ))}
                      {rows.length > 3 && (
                        <li className="text-xs text-muted-foreground">
                          +{rows.length - 3} more
                        </li>
                      )}
                    </ul>
                  )}
                </button>
              );
            })}
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

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function SmallStat({
  label,
  value,
  sub,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums flex items-center gap-1.5", toneCls)}>
        {Icon && <Icon className="h-4 w-4" />}
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
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
