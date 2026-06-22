import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Package,
  Search,
  Wallet,
  ShoppingBag,
  Receipt,
  Target,
  TrendingUp,
  Activity,
  ExternalLink,
  Eye,
  MousePointerClick,
  CheckCircle2,
  Truck,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  Legend,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getCampaignDetail,
  listCampaignProducts,
  linkCampaignProduct,
  unlinkCampaignProduct,
  updateCampaignProduct,
  searchBrandProducts,
} from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns/$campaignId")({
  component: CampaignDetailPage,
});

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

function fmtCurrency(n: number, ccy = "USD") {
  const symbol = ccy === "BDT" ? "৳" : ccy === "USD" ? "$" : `${ccy} `;
  return `${symbol}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function fmtBDT(n: number) {
  return `৳${Math.round(Number(n) || 0).toLocaleString()}`;
}
function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return Number(n || 0).toLocaleString();
}
function fmtPct(n: number | null, digits = 1) {
  if (n == null || !isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
function fmtMult(n: number | null) {
  if (n == null || !isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const [rangeKey, setRangeKey] = useState("30d");
  const { from, to } = useMemo(() => {
    const days = RANGES[rangeKey] ?? 30;
    const today = new Date();
    return { from: format(subDays(today, days - 1), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  }, [rangeKey]);

  const fn = useServerFn(getCampaignDetail);
  const q = useQuery({
    queryKey: ["mkt", "campaign-detail", campaignId, from, to],
    queryFn: () => fn({ data: { campaignId, from, to } }),
  });

  if (q.isLoading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading campaign…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <div className="py-10 text-center text-sm text-red-600">{(q.error as any)?.message ?? "Campaign load failed"}</div>;
  }
  const d = q.data;
  const c: any = d.campaign;
  const t: any = d.totals;
  const brandId: string | null = c.brand_id ?? null;
  const ccy: string = c.mkt_ad_accounts?.currency ?? "USD";
  const status = (c.effective_status ?? c.status ?? "—").toString().toUpperCase();
  const isActive = status === "ACTIVE";

  const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
  const cpc = t.clicks > 0 ? t.spend / t.clicks : null;
  const cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null;
  const metaCpp = t.meta_purchases > 0 ? t.spend / t.meta_purchases : null;
  const metaRoas = t.spend > 0 ? t.meta_purchase_value / t.spend : null;
  // True ROAS uses delivered_revenue (BDT) vs spend (account currency) — only show if same currency or skip
  const realCpp = t.confirmed_orders > 0 && t.spend > 0 ? t.spend / t.confirmed_orders : null;
  const returnRate =
    t.delivered_orders + t.return_orders > 0
      ? (t.return_orders / (t.delivered_orders + t.return_orders)) * 100
      : null;

  // Funnel
  const funnel = [
    { label: "Impressions", value: t.impressions, icon: Eye, color: "bg-sky-500" },
    { label: "Clicks", value: t.clicks, icon: MousePointerClick, color: "bg-indigo-500" },
    { label: "Meta Purchases", value: t.meta_purchases, icon: ShoppingBag, color: "bg-violet-500" },
    { label: "Confirmed", value: t.confirmed_orders, icon: CheckCircle2, color: "bg-amber-500" },
    { label: "Delivered", value: t.delivered_orders, icon: Truck, color: "bg-emerald-500" },
  ];
  const funnelMax = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[#1877F2]/5 via-background to-background p-5">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#1877F2]/10 blur-3xl" aria-hidden />
        <div className="relative">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground hover:text-foreground">
            <Link to="/erp/marketing/campaigns">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> All Campaigns
            </Link>
          </Button>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight truncate">{c.name}</h1>
              <div className="text-sm text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                {isActive ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-0 gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">{status}</Badge>
                )}
                <Badge variant="outline" className="gap-1.5">
                  <Activity className="h-3 w-3" />
                  {c.mkt_ad_accounts?.name ?? "—"}
                </Badge>
                <Badge variant="outline">{c.objective ?? "—"}</Badge>
                <Badge variant="outline">{ccy}</Badge>
                <span className="font-mono text-[11px] text-muted-foreground">ID {c.external_id}</span>
              </div>
            </div>
            <Select value={rangeKey} onValueChange={setRangeKey}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── KPI grid ─────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Kpi
          icon={Wallet}
          label="Spend"
          value={fmtCurrency(t.spend, ccy)}
          sub={t.impressions > 0 ? `CPM ${cpm != null ? fmtCurrency(cpm, ccy) : "—"}` : undefined}
          tone="sky"
        />
        <Kpi
          icon={Eye}
          label="Reach"
          value={fmtNum(t.impressions)}
          sub={`Clicks ${fmtNum(t.clicks)} · CTR ${fmtPct(ctr)}`}
          tone="indigo"
        />
        <Kpi
          icon={ShoppingBag}
          label="Meta Purchases"
          value={fmtNum(t.meta_purchases)}
          sub={metaCpp != null ? `CPP ${fmtCurrency(metaCpp, ccy)}` : "—"}
          tone="violet"
        />
        <Kpi
          icon={Target}
          label="Meta ROAS"
          value={fmtMult(metaRoas)}
          sub={t.meta_purchase_value > 0 ? `Rev ${fmtCurrency(t.meta_purchase_value, ccy)}` : "—"}
          tone={
            metaRoas == null ? "indigo" : metaRoas >= 2 ? "emerald" : metaRoas >= 1 ? "amber" : "rose"
          }
          emphasize
        />
        <Kpi
          icon={CheckCircle2}
          label="Confirmed"
          value={fmtNum(t.confirmed_orders)}
          sub={`Rev ${fmtBDT(t.confirmed_revenue)}`}
          tone="amber"
        />
        <Kpi
          icon={Truck}
          label="Delivered"
          value={fmtNum(t.delivered_orders)}
          sub={`Rev ${fmtBDT(t.delivered_revenue)}${t.return_orders ? ` · ${t.return_orders} returns` : ""}`}
          tone="emerald"
          emphasize
        />
      </div>

      {/* ── Chart + Funnel ───────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="pb-2 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#1877F2]" />
              Daily Spend &amp; Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72 pt-4">
            {d.series.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                No insight data in this range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1877F2" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#1877F2" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())}
                  />
                  <RTooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any, name: any) => [fmtCurrency(Number(v), ccy), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    name="Spend"
                    stroke="#1877F2"
                    strokeWidth={2}
                    fill="url(#spendGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="meta_purchase_value"
                    name="Meta Revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="pb-2 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {funnel.map((f, i) => {
              const pct = (f.value / funnelMax) * 100;
              const prev = i > 0 ? funnel[i - 1].value : null;
              const dropPct = prev && prev > 0 ? (f.value / prev) * 100 : null;
              return (
                <div key={f.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <f.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {f.label}
                    </span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{fmtNum(f.value)}</span>
                      {dropPct != null && (
                        <span
                          className={cn(
                            "ml-1.5 text-[10px]",
                            dropPct < 5
                              ? "text-rose-600"
                              : dropPct < 30
                                ? "text-amber-600"
                                : "text-emerald-600",
                          )}
                        >
                          {dropPct.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full transition-all rounded-full", f.color)}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(returnRate != null || realCpp != null) && (
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 mt-2 text-xs">
                {realCpp != null && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Real CPP
                    </div>
                    <div className="font-semibold tabular-nums">{fmtCurrency(realCpp, ccy)}</div>
                  </div>
                )}
                {returnRate != null && (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Return Rate
                    </div>
                    <div
                      className={cn(
                        "font-semibold tabular-nums",
                        returnRate > 30 ? "text-rose-600" : returnRate > 15 ? "text-amber-600" : "text-emerald-600",
                      )}
                    >
                      {fmtPct(returnRate)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Adsets ─────────────────────────────── */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-2 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Adsets · {d.adsets.length}</span>
            {t.spend > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">
                share of campaign spend
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {d.adsets.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No adsets synced.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...d.adsets]
                .sort((a: any, b: any) => (b.spend ?? 0) - (a.spend ?? 0))
                .map((a: any) => {
                  const share = t.spend > 0 ? (a.spend / t.spend) * 100 : 0;
                  const aCtr = a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null;
                  const aCpp = a.meta_purchases > 0 ? a.spend / a.meta_purchases : null;
                  const aRoas = a.spend > 0 ? a.meta_purchase_value / a.spend : null;
                  const aStatus = (a.effective_status ?? a.status ?? "").toUpperCase();
                  const aActive = aStatus === "ACTIVE";
                  return (
                    <div key={a.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            aActive ? "bg-emerald-500" : "bg-muted-foreground/40",
                          )}
                        />
                        <div className="font-medium text-sm truncate flex-1">{a.name}</div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 h-4",
                            aActive && "border-emerald-500/30 text-emerald-700",
                          )}
                        >
                          {aStatus || "—"}
                        </Badge>
                        {a.daily_budget != null && (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            Budget {fmtCurrency(Number(a.daily_budget) / 100, ccy)}/day
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
                        <AdsetStat label="Spend" value={fmtCurrency(a.spend, ccy)} />
                        <AdsetStat label="Impr." value={fmtNum(a.impressions)} />
                        <AdsetStat label="Clicks" value={fmtNum(a.clicks)} sub={`CTR ${fmtPct(aCtr)}`} />
                        <AdsetStat label="Meta Pur." value={fmtNum(a.meta_purchases)} sub={aCpp != null ? `CPP ${fmtCurrency(aCpp, ccy)}` : "—"} />
                        <AdsetStat label="Meta Rev." value={fmtCurrency(a.meta_purchase_value, ccy)} />
                        <AdsetStat
                          label="Meta ROAS"
                          value={fmtMult(aRoas)}
                          valueClass={
                            aRoas == null
                              ? ""
                              : aRoas >= 2
                                ? "text-emerald-600"
                                : aRoas >= 1
                                  ? "text-amber-600"
                                  : "text-rose-600"
                          }
                        />
                      </div>
                      {t.spend > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="relative h-1 flex-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-[#1877F2] rounded-full"
                              style={{ width: `${Math.min(100, share)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
                            {share.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <LinkedProductsCard campaignId={campaignId} brandId={brandId} />
    </div>
  );
}

function Kpi({
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
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "font-bold tracking-tight tabular-nums leading-none truncate",
          emphasize ? "text-[26px]" : "text-2xl",
          emphasize ? t.value : "text-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1.5 truncate">{sub}</div>}
    </Card>
  );
}

