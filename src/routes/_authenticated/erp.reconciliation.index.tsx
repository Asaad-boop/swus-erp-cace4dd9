import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Package, Truck, CheckCircle2, AlertTriangle, Wallet, FileSpreadsheet,
  XCircle, Clock, Receipt, ArrowRight,
} from "lucide-react";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getReconciliationStats } from "@/lib/erp/reconciliation-stats.functions";

export const Route = createFileRoute("/_authenticated/erp/reconciliation/")({
  head: () => ({ meta: [{ title: "Reconciliation Overview — ERP" }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const { brandId, gate } = useBrandPicker({
    label: "Pick a brand",
    hint: "Brand wise reconciliation status dekhar jonno ekta brand select koro.",
  });
  const statsFn = useServerFn(getReconciliationStats);
  const q = useQuery({
    queryKey: ["reconciliation-stats", brandId],
    queryFn: () => statsFn({ data: { brandId } }),
    enabled: !!brandId,
  });

  if (gate) return gate;

  const s = q.data;
  const os = s?.orderStatus ?? {};

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reconciliation Overview</h1>
          <p className="text-sm text-muted-foreground">
            Order, shipment, payment ar invoice reconciliation status ek nojore.
          </p>
        </div>
        <Button asChild>
          <Link to="/erp/reconciliation/invoice">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Upload Invoice
          </Link>
        </Button>
      </header>

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