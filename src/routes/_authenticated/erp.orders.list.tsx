import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Download, RefreshCw } from "lucide-react";
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
import { IncompleteOrdersTable } from "@/components/erp/orders/incomplete-orders-table";
import { useAbandonedCartCount } from "@/hooks/erp/use-abandoned-carts-query";
import { PathaoBulkUploadDialog } from "@/components/erp/orders/pathao-bulk-upload-dialog";
import { BulkPrintDialog, type PrintMode } from "@/components/erp/orders/bulk-print-dialog";
import { CourierStatusSyncDialog } from "@/components/erp/orders/courier-status-sync-dialog";
import { PhoneHistorySyncDialog } from "@/components/erp/orders/phone-history-sync-dialog";
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
  const [view, setView] = useState<"orders" | "incomplete">("orders");
  const [incompletePage, setIncompletePage] = useState(0);

  const effective = useMemo<OrdersFilter>(
    () => ({ ...filter, brandId: activeBrand?.id ?? null }),
    [filter, activeBrand?.id],
  );

  const { data, isLoading, isFetching } = useOrdersQuery(effective);
  const { data: countsData } = useOrderStatusCounts(effective);
  const { data: incompleteCount } = useAbandonedCartCount(effective.brandId);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [pathaoBulkOpen, setPathaoBulkOpen] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [phoneHistOpen, setPhoneHistOpen] = useState(false);

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

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["abandoned-carts"] });
    qc.invalidateQueries({ queryKey: ["abandoned-carts-count"] });
  };

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));
  const activeTab = view === "incomplete" ? "incomplete" : tabForStatuses(effective.statuses);

  return (
    <div className="p-4 md:p-6 space-y-4 min-h-screen bg-gradient-to-b from-muted/30 via-muted/10 to-background">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            {activeBrand?.name ?? "All brands"} · Orders
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <h1 className="text-[28px] font-bold tracking-tight leading-none">Orders</h1>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-foreground/5 border text-xs">
              <span className="tabular-nums font-bold text-foreground">{total.toLocaleString()}</span>
              <span className="text-muted-foreground">total</span>
              {isFetching && <span className="text-primary font-medium">· syncing</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg border bg-card shadow-sm overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-none border-r"
              onClick={handleRefresh}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" className="h-9 rounded-none gap-1.5" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          <Link to="/erp/orders/new">
            <Button size="sm" className="h-9 shadow-sm gap-1.5 px-3">
              <Plus className="h-3.5 w-3.5" />New Order
            </Button>
          </Link>
        </div>
      </header>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <OrdersStatusTabs
          active={activeTab}
          counts={countsData?.counts ?? {}}
          total={countsData?.total ?? 0}
          incompleteCount={incompleteCount ?? 0}
          onChange={(statuses, key) => {
            if (key === "incomplete") {
              setView("incomplete");
              setIncompletePage(0);
            } else {
              setView("orders");
              setFilter({ ...filter, statuses, page: 0 });
            }
          }}
        />
        {view === "incomplete" ? (
          <IncompleteOrdersTable
            brandId={effective.brandId}
            search=""
            page={incompletePage}
            pageSize={50}
            onPageChange={setIncompletePage}
            onOpenOrder={setOpenId}
          />
        ) : (
          <>
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
              onSendToPathao={() => {
                if (selectedIds.size === 0) return;
                setPathaoBulkOpen(true);
              }}
              onSyncCourier={() => {
                if (selectedIds.size === 0) return;
                setSyncOpen(true);
              }}
              onPhoneHistory={() => {
                if (selectedIds.size === 0) return;
                setPhoneHistOpen(true);
              }}
              onPrint={(mode) => {
                if (selectedIds.size === 0) return;
                setPrintMode(mode);
              }}
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
          </>
        )}
      </div>

      {view === "orders" && (
      <div className="flex items-center justify-between text-sm rounded-xl border bg-card px-4 py-2.5 shadow-sm">
        <div className="text-muted-foreground">
          Page <span className="font-semibold text-foreground tabular-nums">{filter.page + 1}</span> of <span className="font-semibold text-foreground tabular-nums">{totalPages}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={filter.page === 0} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Prev</Button>
          <Button variant="outline" size="sm" disabled={filter.page + 1 >= totalPages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Button>
        </div>
      </div>
      )}

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />

      <PathaoBulkUploadDialog
        open={pathaoBulkOpen}
        onOpenChange={(o) => {
          setPathaoBulkOpen(o);
          if (!o) setSelectedIds(new Set());
        }}
        orders={rows.filter((r) => selectedIds.has(r.id)).map((r) => ({ id: r.id, invoice_no: r.invoice_no }))}
      />

      <BulkPrintDialog
        open={printMode !== null}
        onOpenChange={(o) => { if (!o) setPrintMode(null); }}
        mode={printMode ?? "invoice"}
        orderIds={Array.from(selectedIds)}
      />

      <CourierStatusSyncDialog
        open={syncOpen}
        onOpenChange={(o) => {
          setSyncOpen(o);
          if (!o) setSelectedIds(new Set());
        }}
        orderIds={Array.from(selectedIds)}
      />

      <PhoneHistorySyncDialog
        open={phoneHistOpen}
        onOpenChange={(o) => {
          setPhoneHistOpen(o);
          if (!o) setSelectedIds(new Set());
        }}
        orders={rows
          .filter((r) => selectedIds.has(r.id))
          .map((r) => ({
            id: r.id,
            invoice_no: r.invoice_no ?? null,
            customer: (r as any).shipping_name ?? (r as any).guest_name ?? null,
            phone: (r as any).shipping_phone ?? (r as any).guest_phone ?? null,
            status: r.status,
          }))}
      />
    </div>
  );
}