function AdsetStat({
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

function LinkedProductsCard({ campaignId, brandId }: { campaignId: string; brandId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaignProducts);
  const linkFn = useServerFn(linkCampaignProduct);
  const unlinkFn = useServerFn(unlinkCampaignProduct);
  const updateFn = useServerFn(updateCampaignProduct);

  const q = useQuery({
    queryKey: ["mkt", "campaign-products", campaignId],
    queryFn: () => listFn({ data: { campaignId } }),
  });

  const [pickerOpen, setPickerOpen] = useState(false);

  const unlinkMut = useMutation({
    mutationFn: (linkId: string) => unlinkFn({ data: { linkId } }),
    onSuccess: () => {
      toast.success("Unlinked");
      qc.invalidateQueries({ queryKey: ["mkt", "campaign-products", campaignId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const weightMut = useMutation({
    mutationFn: (v: { linkId: string; weight: number }) =>
      updateFn({ data: { linkId: v.linkId, weight: v.weight } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mkt", "campaign-products", campaignId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = (q.data ?? []) as any[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" /> Linked Products ({rows.length})
        </CardTitle>
        <Button size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5" disabled={!brandId}>
          <Plus className="h-3.5 w-3.5" /> Add Product
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Kono product link kora nei. Attribution fallback + product profit allocation er jonno products link korun.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Meta Expense</TableHead>
                <TableHead className="w-32">Weight</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.products?.image ? (
                        <img src={r.products.image} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="font-medium">{r.products?.title ?? "—"}</div>
                      {r.products && !r.products.is_active ? (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.products?.sku ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.products?.price ? `BDT ${Number(r.products.price).toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {Number(r.allocated_meta_spend ?? 0) > 0 ? fmtBDT(Number(r.allocated_meta_spend)) : "—"}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      max={100}
                      defaultValue={r.weight}
                      className="h-8 w-20"
                      onBlur={(e) => {
                        const w = Number(e.target.value);
                        if (w !== Number(r.weight)) weightMut.mutate({ linkId: r.id, weight: w });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { if (confirm("Unlink this product?")) unlinkMut.mutate(r.id); }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {brandId ? (
        <ProductPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          brandId={brandId}
          excludeIds={rows.map((r) => r.product_id)}
          onPick={async (productId) => {
            try {
              await linkFn({ data: { campaignId, productId } });
              toast.success("Product linked");
              qc.invalidateQueries({ queryKey: ["mkt", "campaign-products", campaignId] });
              setPickerOpen(false);
            } catch (e: any) {
              toast.error(e?.message ?? "Failed");
            }
          }}
        />
      ) : null}
    </Card>
  );
}

function ProductPicker({
  open, onOpenChange, brandId, excludeIds, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brandId: string;
  excludeIds: string[];
  onPick: (productId: string) => void;
}) {
  const searchFn = useServerFn(searchBrandProducts);
  const [query, setQuery] = useState("");

  const q = useQuery({
    queryKey: ["mkt", "brand-products", brandId, query],
    queryFn: () => searchFn({ data: { brandId, query, limit: 30 } }),
    enabled: open,
  });

  const taken = new Set(excludeIds);
  const rows = ((q.data ?? []) as any[]).filter((p) => !taken.has(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link a Product</DialogTitle>
          <DialogDescription>
            Brand er product gulo theke select korun. Linked products attribution fallback ar product profit allocation e use hobe.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or SKU…"
            className="pl-9"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {q.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No products found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.image ? (
                          <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="font-medium">{p.title}</div>
                        {!p.is_active ? <Badge variant="outline" className="text-xs">Inactive</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.sku ?? "—"}</TableCell>
                    <TableCell className="text-right">{p.price ? `BDT ${Number(p.price).toLocaleString()}` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => onPick(p.id)}>Link</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
