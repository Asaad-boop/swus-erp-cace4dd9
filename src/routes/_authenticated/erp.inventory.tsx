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
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<InventoryFilter>({
    brandIds: [], search: "", stockState: "all", page: 0, pageSize: 50,
  });
  const effective = useMemo<InventoryFilter>(
    () => ({ ...filter, brandIds }),
    [filter, brandIds],
  );

  const { data, isLoading } = useInventoryQuery(effective);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lowQuery = useLowStockAlerts(brandIds);
  const movements = useStockMovements(brandIds);

  const brandNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brands) m.set(b.id, b.name);
    return m;
  }, [brands]);

  const [adjust, setAdjust] = useState<{ product: ProductRow; mode: "in" | "out" } | null>(null);
  const [historyProduct, setHistoryProduct] = useState<ProductRow | null>(null);

  const handleExport = () => {
    const csv = exportProductsCsv(rows);
    const slug = isAllBrands ? "all-brands" : activeBrand?.slug ?? "brand";
    downloadCsv(`inventory-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
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
            {isAllBrands ? `All Brands (${brands.length})` : activeBrand?.name ?? "—"} · {total.toLocaleString()} products
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
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No products</TableCell></TableRow>
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
                            <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                              {isAllBrands && r.brand_id && (
                                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-semibold">
                                  {brandNameById.get(r.brand_id) ?? "Brand"}
                                </Badge>
                              )}
                              <span className="truncate">{r.barcode ? `📷 ${r.barcode}` : r.slug}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <InlineTextEdit value={r.sku ?? ""} placeholder="SKU" onSave={(v) => updateInventoryField(r.id, { sku: v })} />
                          {r.variant_skus && r.variant_skus.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {r.variant_skus.map((s) => (
                                <span key={s} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">৳{Number(r.price).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <InlineNumberEdit value={Number(r.cost_price ?? 0)} onSave={(v) => updateInventoryField(r.id, { cost_price: v })} prefix="৳" />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <div className="flex flex-col items-end leading-tight">
                          <span>{r.stock}</span>
                          {Number(r.incoming) > 0 && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">+{r.incoming} incoming</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <InlineNumberEdit value={r.low_stock_threshold ?? 5} onSave={(v) => updateInventoryField(r.id, { low_stock_threshold: v })} />
                      </TableCell>
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

        <TabsContent value="opening" className="space-y-3 mt-3">
          <OpeningStockTab brandId={activeBrand?.id ?? null} />
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
  const brandIds = brandId ? [brandId] : [];
  const { data, isLoading } = useStockMovements(brandIds, product?.id);
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

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
        <div className="mt-1 text-xl font-semibold">{value}</div>
        {hint ? <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

async function updateInventoryField(
  productId: string,
  fields: { low_stock_threshold?: number; reorder_point?: number; cost_price?: number; sku?: string; barcode?: string },
) {
  const { error } = await supabase.rpc("update_product_inventory_fields", {
    _product_id: productId,
    _low_stock_threshold: fields.low_stock_threshold ?? undefined,
    _reorder_point: fields.reorder_point ?? undefined,
    _cost_price: fields.cost_price ?? undefined,
    _sku: fields.sku ?? undefined,
    _barcode: fields.barcode ?? undefined,
  });
  if (error) throw error;
}

function InlineTextEdit({ value, placeholder, onSave }: { value: string; placeholder?: string; onSave: (v: string) => Promise<void> }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const [saving, setSaving] = useState(false);
  const commit = async () => {
    if (v === value) return;
    setSaving(true);
    try { await onSave(v); qc.invalidateQueries({ queryKey: ["inventory"] }); toast.success("Saved"); }
    catch (e) { toast.error((e as Error).message); setV(value); }
    finally { setSaving(false); }
  };
  return (
    <Input
      value={v}
      placeholder={placeholder}
      disabled={saving}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-7 text-xs w-28"
    />
  );
}

function InlineNumberEdit({ value, prefix, onSave }: { value: number; prefix?: string; onSave: (v: number) => Promise<void> }) {
  const qc = useQueryClient();
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const [saving, setSaving] = useState(false);
  const commit = async () => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === value) { setV(String(value)); return; }
    setSaving(true);
    try { await onSave(n); qc.invalidateQueries({ queryKey: ["inventory"] }); toast.success("Saved"); }
    catch (e) { toast.error((e as Error).message); setV(String(value)); }
    finally { setSaving(false); }
  };
  return (
    <div className="inline-flex items-center gap-1">
      {prefix ? <span className="text-xs text-muted-foreground">{prefix}</span> : null}
      <Input
        type="number"
        value={v}
        disabled={saving}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-7 text-xs w-20 text-right"
      />
    </div>
  );
}

function OpeningStockTab({ brandId }: { brandId: string | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const brandIds = brandId ? [brandId] : [];
  const { data, isLoading } = useInventoryQuery({
    brandIds, search, stockState: "all", page: 0, pageSize: 200,
  });
  const rows = data?.rows ?? [];
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});

  const apply = useMutation({
    mutationFn: async (entries: { id: string; qty: number; cost?: number }[]) => {
      for (const e of entries) {
        const { error } = await supabase.rpc("set_product_stock", {
          _product_id: e.id, _new_qty: e.qty, _reason: "opening_stock", _note: "Initial opening stock",
        });
        if (error) throw error;
        if (e.cost != null && Number.isFinite(e.cost)) {
          await supabase.rpc("update_product_inventory_fields", {
            _product_id: e.id, _cost_price: e.cost,
          });
        }
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(`Opening stock applied to ${vars.length} product${vars.length === 1 ? "" : "s"}`);
      setCounts({}); setCosts({});
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = useMemo(() => {
    const list: { id: string; qty: number; cost?: number; title: string; currentStock: number }[] = [];
    for (const r of rows) {
      const raw = counts[r.id];
      if (raw == null || raw === "") continue;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty < 0) continue;
      if (qty === r.stock) continue;
      const costRaw = costs[r.id];
      const cost = costRaw ? Number(costRaw) : undefined;
      list.push({ id: r.id, qty, cost, title: r.title, currentStock: r.stock });
    }
    return list;
  }, [counts, costs, rows]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 text-sm space-y-1">
          <div className="font-medium">Opening Stock setup</div>
          <p className="text-muted-foreground text-xs">
            Protita product er ajker physical count likho. System current stock theke delta calculate kore stock_movements e <span className="font-medium">opening_stock</span> hisebe log korbe. Cost price (per unit) optional — diley stock valuation accurate hobe.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search title, SKU, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{pending.length} pending</span>
          <Button disabled={!pending.length || apply.isPending} onClick={() => apply.mutate(pending)}>
            <Check className="h-4 w-4 mr-1" />
            {apply.isPending ? "Applying…" : `Apply ${pending.length || ""}`.trim()}
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right w-[140px]">Physical count</TableHead>
              <TableHead className="text-right w-[140px]">Cost (optional)</TableHead>
              <TableHead className="text-right">Delta</TableHead>
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
              const raw = counts[r.id] ?? "";
              const qty = raw === "" ? null : Number(raw);
              const delta = qty != null && Number.isFinite(qty) ? qty - r.stock : null;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {r.image && <img src={r.image} alt="" className="h-8 w-8 rounded object-cover" />}
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[280px]">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.sku ? `SKU: ${r.sku}` : r.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.stock}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} placeholder="—"
                      value={raw}
                      onChange={(e) => setCounts((c) => ({ ...c, [r.id]: e.target.value }))}
                      className="h-8 text-right text-sm w-[120px] ml-auto"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number" min={0} placeholder={r.cost_price ? `৳${r.cost_price}` : "—"}
                      value={costs[r.id] ?? ""}
                      onChange={(e) => setCosts((c) => ({ ...c, [r.id]: e.target.value }))}
                      className="h-8 text-right text-sm w-[120px] ml-auto"
                    />
                  </TableCell>
                  <TableCell className={`text-right font-mono ${delta == null ? "text-muted-foreground" : delta < 0 ? "text-red-600" : delta > 0 ? "text-emerald-600" : ""}`}>
                    {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}