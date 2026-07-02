import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, Search, ArrowRight, Wallet, Receipt, Activity, Target, Package, Download,
} from "lucide-react";

import { useMultiBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCampaignsRollup, type CampaignRollupRow } from "@/lib/erp/marketing/campaigns.functions";
import { MktKpiCard } from "@/components/erp/marketing/_ui/MktKpiCard";
import { MktPageHeader, MktEmptyState } from "@/components/erp/marketing/_ui/MktPageHeader";
import { MktStatusBadge } from "@/components/erp/marketing/_ui/MktBadges";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";
import { LastSyncedBadge } from "@/components/erp/marketing/last-synced-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns/")({
  component: CampaignsPage,
});

const fmtNum = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtBDT = (n: number) => `৳${Math.round(Number(n) || 0).toLocaleString()}`;
const fmtUSD = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function CostSourceBadge({ source, estimated }: { source: CampaignRollupRow["cost_source"]; estimated: boolean }) {
  const label =
    source === "fifo" ? "FIFO" : source === "fx_fallback" ? "FX Fallback" : source === "mixed" ? "Mixed" : "Manual";
  const cls = !estimated
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : source === "mixed"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-orange-50 text-orange-700 border-orange-200";
  return (
    <span
      title={estimated ? "Estimated — uses FX fallback (no FIFO lot)" : "Actual BDT cost from FIFO dollar lots"}
      className={cn("inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border", cls)}
    >
      {label}{estimated && source !== "manual" ? " • Est" : ""}
    </span>
  );
}

