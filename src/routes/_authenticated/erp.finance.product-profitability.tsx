import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Download, Package, Search, TrendingUp, TrendingDown,
  PackageCheck, RotateCcw, Repeat2, Truck, Megaphone, FileText,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtBdt } from "@/lib/erp/finance";
import { cn } from "@/lib/utils";
import { ReturnCaseDialog } from "@/components/erp/finance/return-case-dialog";
import { ExchangeCaseDialog } from "@/components/erp/finance/exchange-case-dialog";
import { ProductExpenseAllocationDialog } from "@/components/erp/finance/product-expense-allocation-dialog";
import { Plus, RefreshCcw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/erp/finance/product-profitability")({
  head: () => ({ meta: [{ title: "Product Profitability — Finance" }] }),
  component: ProductProfitabilityPage,
});

type ProductRow = { id: string; title: string; sku: string | null; image: string | null; brand_id: string | null; stock: number | null };

type Report = {
  product: { id: string; name: string; sku: string | null; image: string | null; brand_id: string; cost_price: number | null; stock: number | null };
  stock: { current: number; delivered_in_range: number; returned_in_range: number };
  quantities: { website_orders: number; manual_orders: number; confirmed: number; delivered: number; shipped: number; cancelled: number; returned: number; exchanged: number; damaged: number };
  sources: Array<{ source: string; created: number; confirmed: number; shipped: number; delivered: number; returned: number; revenue: number; delivery_collected: number; net_payable: number; delivery_rate: number }>;
  revenue: { gross: number; delivery_collected: number; discount: number; refund: number; net_payable: number };
  cost: { cogs: number; courier_out: number; courier_return: number; packaging: number; return_loss: number; exchange_loss: number; damage_loss: number; refund_loss: number; meta_ads: number; marketing_content: number };
  profit: { gross: number; contribution: number; net: number; per_delivered_unit: number; per_confirmed_unit: number; return_rate: number; exchange_rate: number; damage_rate: number; delivery_success_rate: number };
  items: Array<{ order_id: string; item_id: string; date: string; status: string; source: string; qty: number; unit_price: number; line_total: number; unit_cost: number | null; discount_alloc: number | null; delivery_alloc: number | null; courier_cost: number | null }>;
  returns: Array<{ id: string; order_id: string; return_type: string; condition: string; qty: number; refund: number; cost_loss: number; status: string; created_at: string }>;
  exchanges: Array<{ id: string; original_order_id: string; exchange_type: string; old_condition: string; replacement_product_id: string | null; qty: number; loss: number; status: string; created_at: string }>;
  marketing: Array<{ expense_type: string; amount: number; note: string | null; created_at: string }>;
  warnings: string[];
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(d: number) { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); }

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ProductProfitabilityPage() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;

  const [productId, setProductId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(daysAgoIso(30));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [dateBasis, setDateBasis] = useState<"created" | "confirmed" | "delivered">("created");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const qc = useQueryClient();
  const backfillMut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      const { data, error } = await supabase.rpc("backfill_order_profit_snapshots" as any, { p_brand_id: brandId });
      if (error) throw error;
      return data as unknown as number;
    },
    onSuccess: (n) => {
      toast.success(`Re-snapshotted ${n} orders`);
      qc.invalidateQueries({ queryKey: ["pp-report"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // product list (search)
  const productsQ = useQuery({
    queryKey: ["pp-products", brandId, search],
    enabled: !!brandId && pickerOpen,
    queryFn: async () => {
      let q = supabase.from("products").select("id,title,sku,image,brand_id,stock").eq("brand_id", brandId!).order("title").limit(50);
      if (search.trim()) q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ProductRow[];
    },
  });

  const reportQ = useQuery({
    queryKey: ["pp-report", brandId, productId, dateFrom, dateTo, dateBasis],
    enabled: !!brandId && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_profitability_report", {
        p_brand_id: brandId!,
        p_product_id: productId!,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_date_basis: dateBasis,
      });
      if (error) throw error;
      return data as unknown as Report;
    },
  });

  const r = reportQ.data;

  const funnelData = useMemo(() => {
    if (!r) return [];
    const q = r.quantities;
    return [
      { stage: "Confirmed", qty: q.confirmed },
      { stage: "Shipped", qty: q.shipped },
      { stage: "Delivered", qty: q.delivered },
      { stage: "Returned", qty: q.returned },
      { stage: "Exchanged", qty: q.exchanged },
      { stage: "Damaged", qty: q.damaged },
    ];
  }, [r]);

  const costPie = useMemo(() => {
    if (!r) return [];
    const c = r.cost;
    return [
      { name: "COGS", value: c.cogs },
      { name: "Courier Out", value: c.courier_out },
      { name: "Packaging", value: c.packaging },
      { name: "Return Loss", value: c.return_loss },
      { name: "Exchange Loss", value: c.exchange_loss },
      { name: "Damage Loss", value: c.damage_loss },
      { name: "Meta Ads", value: c.meta_ads },
      { name: "Content/Other", value: c.marketing_content },
    ].filter((x) => Number(x.value) > 0);
  }, [r]);

  function exportItemsCsv() {
    if (!r) return;
    downloadCsv(`product-${r.product.sku ?? r.product.id}-items.csv`, [
      ["Date", "Order", "Status", "Source", "Qty", "Unit Price", "Line Total", "Unit Cost", "Discount Alloc", "Delivery Alloc", "Courier Cost"],
      ...r.items.map((i) => [i.date, i.order_id, i.status, i.source, i.qty, i.unit_price, i.line_total, i.unit_cost ?? "", i.discount_alloc ?? "", i.delivery_alloc ?? "", i.courier_cost ?? ""]),
    ]);
  }
  function exportSourcesCsv() {
    if (!r) return;
    downloadCsv(`product-${r.product.sku ?? r.product.id}-sources.csv`, [
      ["Source", "Created", "Confirmed", "Shipped", "Delivered", "Returned", "Revenue", "Delivery Collected", "Net Payable", "Delivery Rate %"],
      ...r.sources.map((s) => [s.source, s.created, s.confirmed, s.shipped, s.delivered, s.returned, s.revenue, s.delivery_collected, s.net_payable, s.delivery_rate]),
    ]);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Product Profitability</h1>
          <p className="text-sm text-muted-foreground">True unit economics — orders, COGS, courier, returns, exchanges, ads.</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <Label className="text-xs">Product</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <Package className="h-4 w-4 mr-2" />
                    {r?.product?.name ?? (productId ? "Loading…" : "Select product")}
                    {r?.product?.sku && <span className="text-muted-foreground ml-2">· {r.product.sku}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input autoFocus placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {productsQ.isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
                    {!productsQ.isLoading && (productsQ.data ?? []).length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground">No products found.</div>
                    )}
                    {(productsQ.data ?? []).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setProductId(p.id); setPickerOpen(false); }}
                        className={cn(
                          "w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 border-b last:border-0",
                          productId === p.id && "bg-muted",
                        )}
                      >
                        {p.image ? (
                          <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{p.title}</div>
                          <div className="text-xs text-muted-foreground">{p.sku ?? "—"} · stock {p.stock ?? 0}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Date Basis</Label>
              <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as typeof dateBasis)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Order created</SelectItem>
                  <SelectItem value="confirmed">Confirmed at</SelectItem>
                  <SelectItem value="delivered">Delivered at</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setDateFrom(daysAgoIso(7)); setDateTo(todayIso()); }}>7d</Button>
              <Button variant="outline" className="flex-1" onClick={() => { setDateFrom(daysAgoIso(30)); setDateTo(todayIso()); }}>30d</Button>
              <Button variant="outline" className="flex-1" onClick={() => { setDateFrom(daysAgoIso(90)); setDateTo(todayIso()); }}>90d</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!productId && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
          Select a product to view its profitability report.
        </CardContent></Card>
      )}

      {productId && reportQ.isLoading && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Calculating profitability…</CardContent></Card>
      )}

      {productId && reportQ.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Report failed</AlertTitle>
          <AlertDescription>{(reportQ.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {r && (
        <>
          {/* Warnings */}
          {r.warnings && r.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Data quality warnings</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-sm">
                  {r.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Profit KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard title="Gross Profit" value={r.profit.gross} hint="Net payable − COGS" tone="emerald" />
            <KpiCard title="Contribution Profit" value={r.profit.contribution} hint="Gross − courier/packaging/returns/exchanges/damage − Meta ads" tone="blue" />
            <KpiCard title="Net Profit" value={r.profit.net} hint="Contribution − marketing content/other" tone={r.profit.net >= 0 ? "emerald" : "red"} bold />
            <KpiCard title="Profit / Delivered Unit" value={r.profit.per_delivered_unit} hint={`${r.quantities.delivered} delivered`} tone="amber" />
          </div>

          {/* Stock + Rates */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SmallStat label="Current Stock" value={r.stock.current} icon={Package} />
            <SmallStat label="Delivery Success" value={`${r.profit.delivery_success_rate}%`} icon={PackageCheck} />
            <SmallStat label="Return Rate" value={`${r.profit.return_rate}%`} icon={RotateCcw} />
            <SmallStat label="Exchange Rate" value={`${r.profit.exchange_rate}%`} icon={Repeat2} />
          </div>

          {/* Funnel + Cost pie */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Quantity Funnel</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={funnelData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Cost Breakdown</CardTitle></CardHeader>
              <CardContent>
                {costPie.length === 0 ? (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No costs in range</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={costPie} dataKey="value" nameKey="name" outerRadius={90} label={(e) => fmtBdt(e.value as number)}>
                        {costPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtBdt(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Revenue + Cost summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Revenue</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <Row label="Gross product revenue" v={r.revenue.gross} />
                <Row label="Delivery collected" v={r.revenue.delivery_collected} />
                <Row label="Discount given" v={-r.revenue.discount} />
                <Row label="Refund (delivered)" v={-r.revenue.refund} />
                <Row label="Net payable" v={r.revenue.net_payable} bold />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> Costs</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <Row label="COGS (unit cost × delivered)" v={r.cost.cogs} />
                <Row label="Courier (out)" v={r.cost.courier_out} />
                <Row label="Courier (return)" v={r.cost.courier_return} />
                <Row label="Packaging" v={r.cost.packaging} />
                <Row label="Return loss" v={r.cost.return_loss} />
                <Row label="Exchange loss" v={r.cost.exchange_loss} />
                <Row label="Damage loss" v={r.cost.damage_loss} />
                <Row label="Meta ads" v={r.cost.meta_ads} />
                <Row label="Marketing / content" v={r.cost.marketing_content} />
              </CardContent>
            </Card>
          </div>

          {/* Tabs: Sources / Items / Returns / Exchanges / Marketing */}
          <Card>
            <CardContent className="pt-4">
              <Tabs defaultValue="sources">
                <TabsList>
                  <TabsTrigger value="sources">Sources ({r.sources.length})</TabsTrigger>
                  <TabsTrigger value="items">Order Items ({r.items.length})</TabsTrigger>
                  <TabsTrigger value="returns">Returns ({r.returns.length})</TabsTrigger>
                  <TabsTrigger value="exchanges">Exchanges ({r.exchanges.length})</TabsTrigger>
                  <TabsTrigger value="marketing">Marketing ({r.marketing.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="sources" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={exportSourcesCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
                  </div>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Source</TableHead><TableHead className="text-right">Created</TableHead><TableHead className="text-right">Confirmed</TableHead>
                        <TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Returned</TableHead>
                        <TableHead className="text-right">Delivery %</TableHead><TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Net Payable</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.sources.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No source data</TableCell></TableRow>}
                        {r.sources.map((s) => (
                          <TableRow key={s.source}>
                            <TableCell><Badge variant="outline">{s.source}</Badge></TableCell>
                            <TableCell className="text-right">{s.created}</TableCell>
                            <TableCell className="text-right">{s.confirmed}</TableCell>
                            <TableCell className="text-right">{s.delivered}</TableCell>
                            <TableCell className="text-right">{s.returned}</TableCell>
                            <TableCell className="text-right">{s.delivery_rate}%</TableCell>
                            <TableCell className="text-right">{fmtBdt(s.revenue)}</TableCell>
                            <TableCell className="text-right font-medium">{fmtBdt(s.net_payable)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="items" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={exportItemsCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
                  </div>
                  <div className="rounded border overflow-x-auto max-h-[500px]">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Source</TableHead>
                        <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Line</TableHead><TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Courier</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.items.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No items</TableCell></TableRow>}
                        {r.items.map((i) => (
                          <TableRow key={i.item_id}>
                            <TableCell className="whitespace-nowrap">{i.date}</TableCell>
                            <TableCell className="font-mono text-xs">{i.order_id.slice(0, 8)}</TableCell>
                            <TableCell><Badge variant="outline" className="capitalize">{i.status}</Badge></TableCell>
                            <TableCell className="text-xs">{i.source}</TableCell>
                            <TableCell className="text-right">{i.qty}</TableCell>
                            <TableCell className="text-right">{fmtBdt(i.unit_price)}</TableCell>
                            <TableCell className="text-right">{fmtBdt(i.line_total)}</TableCell>
                            <TableCell className="text-right">{i.unit_cost == null ? <span className="text-muted-foreground italic">N/A</span> : fmtBdt(i.unit_cost)}</TableCell>
                            <TableCell className="text-right">{fmtBdt(i.courier_cost ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="returns" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)} disabled={!brandId || !productId}>
                      <Plus className="h-3 w-3 mr-1" /> New Return Case
                    </Button>
                  </div>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Type</TableHead><TableHead>Condition</TableHead>
                        <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Refund</TableHead>
                        <TableHead className="text-right">Cost Loss</TableHead><TableHead>Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.returns.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No return cases <RotateCcw className="inline h-3 w-3 ml-1" /></TableCell></TableRow>}
                        {r.returns.map((x) => (
                          <TableRow key={x.id}>
                            <TableCell className="whitespace-nowrap text-xs">{x.created_at?.slice(0, 10)}</TableCell>
                            <TableCell className="font-mono text-xs">{x.order_id.slice(0, 8)}</TableCell>
                            <TableCell><Badge variant="outline">{x.return_type}</Badge></TableCell>
                            <TableCell className="capitalize">{x.condition}</TableCell>
                            <TableCell className="text-right">{x.qty}</TableCell>
                            <TableCell className="text-right">{fmtBdt(x.refund)}</TableCell>
                            <TableCell className="text-right text-red-600">{fmtBdt(x.cost_loss)}</TableCell>
                            <TableCell><Badge>{x.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="exchanges" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={() => setExchangeOpen(true)} disabled={!brandId || !productId}>
                      <Plus className="h-3 w-3 mr-1" /> New Exchange Case
                    </Button>
                  </div>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Original Order</TableHead><TableHead>Type</TableHead><TableHead>Old Condition</TableHead>
                        <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Net Loss</TableHead><TableHead>Status</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.exchanges.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No exchange cases</TableCell></TableRow>}
                        {r.exchanges.map((x) => (
                          <TableRow key={x.id}>
                            <TableCell className="whitespace-nowrap text-xs">{x.created_at?.slice(0, 10)}</TableCell>
                            <TableCell className="font-mono text-xs">{x.original_order_id.slice(0, 8)}</TableCell>
                            <TableCell><Badge variant="outline">{x.exchange_type}</Badge></TableCell>
                            <TableCell className="capitalize">{x.old_condition}</TableCell>
                            <TableCell className="text-right">{x.qty}</TableCell>
                            <TableCell className="text-right text-red-600">{fmtBdt(x.loss)}</TableCell>
                            <TableCell><Badge>{x.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="marketing" className="mt-3">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={() => setAllocOpen(true)} disabled={!brandId || !productId}>
                      <Plus className="h-3 w-3 mr-1" /> Allocate Expense
                    </Button>
                  </div>
                  <div className="rounded border overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Note</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {r.marketing.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No marketing allocations <Megaphone className="inline h-3 w-3 ml-1" /></TableCell></TableRow>}
                        {r.marketing.map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-nowrap text-xs">{m.created_at?.slice(0, 10)}</TableCell>
                            <TableCell><Badge variant="outline">{m.expense_type}</Badge></TableCell>
                            <TableCell className="text-right">{fmtBdt(m.amount)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{m.note ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
      {brandId && productId && r && (
        <>
          <ReturnCaseDialog open={returnOpen} onClose={() => setReturnOpen(false)} brandId={brandId} productId={productId} productName={r.product.name} />
          <ExchangeCaseDialog open={exchangeOpen} onClose={() => setExchangeOpen(false)} brandId={brandId} productId={productId} productName={r.product.name} />
          <ProductExpenseAllocationDialog open={allocOpen} onClose={() => setAllocOpen(false)} brandId={brandId} productId={productId} productName={r.product.name} />
        </>
      )}
    </div>
  );
}

function KpiCard({ title, value, hint, tone, bold }: { title: string; value: number; hint?: string; tone: "emerald" | "blue" | "red" | "amber"; bold?: boolean }) {
  const toneClass = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    red: "text-red-600",
    amber: "text-amber-600",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={cn("text-2xl mt-1 tabular-nums", toneClass, bold ? "font-bold" : "font-semibold")}>{fmtBdt(value)}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function SmallStat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Package }) {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center"><Icon className="h-4 w-4 text-muted-foreground" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-1 border-b last:border-0", bold && "font-semibold pt-2")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", v < 0 && "text-red-600")}>{fmtBdt(v)}</span>
    </div>
  );
}