import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Download, Search, ArrowUp, ArrowDown, History, Check, Package, Boxes, AlertTriangle, Wallet } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBrand } from "@/contexts/brand-context";
import {
  useInventoryQuery,
  useLowStockAlerts,
  useStockMovements,
  useProductTitles,
  type InventoryFilter,
} from "@/hooks/erp/use-inventory-query";
import {
  stockBadge,
  exportProductsCsv,
  STOCK_REASONS,
  type ProductRow,
} from "@/lib/erp/inventory";
import { downloadCsv } from "@/lib/erp/orders";
import { StockAdjustDialog } from "@/components/erp/inventory/stock-adjust-dialog";

export const Route = createFileRoute("/_authenticated/erp/inventory")({
  head: () => ({ meta: [{ title: "Inventory — ERP" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { activeBrand } = useBrand();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<InventoryFilter>({
    brandId: null, search: "", stockState: "all", page: 0, pageSize: 50,
  });
  const effective = useMemo<InventoryFilter>(
    () => ({ ...filter, brandId: activeBrand?.id ?? null }),
    [filter, activeBrand?.id],
  );

  const { data, isLoading } = useInventoryQuery(effective);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lowQuery = useLowStockAlerts(activeBrand?.id ?? null);
  const movements = useStockMovements(activeBrand?.id ?? null);

  const [adjust, setAdjust] = useState<{ product: ProductRow; mode: "in" | "out" } | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductRow | null>(null);

  const handleExport = () => {
    const csv = exportProductsCsv(rows);
    downloadCsv(`inventory-${activeBrand?.slug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const movementProductIds = useMemo(
    () => Array.from(new Set((movements.data ?? []).map((m) => m.product_id))),
    [movements.data],
  );
  const titles = useProductTitles(movementProductIds);

  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));

  // Stock valuation across all rows in current page (for summary card we use full count via separate query when needed)
  const summary = useMemo(() => {
    let units = 0, value = 0, low = 0, out = 0;
    for (const r of rows) {
      units += r.stock;
      value += (Number(r.cost_price ?? 0)) * r.stock;
      if (r.stock <= 0) out += 1;
      else if (r.stock <= (r.low_stock_threshold ?? 5)) low += 1;
    }
    return { units, value, low, out };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {activeBrand?.name} · {total.toLocaleString()} products
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!rows.length}>
          <Download className="h-4 w-4 mr-1" />CSV
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Package className="h-4 w-4" />} label="Products (page)" value={rows.length.toLocaleString()} hint={`${total.toLocaleString()} total`} />
        <StatCard icon={<Boxes className="h-4 w-4" />} label="Stock units (page)" value={summary.units.toLocaleString()} />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Stock value (page)" value={`৳${summary.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} hint="cost × stock" />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="Low / Out (page)" value={`${summary.low} / ${summary.out}`} hint={lowQuery.data?.length ? `${lowQuery.data.length} alerts total` : undefined} />
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="opening">Opening Stock</TabsTrigger>
          <TabsTrigger value="low">
            Low Stock {lowQuery.data?.length ? <Badge variant="destructive" className="ml-2">{lowQuery.data.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3 mt-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search title, SKU, barcode, slug… (scanner ready)"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value, page: 0 })}
                autoFocus
              />
            </div>
            <Select
              value={filter.stockState}
              onValueChange={(v: InventoryFilter["stockState"]) => setFilter({ ...filter, stockState: v, page: 0 })}
            >
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="in">In stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No products</TableCell></TableRow>
                )}
                {rows.map((r) => {
                  const b = stockBadge(r.stock, r.low_stock_threshold);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {r.image && <img src={r.image} alt="" className="h-9 w-9 rounded object-cover" />}
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[280px]">{r.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{r.slug}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">৳{Number(r.price).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{r.stock}</TableCell>
                      <TableCell><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}>{b.label}</span></TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setAdjust({ product: r, mode: "in" })}>
                            <ArrowUp className="h-3.5 w-3.5 mr-1" />In
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAdjust({ product: r, mode: "out" })}>
                            <ArrowDown className="h-3.5 w-3.5 mr-1" />Out
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setHistoryProduct(r)} title="History">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Page {filter.page + 1} of {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={filter.page === 0} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Prev</Button>
              <Button variant="outline" size="sm" disabled={filter.page + 1 >= totalPages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="low" className="space-y-3 mt-3">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Alerted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowQuery.isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!lowQuery.isLoading && (lowQuery.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No low-stock alerts 🎉</TableCell></TableRow>
                )}
                {(lowQuery.data ?? []).map((a) => {
                  const p = a.products as unknown as {
                    id: string; title: string; slug: string; image: string | null; stock: number; low_stock_threshold: number | null; brand_id: string | null;
                  };
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {p.image && <img src={p.image} alt="" className="h-9 w-9 rounded object-cover" />}
                          <div className="font-medium truncate max-w-[280px]">{p.title}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{p.stock}</TableCell>
                      <TableCell className="text-right">{a.threshold}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setAdjust({
                          product: { id: p.id, title: p.title, slug: p.slug, image: p.image, price: 0, stock: p.stock, low_stock_threshold: p.low_stock_threshold, is_active: true, brand_id: p.brand_id, category_id: null, updated_at: "" },
                          mode: "in",
                        })}>
                          <ArrowUp className="h-3.5 w-3.5 mr-1" />Restock
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="movements" className="space-y-3 mt-3">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Before → After</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.isLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!movements.isLoading && (movements.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No movements yet</TableCell></TableRow>
                )}
                {(movements.data ?? []).map((m) => {
                  const t = titles.data?.get(m.product_id);
                  const reasonLabel = STOCK_REASONS.find((x) => x.value === m.reason)?.label ?? m.reason;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</TableCell>
                      <TableCell className="truncate max-w-[260px]">{t?.title ?? m.product_id.slice(0, 8)}</TableCell>
                      <TableCell>{reasonLabel}</TableCell>
                      <TableCell className={`text-right font-mono ${m.delta < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {m.delta > 0 ? "+" : ""}{m.delta}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.stock_before} → {m.stock_after}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[240px]">{m.note ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <StockAdjustDialog
        product={adjust?.product ?? null}
        mode={adjust?.mode ?? "in"}
        onClose={() => { setAdjust(null); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
      />

      <ProductHistorySheet product={historyProduct} onClose={() => setHistoryProduct(null)} brandId={activeBrand?.id ?? null} />
    </div>
  );
}

function ProductHistorySheet({ product, onClose, brandId }: { product: ProductRow | null; onClose: () => void; brandId: string | null }) {
  const { data, isLoading } = useStockMovements(brandId, product?.id);
  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="truncate">History — {product?.title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && (data?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">No movements recorded.</div>}
          {(data ?? []).map((m) => {
            const reasonLabel = STOCK_REASONS.find((x) => x.value === m.reason)?.label ?? m.reason;
            return (
              <div key={m.id} className="border rounded-md p-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{reasonLabel}</span>
                  <span className={`font-mono ${m.delta < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {m.delta > 0 ? "+" : ""}{m.delta}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex justify-between mt-1">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  <span className="font-mono">{m.stock_before} → {m.stock_after}</span>
                </div>
                {m.note && <div className="text-xs mt-1">{m.note}</div>}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}