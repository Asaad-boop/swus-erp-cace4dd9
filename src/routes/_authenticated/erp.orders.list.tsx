import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Settings2, ShoppingBag, TrendingUp, Package, Wallet } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/brand-context";
import { useOrdersQuery, useOrderStatusCounts, type OrdersFilter } from "@/hooks/erp/use-orders-query";
import { OrdersStatusTabs } from "@/components/erp/orders/orders-status-tabs";
import { OrdersToolbar } from "@/components/erp/orders/orders-toolbar";
import { OrdersBulkActions } from "@/components/erp/orders/orders-bulk-actions";
import { OrdersTable } from "@/components/erp/orders/orders-table";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { downloadCsv, exportOrdersCsv, tabForStatuses, type OrderStatus } from "@/lib/erp/orders";

export const Route = createFileRoute("/_authenticated/erp/orders/list")({
  head: () => ({ meta: [{ title: "Orders — ERP" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const qc = useQueryClient();
  const { activeBrand } = useBrand();
  const [filter, setFilter] = useState<OrdersFilter>({
    brandId: null, search: "", statuses: [], source: null,
    dateFrom: null, dateTo: null, courier: null, page: 0, pageSize: 50,
  });

  const effective = useMemo<OrdersFilter>(
    () => ({ ...filter, brandId: activeBrand?.id ?? null }),
    [filter, activeBrand?.id],
  );

  const { data, isLoading, isFetching } = useOrdersQuery(effective);
  const { data: countsData } = useOrderStatusCounts(effective);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(rows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.rpc("transition_order_status", { _order_id: id, _new_status: status });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) =>
        supabase.rpc("transition_order_status", { _order_id: id, _new_status: status })
      ));
    },
    onSuccess: () => {
      toast.success(`Updated ${selectedIds.size} orders`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleExport = () => {
    const csv = exportOrdersCsv(rows);
    downloadCsv(`orders-${activeBrand?.slug}-${new Date().toISOString().slice(0,10)}.csv`, csv);
  };

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
  const activeTab = tabForStatuses(effective.statuses);

  const stats = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    const itemsCount = rows.reduce(
      (s, r) => s + (r.items?.reduce((q, it) => q + (it.quantity ?? 0), 0) ?? 0),
      0,
    );
    const aov = rows.length ? revenue / rows.length : 0;
    return { revenue, itemsCount, aov };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-5 bg-gradient-to-br from-background via-muted/10 to-muted/30 min-h-screen">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {activeBrand?.name ?? "All brands"} · Orders
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Order List</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="tabular-nums font-semibold text-foreground">{total.toLocaleString()}</span> total orders
            {isFetching && <span className="ml-1.5 italic text-xs text-primary">syncing…</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" disabled title="View settings">
            <Settings2 className="h-4 w-4" />
          </Button>
          <Link to="/erp/orders/new">
            <Button size="sm" className="h-9 shadow-sm">
              <Plus className="h-3.5 w-3.5 mr-1.5" />New Order
            </Button>
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<ShoppingBag className="h-4 w-4" />} label="Orders on page" value={rows.length.toLocaleString()} tint="from-blue-500/10 to-blue-500/0" iconTint="text-blue-600" />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Revenue (page)" value={`৳${Math.round(stats.revenue).toLocaleString()}`} tint="from-emerald-500/10 to-emerald-500/0" iconTint="text-emerald-600" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Avg Order Value" value={`৳${Math.round(stats.aov).toLocaleString()}`} tint="from-violet-500/10 to-violet-500/0" iconTint="text-violet-600" />
        <StatCard icon={<Package className="h-4 w-4" />} label="Items shipped" value={stats.itemsCount.toLocaleString()} tint="from-amber-500/10 to-amber-500/0" iconTint="text-amber-600" />
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <OrdersStatusTabs
          active={activeTab}
          counts={countsData?.counts ?? {}}
          total={countsData?.total ?? 0}
          onChange={(statuses) => setFilter({ ...filter, statuses, page: 0 })}
        />
        <OrdersToolbar
          filter={effective}
          onChange={setFilter}
          rightSlot={
            <OrdersBulkActions
              selectedCount={selectedIds.size}
              totalCount={rows.length}
              onSelectAll={() => setSelectedIds(new Set(rows.map((r) => r.id)))}
              onClear={() => setSelectedIds(new Set())}
              onStatus={(s) => bulkStatus.mutate(s)}
              onExport={handleExport}
              isPending={bulkStatus.isPending}
            />
          }
        />
        <OrdersTable
          rows={rows}
          loading={isLoading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onRowClick={setOpenId}
          onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
          pendingStatusId={statusMutation.isPending ? statusMutation.variables?.id : null}
        />
      </div>

      <div className="flex items-center justify-between text-sm rounded-xl border bg-card px-4 py-2.5 shadow-sm">
        <div className="text-muted-foreground">
          Page <span className="font-semibold text-foreground tabular-nums">{filter.page + 1}</span> of <span className="font-semibold text-foreground tabular-nums">{totalPages}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={filter.page === 0} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Prev</Button>
          <Button variant="outline" size="sm" disabled={filter.page + 1 >= totalPages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Button>
        </div>
      </div>

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function StatCard({
  icon, label, value, tint, iconTint,
}: { icon: React.ReactNode; label: string; value: string; tint: string; iconTint: string }) {
  return (
    <div className={`relative rounded-xl border bg-card shadow-sm overflow-hidden p-3.5 group hover:shadow-md transition-shadow`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${tint} pointer-events-none`} />
      <div className="relative flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg bg-background border flex items-center justify-center ${iconTint} shadow-sm`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-bold tabular-nums leading-tight truncate">{value}</div>
        </div>
      </div>
    </div>
  );
}
