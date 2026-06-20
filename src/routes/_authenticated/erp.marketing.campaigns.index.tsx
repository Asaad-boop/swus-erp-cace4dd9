import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, subDays } from "date-fns";
import { Loader2, ExternalLink, Search } from "lucide-react";

import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listCampaignsRollup, type CampaignRollupRow } from "@/lib/erp/marketing/campaigns.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/campaigns/")({
  component: CampaignsPage,
});

const RANGES: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function fmtNum(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtMoney(n: number, currency = "BDT") {
  return `${currency} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtBDT(n: number) {
  return `৳${Math.round(Number(n) || 0).toLocaleString()}`;
}
function fmtUSD(n: number) {
  return `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function statusTone(s: string | null) {
  const v = (s ?? "").toUpperCase();
  if (v === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (v === "PAUSED") return "bg-amber-100 text-amber-800";
  return "bg-zinc-200 text-zinc-700";
}

function CampaignsPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const [rangeKey, setRangeKey] = useState("30d");
  const [q, setQ] = useState("");

  const { from, to } = useMemo(() => {
    const days = RANGES[rangeKey] ?? 30;
    const today = new Date();
    return {
      from: format(subDays(today, days - 1), "yyyy-MM-dd"),
      to: format(today, "yyyy-MM-dd"),
    };
  }, [rangeKey]);

  const list = useServerFn(listCampaignsRollup);
  const rollup = useQuery({
    queryKey: ["mkt", "campaigns", brandId, from, to],
    queryFn: () => list({ data: { brandId: brandId!, from, to } }),
    enabled: !!brandId,
  });

  const filtered: CampaignRollupRow[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = rollup.data ?? [];
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term) || r.external_id.includes(term));
  }, [rollup.data, q]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (a, r) => {
        a.spend += r.spend;
        a.spend_bdt += r.spend_bdt;
        a.meta_purchases += r.meta_purchases;
        a.meta_purchase_value += r.meta_purchase_value;
        a.meta_purchase_value_bdt += r.meta_purchase_value_bdt;
        a.confirmed_orders += r.confirmed_orders;
        a.delivered_orders += r.delivered_orders;
        a.delivered_revenue += r.delivered_revenue;
        return a;
      },
      { spend: 0, spend_bdt: 0, meta_purchases: 0, meta_purchase_value: 0, meta_purchase_value_bdt: 0, confirmed_orders: 0, delivered_orders: 0, delivered_revenue: 0 },
    );
  }, [filtered]);

  return (
    <div className="space-y-5">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Meta vs Confirmed vs Delivered — last sync er upor base kore.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={rangeKey} onValueChange={setRangeKey}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaign…" className="pl-8 w-64" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiCard label="Spend" value={fmtBDT(totals.spend_bdt)} sub={fmtUSD(totals.spend)} />
        <KpiCard label="Meta Purchases" value={fmtNum(totals.meta_purchases)} />
        <KpiCard label="Meta Revenue" value={fmtBDT(totals.meta_purchase_value_bdt)} sub={fmtUSD(totals.meta_purchase_value)} />
        <KpiCard label="Confirmed" value={fmtNum(totals.confirmed_orders)} />
        <KpiCard label="Delivered" value={fmtNum(totals.delivered_orders)} />
        <KpiCard label="Delivered Revenue" value={fmtBDT(totals.delivered_revenue)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Campaigns</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rollup.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Kono campaign nei. Ad accounts page theke sync korun.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Impr.</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Meta Pur.</TableHead>
                    <TableHead className="text-right">Meta Rev.</TableHead>
                    <TableHead className="text-right">Confirmed</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Del. Rev.</TableHead>
                    <TableHead className="text-right">Meta ROAS</TableHead>
                    <TableHead className="text-right">Confirmed ROAS</TableHead>
                    <TableHead className="text-right">Delivered ROAS</TableHead>
                    <TableHead className="text-right">CPO (Del.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="min-w-[260px]">
                        <Link
                          to="/erp/marketing/campaigns/$campaignId"
                          params={{ campaignId: r.id }}
                          className="font-medium hover:underline inline-flex items-center gap-1"
                        >
                          {r.name}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {r.account_name} · {r.objective ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusTone(r.effective_status ?? r.status)}>
                          {r.effective_status ?? r.status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium tabular-nums">{fmtBDT(r.spend_bdt)}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{fmtUSD(r.spend)}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(r.impressions)}</TableCell>
                      <TableCell className="text-right">{r.ctr != null ? `${r.ctr.toFixed(2)}%` : "—"}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.meta_purchases)}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium tabular-nums">{fmtBDT(r.meta_purchase_value_bdt)}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{fmtUSD(r.meta_purchase_value)}</div>
                      </TableCell>
                      <TableCell className="text-right">{fmtNum(r.confirmed_orders)}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.delivered_orders)}</TableCell>
                      <TableCell className="text-right text-red-600">{fmtNum(r.return_orders)}</TableCell>
                      <TableCell className="text-right">{fmtBDT(r.delivered_revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.roas_meta != null ? `${r.roas_meta.toFixed(2)}x` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.roas_confirmed != null ? (
                          <span className={r.roas_confirmed >= 1 ? "text-emerald-700" : "text-amber-700"}>
                            {r.roas_confirmed.toFixed(2)}x
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {r.roas_delivered != null ? (
                          <span className={r.roas_delivered >= 1 ? "text-emerald-700" : "text-red-600"}>
                            {r.roas_delivered.toFixed(2)}x
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.cpo_delivered_bdt != null ? fmtBDT(r.cpo_delivered_bdt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground mt-0.5">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
