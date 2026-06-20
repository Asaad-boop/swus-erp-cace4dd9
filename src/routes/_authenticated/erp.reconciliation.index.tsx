import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Package, Truck, CheckCircle2, AlertTriangle, Wallet, FileSpreadsheet,
  XCircle, Clock, Receipt, ArrowRight, AlertCircle, TrendingUp, RotateCcw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getReconciliationStats } from "@/lib/erp/reconciliation-stats.functions";
import { getReconciliationDashboard } from "@/lib/erp/reconciliation-queue.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/")({
  head: () => ({ meta: [{ title: "Reconciliation Overview — ERP" }] }),
  component: OverviewPage,
});

const bdt = (n: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(n);

function OverviewPage() {
  const { brandId, picker } = useBrandPicker({
    label: "Pick a brand",
    hint: "Brand wise reconciliation status dekhar jonno ekta brand select koro.",
  });
  const statsFn = useServerFn(getReconciliationStats);
  const q = useQuery({
    queryKey: ["reconciliation-stats", brandId],
    queryFn: () => statsFn({ data: { brandId } }),
    enabled: !!brandId,
  });

  const dashFn = useServerFn(getReconciliationDashboard);
  const dq = useQuery({
    queryKey: ["reconciliation-dashboard", brandId],
    queryFn: () => dashFn({ data: { brandId } }),
    enabled: !!brandId,
  });

  const s = q.data;
  const os = s?.orderStatus ?? {};
  const k = dq.data?.kpis;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reconciliation Overview</h1>
          <p className="text-sm text-muted-foreground">
            Order, shipment, payment ar invoice reconciliation status ek nojore.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/erp/reconciliation/pending">
              <Clock className="h-4 w-4 mr-2" /> Pending Queue
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/erp/reconciliation/outstanding">
              <AlertCircle className="h-4 w-4 mr-2" /> Outstanding
            </Link>
          </Button>
          <Button asChild>
            <Link to="/erp/reconciliation/invoice">
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Upload Invoice
            </Link>
          </Button>
        </div>
      </header>

      {/* COD KPIs */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          COD Reconciliation
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title="Pending COD"
            amount={k?.pendingTotal}
            sub={k ? `${k.pendingCount} orders` : ""}
            tone="warn"
            icon={<Clock className="h-5 w-5" />}
            loading={dq.isLoading}
          />
          <KpiCard
            title="Reconciled (MTD)"
            amount={k?.reconciledTotal}
            tone="good"
            icon={<CheckCircle2 className="h-5 w-5" />}
            loading={dq.isLoading}
          />
          <KpiCard
            title="Outstanding > 14d"
            amount={k?.outstandingTotal}
            sub={k ? `${k.outstandingCount} orders` : ""}
            tone="bad"
            icon={<AlertCircle className="h-5 w-5" />}
            loading={dq.isLoading}
          />
          <KpiCard
            title="Return Fees (30d)"
            amount={k?.returnFeesTotal}
            tone="neutral"
            icon={<RotateCcw className="h-5 w-5" />}
            loading={dq.isLoading}
          />
          <KpiCard
            title="Net COD (MTD)"
            amount={k?.netCod}
            tone="info"
            icon={<TrendingUp className="h-5 w-5" />}
            loading={dq.isLoading}
          />
        </div>
      </section>

      {/* 30-day chart */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          COD Collected vs Expected (last 30 days)
        </h2>
        <Card>
          <CardContent className="p-4">
            <div className="h-64 w-full">
              {dq.isLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dq.data?.dailySeries ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(5)} className="text-xs" />
                    <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} className="text-xs" />
                    <Tooltip formatter={(v: number) => bdt(Number(v))} />
                    <Legend />
                    <Bar dataKey="expected" name="Expected" fill="hsl(var(--muted-foreground))" />
                    <Bar dataKey="collected" name="Collected" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Action items */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Action Required
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard
            title="Status change baki"
            value={s?.totals.pendingStatusChange}
            hint="Courier delivered bole, order status update hoy nai"
            icon={<Clock className="h-5 w-5" />}
            tone="warn"
            loading={q.isLoading}
          />
          <ActionCard
            title="Invoice upload baki"
            value={s?.totals.deliveredNotReconciled}
            hint="Delivered orders, kintu invoice reconcile hoy nai"
            icon={<Receipt className="h-5 w-5" />}
            tone="warn"
            loading={q.isLoading}
          />
          <ActionCard
            title="Shipment book baki"
            value={s?.totals.noShipmentBooked}
            hint="Confirmed orders, kono courier shipment nei"
            icon={<Truck className="h-5 w-5" />}
            tone="bad"
            loading={q.isLoading}
          />
          <ActionCard
            title="Unpaid"
            value={s?.totals.unpaidOrders}
            hint="Payment receive hoy nai (paid mark hoy nai)"
            icon={<AlertTriangle className="h-5 w-5" />}
            tone="bad"
            loading={q.isLoading}
          />
        </div>
      </section>

      {/* Order status breakdown */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Order Status
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total" value={s?.totals.totalOrders} icon={<Package className="h-4 w-4" />} loading={q.isLoading} />
          <StatCard label="New" value={os["new"] ?? 0} icon={<Package className="h-4 w-4" />} loading={q.isLoading} />
          <StatCard label="Confirmed" value={os["confirmed"] ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} loading={q.isLoading} />
          <StatCard label="In Transit" value={os["in_transit"] ?? 0} icon={<Truck className="h-4 w-4" />} loading={q.isLoading} />
          <StatCard label="Delivered" value={os["delivered"] ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} tone="good" loading={q.isLoading} />
        </div>
        {/* Show any other custom statuses */}
        {Object.keys(os).filter((k) => !["new", "confirmed", "in_transit", "delivered"].includes(k)).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {Object.entries(os)
              .filter(([k]) => !["new", "confirmed", "in_transit", "delivered"].includes(k))
              .map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-xs">
                  {k}: <span className="font-mono ml-1">{v}</span>
                </Badge>
              ))}
          </div>
        )}
      </section>

      {/* Payment + reconciliation */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Payment & Reconciliation
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Paid" value={s?.totals.paidOrders} icon={<Wallet className="h-4 w-4" />} tone="good" loading={q.isLoading} />
          <StatCard label="Unpaid" value={s?.totals.unpaidOrders} icon={<XCircle className="h-4 w-4" />} tone="bad" loading={q.isLoading} />
          <StatCard label="Shipped (not delivered)" value={s?.totals.shippedNotDelivered} icon={<Truck className="h-4 w-4" />} loading={q.isLoading} />
          <StatCard label="Reconciled orders" value={s?.totals.reconciledOrders} icon={<Receipt className="h-4 w-4" />} tone="good" loading={q.isLoading} />
        </div>
      </section>

      <Card>
        <CardContent className="p-4 md:p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Pathao paid invoice ready?</div>
            <div className="text-sm text-muted-foreground">
              CSV upload korle delivered status, payment received entry, ar courier fee automatic boshe jabe.
            </div>
          </div>
          <Button asChild>
            <Link to="/erp/reconciliation/invoice">
              Go to Invoice Upload
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title, amount, sub, icon, tone, loading,
}: {
  title: string;
  amount: number | undefined;
  sub?: string;
  icon: React.ReactNode;
  tone: "warn" | "bad" | "good" | "info" | "neutral";
  loading?: boolean;
}) {
  const toneMap: Record<string, string> = {
    warn: "border-amber-500/40 bg-amber-500/5 text-amber-700",
    bad: "border-red-500/40 bg-red-500/5 text-red-700",
    good: "border-emerald-500/40 bg-emerald-500/5 text-emerald-700",
    info: "border-sky-500/40 bg-sky-500/5 text-sky-700",
    neutral: "border-border bg-muted/30 text-muted-foreground",
  };
  return (
    <Card className={toneMap[tone]?.split(" ").slice(0, 2).join(" ")}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <span className={toneMap[tone]?.split(" ").slice(2).join(" ")}>{icon}</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${toneMap[tone]?.split(" ").slice(2).join(" ")}`}>
          {loading ? "…" : bdt(Number(amount ?? 0))}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ActionCard({
  title, value, hint, icon, tone, loading,
}: {
  title: string;
  value: number | undefined;
  hint: string;
  icon: React.ReactNode;
  tone?: "warn" | "bad" | "good";
  loading?: boolean;
}) {
  const toneCls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5"
      : tone === "bad"
        ? "border-red-500/40 bg-red-500/5"
        : tone === "good"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "";
  const iconCls =
    tone === "warn"
      ? "text-amber-700"
      : tone === "bad"
        ? "text-red-700"
        : tone === "good"
          ? "text-emerald-700"
          : "text-muted-foreground";
  return (
    <Card className={toneCls}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <span className={iconCls}>{icon}</span>
        </div>
        <div className="text-3xl font-bold tabular-nums">
          {loading ? "…" : (value ?? 0)}
        </div>
        <div className="text-[11px] text-muted-foreground leading-tight">{hint}</div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label, value, icon, tone, loading,
}: {
  label: string;
  value: number | undefined;
  icon?: React.ReactNode;
  tone?: "good" | "bad";
  loading?: boolean;
}) {
  const cls =
    tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${cls}`}>
          {loading ? "…" : (value ?? 0)}
        </div>
      </CardContent>
    </Card>
  );
}