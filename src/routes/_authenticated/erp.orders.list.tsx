import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  MoreHorizontal, Truck, Printer, FileText, Copy, ExternalLink,
  RefreshCw, Download, Search, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import {
  customerName, customerPhone, invoiceDisplay, statusBadge,
  exportOrdersCsv, downloadCsv, ORDER_STATUSES, type OrderRow,
} from "@/lib/erp/orders";
import { useCourierShipments } from "@/hooks/erp/use-courier-shipments";
import { CourierStatusBadge } from "@/components/erp/orders/courier-status-badge";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { PathaoBulkUploadDialog } from "@/components/erp/orders/pathao-bulk-upload-dialog";
import { BulkPrintDialog, type PrintMode } from "@/components/erp/orders/bulk-print-dialog";
import { CourierStatusSyncDialog } from "@/components/erp/orders/courier-status-sync-dialog";
import { cn } from "@/lib/utils";

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "all";

function computeRange(preset: DatePreset): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "30d") {
    start.setDate(start.getDate() - 29);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

const COURIER_OPTIONS = [
  { value: "all", label: "All Couriers" },
  { value: "pathao", label: "Pathao" },
  { value: "steadfast", label: "Steadfast" },
  { value: "none", label: "Not Booked" },
] as const;

export const Route = createFileRoute("/_authenticated/erp/orders/list")({
  head: () => ({ meta: [{ title: "Order List — ERP" }] }),
  component: OrderListPage,
});

function OrderListPage() {
  const { brandIds, activeBrand } = useBrand();
  const [preset, setPreset] = useState<DatePreset>("7d");
  const [status, setStatus] = useState<string>("all");
  const [courier, setCourier] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const [pathaoOpen, setPathaoOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>("invoice");
  const [syncOpen, setSyncOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);

  const range = useMemo(() => computeRange(preset), [preset]);

  const { data: orders, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["order-list", brandIds, range.from, range.to, status, courier],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id,invoice_no,created_at,status,total,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,guest_name,guest_phone,courier_name,tracking_number,brand_id"
        )
        .order("created_at", { ascending: false })
        .limit(500);
      q = applyBrandScope(q, brandIds);
      if (range.from) q = q.gte("created_at", range.from);
      if (range.to) q = q.lte("created_at", range.to);
      if (status !== "all") q = q.eq("status", status as never);
      if (courier === "none") q = q.is("courier_name", null);
      else if (courier !== "all") q = q.eq("courier_name", courier);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  // Item counts per order
  const orderIds = useMemo(() => (orders ?? []).map((o) => o.id), [orders]);
  const { data: itemCounts } = useQuery({
    queryKey: ["order-list-item-counts", orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id,quantity")
        .in("order_id", orderIds);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        map.set(r.order_id as string, (map.get(r.order_id as string) ?? 0) + (Number(r.quantity) || 0));
      }
      return map;
    },
  });

  const courierMap = useCourierShipments(orderIds);

  const filtered = useMemo(() => {
    const list = orders ?? [];
    const qstr = query.trim().toLowerCase();
    if (!qstr) return list;
    return list.filter((o) => {
      const name = (customerName(o) ?? "").toLowerCase();
      const phone = (customerPhone(o) ?? "").toLowerCase();
      const inv = invoiceDisplay(o).toLowerCase();
      return name.includes(qstr) || phone.includes(qstr) || inv.includes(qstr);
    });
  }, [orders, query]);

  const allSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((o) => o.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedOrders = useMemo(
    () => filtered.filter((o) => selected.has(o.id)),
    [filtered, selected],
  );
  const selectedIds = useMemo(() => selectedOrders.map((o) => o.id), [selectedOrders]);

  const openPrint = (mode: PrintMode) => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one order");
      return;
    }
    setPrintMode(mode);
    setPrintOpen(true);
  };

  const exportCsv = () => {
    const rows = selectedOrders.length > 0 ? selectedOrders : filtered;
    if (rows.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const csv = exportOrdersCsv(rows as OrderRow[]);
    downloadCsv(`orders-${format(new Date(), "yyyyMMdd-HHmm")}.csv`, csv);
  };

  const copyOrderLink = async (id: string) => {
    try {
      const url = `${window.location.origin}/erp/orders/${id}`;
      await navigator.clipboard.writeText(url);
      toast.success("Order link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const bulkChangeStatus = async (newStatus: string) => {
    if (selectedIds.length === 0) return;
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus as never })
        .in("id", selectedIds);
      if (error) throw error;
      toast.success(`Updated ${selectedIds.length} orders → ${newStatus}`);
      setSelected(new Set());
      setBulkStatusOpen(false);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Order List</h1>
          <p className="text-xs text-muted-foreground">
            Bulk operations, courier booking & printing
            {activeBrand ? ` · ${activeBrand.name}` : " · All brands"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, phone or order#"
            className="pl-8 h-9"
          />
        </div>
        <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{statusBadge(s).label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={courier} onValueChange={setCourier}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COURIER_OPTIONS.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Action Bar */}
      <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">
          {selected.size > 0 ? (
            <span><span className="text-primary">{selected.size}</span> selected</span>
          ) : (
            <span className="text-muted-foreground">{filtered.length} orders</span>
          )}
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => selectedIds.length ? setPathaoOpen(true) : toast.error("Select orders first")}>
          <Truck className="h-4 w-4 mr-1.5" /> Book Pathao
        </Button>
        <Button size="sm" variant="outline" onClick={() => openPrint("invoice")}>
          <Printer className="h-4 w-4 mr-1.5" /> Print Invoices
        </Button>
        <Button size="sm" variant="outline" onClick={() => openPrint("picking")}>
          <FileText className="h-4 w-4 mr-1.5" /> Packing Slips
        </Button>
        <DropdownMenu open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={selectedIds.length === 0}>
              Change Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Set status to</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ORDER_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onClick={() => bulkChangeStatus(s)}>
                {statusBadge(s).label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="outline" onClick={() => selectedIds.length ? setSyncOpen(true) : toast.error("Select orders first")}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Courier Sync
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-24">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="w-16 text-center">Items</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-40">Courier</TableHead>
              <TableHead className="w-32">Date</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                  No orders match these filters.
                </TableCell>
              </TableRow>
            ) : filtered.map((o) => {
              const badge = statusBadge(o.status);
              const ship = courierMap.data?.[o.id];
              const isSel = selected.has(o.id);
              return (
                <TableRow key={o.id} data-state={isSel ? "selected" : undefined} className="cursor-pointer" onClick={() => setDrawerId(o.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSel} onCheckedChange={() => toggleOne(o.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{invoiceDisplay(o)}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm leading-tight">{customerName(o)}</div>
                    <div className="text-xs text-muted-foreground">{customerPhone(o)}</div>
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">
                    {itemCounts?.get(o.id) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-sm">
                    ৳{Number(o.total ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn("text-[10px] font-bold", badge.className)}>{badge.label}</Badge>
                  </TableCell>
                  <TableCell>
                    {ship ? (
                      <CourierStatusBadge shipment={ship} />
                    ) : o.courier_name ? (
                      <span className="text-xs text-muted-foreground">{o.courier_name}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(o.created_at), "MMM d, HH:mm")}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelected(new Set([o.id])); setPathaoOpen(true); }}>
                          <Truck className="h-3.5 w-3.5 mr-2" /> Book Pathao
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelected(new Set([o.id])); setPrintMode("invoice"); setPrintOpen(true); }}>
                          <Printer className="h-3.5 w-3.5 mr-2" /> Print Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setSelected(new Set([o.id])); setPrintMode("picking"); setPrintOpen(true); }}>
                          <FileText className="h-3.5 w-3.5 mr-2" /> Print Packing Slip
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => copyOrderLink(o.id)}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> Copy Order Link
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/erp/orders/$orderId" params={{ orderId: o.id }}>
                            <ExternalLink className="h-3.5 w-3.5 mr-2" /> View Order
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {isFetching && !isLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Refreshing…
        </div>
      )}

      {/* Dialogs */}
      <OrderDrawer orderId={drawerId} onClose={() => setDrawerId(null)} mode="fulfillment" />
      <PathaoBulkUploadDialog
        open={pathaoOpen}
        onOpenChange={setPathaoOpen}
        orders={selectedOrders.map((o) => ({ id: o.id, invoice_no: o.invoice_no }))}
      />
      <BulkPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        mode={printMode}
        orderIds={selectedIds}
      />
      <CourierStatusSyncDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        orderIds={selectedIds}
      />
    </div>
  );
}