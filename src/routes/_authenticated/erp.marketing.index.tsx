import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LastSyncedBadge } from "@/components/erp/marketing/last-synced-badge";
import { useMultiBrandPicker } from "@/components/erp/brand-picker-gate";
import { cn } from "@/lib/utils";
import {
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Zap,
  Target,
  ShoppingBag,
  Wallet,
  Receipt,
  ChevronRight,
} from "lucide-react";
import {
  getMarketingPulse,
  type PulseMover,
  type PulseRollupPeriod,
  type PulseData,
} from "@/lib/erp/marketing/pulse.functions";
import { syncBrandInsightsRange } from "@/lib/erp/marketing/meta.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  component: MarketingPulse,
});

// ── formatters ─────────────────────────────────────────
const fmtBDT = (n: number) => `৳${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtUSD = (n: number) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => (Number(n) || 0).toLocaleString();
const fmtMult = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);
const fmtPct = (n: number | null, digits = 1) =>
  n == null ? "—" : `${n.toFixed(digits)}%`;
const localYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayBDStr = () =>
  localYmd(new Date(Date.now() + 6 * 3600 * 1000 - new Date().getTimezoneOffset() * 60000));

// ── page ─────────────────────────────────────────
function MarketingPulse() {
  const { brandIds, selectedBrands, picker } = useMultiBrandPicker();
  const hasBrand = brandIds.length > 0;
  const brandLabel =
    selectedBrands.length === 0
      ? "—"
      : selectedBrands.length === 1
        ? selectedBrands[0].name
        : `${selectedBrands.length} brands`;

  const pulseFn = useServerFn(getMarketingPulse);
  const syncRangeFn = useServerFn(syncBrandInsightsRange);
  const [isSyncing, setIsSyncing] = useState(false);

  const pulseQ = useQuery({
    queryKey: ["mkt", "pulse", brandIds.slice().sort().join(",")],
    queryFn: () => pulseFn({ data: { brandIds } }),
    enabled: hasBrand,
    staleTime: 60_000,
    refetchInterval: 5 * 60 * 1000,
  });

  async function syncMeta() {
    if (!hasBrand) return;
    setIsSyncing(true);
    const today = todayBDStr();
    try {
      let rows = 0;
      for (const bid of brandIds) {
        const res = await syncRangeFn({
          data: { brandId: bid, since: today, until: today },
        });
        rows += res.rows ?? 0;
      }
      toast.success(`Meta synced · ${rows} rows`);
      await pulseQ.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Meta sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  const data = pulseQ.data;
  const loading = pulseQ.isLoading;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[#1877F2]/5 via-background to-background p-5">
          <div
            className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#1877F2]/10 blur-3xl"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1877F2]/10 text-[#1877F2] ring-1 ring-[#1877F2]/20">
                <Activity className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight">
                  Pulse
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {brandLabel} · Today's live money, ROAS reality, movers & rollup.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {picker}
              <LastSyncedBadge brandIds={brandIds} />
              <Button
                onClick={syncMeta}
                disabled={pulseQ.isFetching || isSyncing || !hasBrand}
                className="gap-2 bg-[#1877F2] hover:bg-[#1877F2]/90"
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    (pulseQ.isFetching || isSyncing) && "animate-spin",
                  )}
                />
                Sync Today
              </Button>
            </div>
          </div>
        </div>

        {!hasBrand && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Pick a brand to see the pulse.
          </Card>
        )}

        {hasBrand && loading && !data && (
          <div className="grid gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl border bg-muted/30"
              />
            ))}
          </div>
        )}

        {hasBrand && data && (
          <>
            <TodayStrip d={data.today} />
            <RealityStrip d={data.today} />
            <MoversStrip
              top={data.movers.top}
              bottom={data.movers.bottom}
              window={data.movers.window}
            />
            <RollupStrip r={data.rollup} />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─────────────────── 1. TODAY STRIP ───────────────────
function TodayStrip({ d }: { d: PulseData["today"] }) {
  const roas = d.delivered_roas ?? d.confirmed_roas;
  const roasTone =
    roas == null ? "indigo" : roas >= 2 ? "emerald" : roas >= 1 ? "amber" : "rose";
  return (
    <Card className="p-4 rounded-2xl border-gray-100 shadow-sm bg-gradient-to-br from-emerald-50/40 via-card to-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Today · {d.date_bd}
          </h2>
          {d.cost_missing_units > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-300 bg-amber-50 text-amber-700"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {fmtNum(d.cost_missing_units)} units w/o cost
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Profit may be understated — set cost prices in Inventory.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">auto-refresh 5 min</span>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <TodayKpi
          icon={Wallet}
          label="Spend"
          value={fmtBDT(d.spend_bdt)}
          sub={fmtUSD(d.spend_usd)}
        />
        <TodayKpi
          icon={Receipt}
          label="Revenue"
          value={fmtBDT(d.delivered_revenue_bdt)}
          sub={`${fmtBDT(d.confirmed_revenue_bdt)} confirmed`}
        />
        <TodayKpi
          icon={Target}
          label="Real ROAS"
          value={fmtMult(d.delivered_roas)}
          sub={`Confirmed ${fmtMult(d.confirmed_roas)}`}
          tone={roasTone === "emerald" ? "good" : roasTone === "rose" ? "bad" : undefined}
        />
        <TodayKpi
          icon={Activity}
          label="Meta ROAS"
          value={fmtMult(d.meta_roas)}
          sub="reported"
        />
        <TodayKpi
          icon={ShoppingBag}
          label="Orders"
          value={fmtNum(d.delivered_orders)}
          sub={`${d.confirmed_orders} confirmed · Meta ${d.meta_orders}`}
        />
        <TodayKpi
          icon={Zap}
          label="CPO"
          value={d.cpo_bdt != null ? fmtBDT(d.cpo_bdt) : "—"}
          sub="cost / confirmed"
        />
      </div>
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
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 backdrop-blur-sm p-3",
        tone === "good" && "border-emerald-200 bg-emerald-50/50",
        tone === "bad" && "border-rose-200 bg-rose-50/50",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-bold tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
      )}
    </div>
  );
}

// ─────────────────── 2. REALITY STRIP ───────────────────
function RealityStrip({ d }: { d: PulseData["today"] }) {
  if (d.spend_bdt <= 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center rounded-2xl">
        No ad spend today — ROAS reality check kicks in once spend {'>'} 0.
      </Card>
    );
  }
  const tiers = [
    {
      key: "meta",
      label: "Meta-reported",
      hint: "Meta's own attribution (pixel/CAPI)",
      rev: d.meta_revenue_bdt,
      roas: d.meta_roas,
      color: "from-sky-500/10 to-sky-500/0 border-sky-200",
      dot: "bg-sky-500",
    },
    {
      key: "confirmed",
      label: "Confirmed",
      hint: "Attributed orders excluding cancelled/returned",
      rev: d.confirmed_revenue_bdt,
      roas: d.confirmed_roas,
      color: "from-violet-500/10 to-violet-500/0 border-violet-200",
      dot: "bg-violet-500",
    },
    {
      key: "delivered",
      label: "Delivered",
      hint: "Delivered orders — the money you actually got",
      rev: d.delivered_revenue_bdt,
      roas: d.delivered_roas,
      color: "from-emerald-500/10 to-emerald-500/0 border-emerald-200",
      dot: "bg-emerald-500",
    },
  ];
  const drift =
    d.meta_roas != null && d.delivered_roas != null
      ? ((d.delivered_roas - d.meta_roas) / d.meta_roas) * 100
      : null;
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">ROAS Reality Check</h2>
          <p className="text-xs text-muted-foreground">
            What Meta says vs. what your books say (today).
          </p>
        </div>
        {drift != null && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1",
              drift >= 0
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-rose-300 bg-rose-50 text-rose-700",
            )}
          >
            {drift >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            Delivered vs Meta {fmtPct(drift, 0)}
          </Badge>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {tiers.map((t) => (
          <div
            key={t.key}
            className={cn(
              "rounded-xl border bg-gradient-to-br p-4",
              t.color,
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", t.dot)} />
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t.label}
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tabular-nums">
              {fmtMult(t.roas)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Rev {fmtBDT(t.rev)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {t.hint}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────── 3. TOP MOVERS ───────────────────
function MoversStrip({
  top,
  bottom,
  window: win,
}: {
  top: PulseMover[];
  bottom: PulseMover[];
  window: { from: string; to: string };
}) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Top Movers</h2>
          <p className="text-xs text-muted-foreground">
            Last 7 days · {win.from} → {win.to} · by True ROAS (delivered)
          </p>
        </div>
        <Link
          to="/erp/marketing/campaigns"
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          All campaigns
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <MoverList
          title="Winners"
          icon={TrendingUp}
          rows={top}
          tone="good"
          empty="No campaigns with spend this week."
        />
        <MoverList
          title="Bleeders"
          icon={TrendingDown}
          rows={bottom}
          tone="bad"
          empty="No campaigns with spend this week."
        />
      </div>
    </Card>
  );
}

function MoverList({
  title,
  icon: Icon,
  rows,
  tone,
  empty,
}: {
  title: string;
  icon: any;
  rows: PulseMover[];
  tone: "good" | "bad";
  empty: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        tone === "good" ? "border-emerald-100 bg-emerald-50/30" : "border-rose-100 bg-rose-50/30",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2",
          tone === "good" ? "text-emerald-700" : "text-rose-700",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground text-center">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <MoverRow key={r.campaign_id} r={r} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );
}

function MoverRow({ r, tone }: { r: PulseMover; tone: "good" | "bad" }) {
  return (
    <Link
      to="/erp/marketing/campaigns/$campaignId"
      params={{ campaignId: r.campaign_id }}
      className="flex items-center gap-3 rounded-lg bg-card px-2.5 py-2 hover:shadow-sm transition-shadow border border-transparent hover:border-border"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-medium">{r.name}</span>
          {r.status && r.status !== "ACTIVE" && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
              {r.status}
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          Spend {fmtBDT(r.spend_bdt)} · Rev {fmtBDT(r.delivered_revenue_bdt)} ·{" "}
          {r.delivered_orders} orders
        </div>
      </div>
      <Sparkline data={r.sparkline_spend_bdt} tone={tone} />
      <div className="text-right shrink-0">
        <div
          className={cn(
            "text-base font-bold tabular-nums",
            tone === "good" ? "text-emerald-700" : "text-rose-700",
          )}
        >
          {fmtMult(r.true_roas)}
        </div>
        <div
          className={cn(
            "text-[10px] tabular-nums",
            r.net_profit_bdt >= 0 ? "text-emerald-600" : "text-rose-600",
          )}
        >
          {r.net_profit_bdt >= 0 ? "+" : ""}
          {fmtBDT(r.net_profit_bdt)} net
        </div>
      </div>
    </Link>
  );
}

function Sparkline({
  data,
  tone,
}: {
  data: number[];
  tone: "good" | "bad";
}) {
  const w = 60;
  const h = 20;
  const max = Math.max(...data, 1);
  const bw = w / data.length;
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      {data.map((v, i) => {
        const bh = Math.max(1, (v / max) * (h - 2));
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={h - bh}
            width={bw - 2}
            height={bh}
            rx={1}
            className={cn(
              tone === "good" ? "fill-emerald-400" : "fill-rose-400",
            )}
            opacity={v > 0 ? 0.9 : 0.15}
          />
        );
      })}
    </svg>
  );
}

// ─────────────────── 4. ROLLUP ───────────────────
function RollupStrip({
  r,
}: {
  r: { today: PulseRollupPeriod; week: PulseRollupPeriod; month: PulseRollupPeriod };
}) {
  const periods = [
    { key: "today", label: "Today", d: r.today },
    { key: "week", label: "Last 7 days", d: r.week },
    { key: "month", label: "Month-to-date", d: r.month },
  ] as const;
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold">Business Rollup</h2>
          <p className="text-xs text-muted-foreground">
            Canonical delivered numbers · net = gross − ad spend.
          </p>
        </div>
        <Link
          to="/erp/marketing/rollup"
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          Full rollup
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {periods.map((p) => (
          <RollupCard key={p.key} label={p.label} d={p.d} />
        ))}
      </div>
    </Card>
  );
}

function RollupCard({ label, d }: { label: string; d: PulseRollupPeriod }) {
  const margin =
    d.delivered_revenue_bdt > 0
      ? (d.net_profit_bdt / d.delivered_revenue_bdt) * 100
      : null;
  const net = d.net_profit_bdt;
  const tone = net > 0 ? "good" : net < 0 ? "bad" : "flat";
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "good" && "border-emerald-200 bg-emerald-50/40",
        tone === "bad" && "border-rose-200 bg-rose-50/40",
        tone === "flat" && "border-border bg-muted/20",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {d.from === d.to ? d.from : `${d.from} → ${d.to}`}
        </div>
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "bad" && "text-rose-700",
        )}
      >
        {net >= 0 ? "+" : ""}
        {fmtBDT(net)}
      </div>
      <div className="text-[11px] text-muted-foreground">
        net profit · margin {fmtPct(margin)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-y-1 gap-x-3 text-[11px]">
        <div className="text-muted-foreground">Revenue</div>
        <div className="text-right font-medium tabular-nums">
          {fmtBDT(d.delivered_revenue_bdt)}
        </div>
        <div className="text-muted-foreground">COGS</div>
        <div className="text-right tabular-nums">−{fmtBDT(d.cogs_bdt)}</div>
        <div className="text-muted-foreground">Opex</div>
        <div className="text-right tabular-nums">−{fmtBDT(d.operating_cost_bdt)}</div>
        <div className="text-muted-foreground">Gross</div>
        <div className="text-right tabular-nums">{fmtBDT(d.gross_profit_bdt)}</div>
        <div className="text-muted-foreground">Ad spend</div>
        <div className="text-right tabular-nums">−{fmtBDT(d.spend_bdt)}</div>
        <div className="font-medium">Orders</div>
        <div className="text-right font-medium tabular-nums">
          {fmtNum(d.delivered_orders)}
        </div>
      </div>
      {d.cost_missing_units > 0 && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          {fmtNum(d.cost_missing_units)} units missing cost
        </div>
      )}
    </div>
  );
}