import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Plus, Truck, ShoppingBag, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/brand-context";
import { useOrdersQuery, type OrdersFilter } from "@/hooks/erp/use-orders-query";
import { OrdersFilters } from "@/components/erp/orders/orders-filters";
import { OrdersTable } from "@/components/erp/orders/orders-table";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { downloadCsv, exportOrdersCsv, type OrderStatus } from "@/lib/erp/orders";

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

  const stats = useMemo(() => {
    const s = { total: rows.length, pending: 0, delivered: 0, cancelled: 0 };
    for (const r of rows) {
      if (r.status === "delivered" || r.status === "partial_delivered") s.delivered++;
      else if (r.status === "cancelled") s.cancelled++;
      else s.pending++;
    }
    return s;
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-5 bg-muted/20 min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeBrand?.name} · <span className="tabular-nums font-medium">{total.toLocaleString()}</span> total
            {isFetching && <span className="ml-1 italic text-xs">updating…</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows.length} className="h-9">
            <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
          </Button>
          <Link to="/erp/orders/new"><Button size="sm" className="h-9"><Plus className="h-3.5 w-3.5 mr-1.5" />New Order</Button></Link>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Showing" value={stats.total} icon={ShoppingBag} tone="text-foreground" bg="bg-card" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} tone="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-950/30" />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle2} tone="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-950/30" />
        <StatCard label="Cancelled" value={stats.cancelled} icon={XCircle} tone="text-rose-600 dark:text-rose-400" bg="bg-rose-50 dark:bg-rose-950/30" />
      </div>

      <OrdersFilters filter={effective} onChange={setFilter} />

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl border bg-primary/5 border-primary/20 px-4 py-2.5 text-sm shadow-sm">
          <span className="font-semibold text-primary">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => bulkStatus.mutate("confirmed")} disabled={bulkStatus.isPending}>Mark Confirmed</Button>
          <Button size="sm" variant="outline" onClick={() => bulkStatus.mutate("packaging")} disabled={bulkStatus.isPending}>Packaging</Button>
          <Button size="sm" variant="outline" onClick={() => bulkStatus.mutate("cancelled")} disabled={bulkStatus.isPending}>Cancel</Button>
          <Button size="sm" variant="outline" disabled title="Phase 4"><Truck className="h-3.5 w-3.5 mr-1" />Book Courier</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

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

function StatCard({ label, value, icon: Icon, tone, bg }: { label: string; value: number; icon: typeof ShoppingBag; tone: string; bg: string }) {
  return (
    <div className={`rounded-xl border p-3.5 shadow-sm ${bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value.toLocaleString()}</div>
    </div>
  );
}