function CampaignsPage() {
  const { brandIds, picker } = useMultiBrandPicker();
  const hasBrand = brandIds.length > 0;
  const [range, setRange] = useState<MktRangeValue>(() => buildPreset("today"));
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { from, to } = range;

  const list = useServerFn(listCampaignsRollup);
  const rollup = useQuery({
    queryKey: ["mkt", "campaigns", brandIds.slice().sort().join(","), from, to],
    queryFn: () => list({ data: { brandIds, from, to } }),
    enabled: hasBrand,
  });

  const filtered: CampaignRollupRow[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = rollup.data ?? [];
    return rows.filter((r) => {
      if (term && !r.name.toLowerCase().includes(term) && !r.external_id.includes(term)) return false;
      if (statusFilter !== "all") {
        const s = (r.effective_status ?? r.status ?? "").toUpperCase();
        if (statusFilter === "active" && s !== "ACTIVE") return false;
        if (statusFilter === "paused" && s !== "PAUSED") return false;
      }
      return true;
    });
  }, [rollup.data, q, statusFilter]);

  const totals = useMemo(() => filtered.reduce(
    (a, r) => {
      a.spend += r.spend;
      a.spend_bdt += r.spend_bdt;
      a.delivered_revenue += r.delivered_revenue;
      a.delivered_orders += r.delivered_orders;
      a.confirmed_orders += r.confirmed_orders;
      if (r.roas_delivered != null) { a.roas_sum += r.roas_delivered; a.roas_n += 1; }
      if (((r.effective_status ?? r.status ?? "").toUpperCase()) === "ACTIVE") a.active += 1;
      return a;
    },
    { spend: 0, spend_bdt: 0, delivered_revenue: 0, delivered_orders: 0, confirmed_orders: 0, roas_sum: 0, roas_n: 0, active: 0 },
  ), [filtered]);

  const avgRoas = totals.roas_n > 0 ? totals.roas_sum / totals.roas_n : null;

  const exportCsv = () => {
    const header = ["Campaign", "Status", "Spend BDT", "Spend USD", "Meta Revenue BDT", "Delivered Rev", "Delivered Orders", "Meta ROAS", "Delivered ROAS"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push([
        `"${r.name.replace(/"/g, '""')}"`,
        r.effective_status ?? r.status ?? "",
        r.spend_bdt, r.spend, r.meta_purchase_value_bdt, r.delivered_revenue, r.delivered_orders,
        r.roas_meta ?? "", r.roas_delivered ?? "",
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `campaigns-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <MktPageHeader
        title="Campaigns"
        subtitle="Meta vs Confirmed vs Delivered — last sync er upor base kore"
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <LastSyncedBadge brandIds={brandIds} />
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} className="bg-white gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MktKpiCard
          icon={Wallet}
          label="Total Spend"
          value={fmtBDT(totals.spend_bdt)}
          sub={fmtUSD(totals.spend)}
        />
        <MktKpiCard
          icon={Receipt}
          label="Delivered Revenue"
          value={fmtBDT(totals.delivered_revenue)}
          sub={`${fmtNum(totals.delivered_orders)} orders`}
        />
        <MktKpiCard
          icon={Target}
          label="Avg Delivered ROAS"
          value={avgRoas != null ? `${avgRoas.toFixed(2)}x` : "—"}
          tone={avgRoas == null ? "neutral" : avgRoas >= 2 ? "good" : avgRoas >= 1 ? "neutral" : "bad"}
        />
        <MktKpiCard
          icon={Activity}
          label="Active Campaigns"
          value={`${totals.active}`}
          sub={`of ${filtered.length} total`}
        />
      </div>

      {/* Filter bar */}
      <Card className="rounded-xl border-gray-100 shadow-sm">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns or IDs…" className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">
            Showing <b className="text-foreground">{filtered.length}</b> of {rollup.data?.length ?? 0}
          </span>
        </CardContent>
      </Card>

      {/* Card grid */}
      {rollup.isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading campaigns…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-xl border-gray-100 shadow-sm">
          <CardContent>
            <MktEmptyState
              icon={Package}
              title="No campaigns yet"
              subtitle="Ad Accounts page theke sync korun, campaigns automatically import hobe."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <CampaignCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ row: r }: { row: CampaignRollupRow }) {
  const isProfit = r.roas_delivered != null && r.roas_delivered >= 1;
  const products = r.products ?? [];
  const primary = products[0];
  const extra = Math.max(0, products.length - 3);
  return (
    <Link
      to="/erp/marketing/campaigns/$campaignId"
      params={{ campaignId: r.id }}
      className="group block"
    >
      <Card className="rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-150 h-full">
        {/* Product visual header */}
        <div className="relative h-32 w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-slate-100 to-slate-50">
          {primary?.image ? (
            <img
              src={primary.image}
              alt={primary.title ?? r.name}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <Package className="h-8 w-8 opacity-40" />
            </div>
          )}
          {/* Status pill top-left */}
          <div className="absolute top-2 left-2">
            <MktStatusBadge status={r.effective_status ?? r.status} />
          </div>
          {/* Product thumb strip bottom */}
          {products.length > 0 && (
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
              <div className="flex -space-x-2">
                {products.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="h-7 w-7 rounded-full border-2 border-white bg-white overflow-hidden shadow-sm"
                    title={p.title ?? ""}
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-slate-100">
                        <Package className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                {extra > 0 && (
                  <div className="h-7 px-1.5 min-w-7 rounded-full border-2 border-white bg-slate-900/80 text-white text-[10px] font-semibold flex items-center justify-center shadow-sm">
                    +{extra}
                  </div>
                )}
              </div>
              {primary?.title && (
                <span className="ml-1 text-[11px] font-medium text-white bg-black/55 backdrop-blur-sm rounded px-1.5 py-0.5 truncate max-w-[60%]">
                  {primary.title}
                </span>
              )}
            </div>
          )}
        </div>
        <CardContent className="p-4 space-y-3">
          {/* Top row: status + objective */}
          <div className="flex items-start justify-end gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {r.objective ?? "—"}
            </span>
          </div>

          {/* Title */}
          <div>
            <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-[#1877F2] transition-colors">
              {r.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.account_name}</p>
          </div>

          {/* Spend */}
          <div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Spend</div>
              <CostSourceBadge source={r.cost_source} estimated={r.estimated_bdt_cost} />
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold tabular-nums text-foreground">{fmtBDT(r.spend_bdt)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{fmtUSD(r.spend)}</span>
            </div>
          </div>

          {/* ROAS dual + orders */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">ROAS</div>
              <div className="mt-0.5 space-y-0.5">
                <div className={cn("text-sm font-semibold tabular-nums", isProfit ? "text-emerald-700" : r.roas_delivered != null ? "text-red-600" : "text-muted-foreground")}>
                  {r.roas_delivered != null ? `${r.roas_delivered.toFixed(2)}x` : "—"}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">real</span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {r.roas_meta != null ? `${r.roas_meta.toFixed(2)}x` : "—"}
                  <span className="ml-1 text-[10px]">meta</span>
                </div>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Orders</div>
              <div className="mt-0.5 space-y-0.5">
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  {fmtNum(r.delivered_orders)}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">delivered</span>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {fmtNum(r.confirmed_orders)}
                  <span className="ml-1 text-[10px]">confirmed</span>
                </div>
              </div>
            </div>
          </div>

          {/* View Detail */}
          <div className="flex items-center justify-end text-xs font-medium text-[#1877F2] opacity-0 group-hover:opacity-100 transition-opacity">
            View detail <ArrowRight className="h-3 w-3 ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}