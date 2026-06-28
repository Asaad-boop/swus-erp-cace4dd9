import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, CheckCircle2, PackageCheck, Search, CalendarDays, ExternalLink, RefreshCw, Wallet, AlertCircle, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { customerName, customerPhone, invoiceDisplay } from "@/lib/erp/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/orders/pre-orders")({
  head: () => ({ meta: [{ title: "Pre-orders — ERP" }] }),
  component: PreOrdersPage,
});

const fmtBDT = (n: number) => `৳${Math.round(n || 0).toLocaleString()}`;
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type PreOrderRow = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  status: string;
  total: number;
  advance_amount: number | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  brand_id: string | null;
  preorder_expected_date: string | null;
  preorder_ready_at: string | null;
  preorder_converted_at: string | null;
  source: string | null;
  items: { id: string; name: string | null; image: string | null; quantity: number; line_total: number | null }[];
};

function PreOrdersPage() {
  const qc = useQueryClient();
  const { activeBrand, brandIds, isAllBrands } = useBrand();
  const scopeIds = isAllBrands ? brandIds : activeBrand ? [activeBrand.id] : [];

  const [tab, setTab] = useState<"open" | "ready" | "converted" | "products">("open");
  const [search, setSearch] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["pre-orders", scopeIds, tab, search],
    enabled: scopeIds.length > 0 && tab !== "products",
    queryFn: async () => {
      let q = applyBrandScope(
        supabase
          .from("orders")
          .select(
            "id,invoice_no,created_at,status,total,advance_amount,shipping_name,shipping_phone,guest_name,guest_phone,brand_id,preorder_expected_date,preorder_ready_at,preorder_converted_at,source,items:order_items(id,name,image,quantity,line_total)",
          ),
        scopeIds,
      )
        .eq("is_preorder", true)
        .order("created_at", { ascending: false })
        .limit(500);

      if (tab === "open") {
        q = q.is("preorder_converted_at", null).is("preorder_ready_at", null);
      } else if (tab === "ready") {
        q = q.not("preorder_ready_at", "is", null).is("preorder_converted_at", null);
      } else if (tab === "converted") {
        q = q.not("preorder_converted_at", "is", null);
      }
      if (search.trim()) {
        const s = search.trim();
        q = q.or(
          `shipping_name.ilike.%${s}%,shipping_phone.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,invoice_no.ilike.%${s}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PreOrderRow[];
    },
  });

  const countsQuery = useQuery({
    queryKey: ["pre-orders-counts", scopeIds],
    enabled: scopeIds.length > 0,
    queryFn: async () => {
      const base = () => applyBrandScope(
        supabase.from("orders").select("id,total,advance_amount,preorder_ready_at,preorder_converted_at", { count: "exact", head: false }),
        scopeIds,
      ).eq("is_preorder", true).limit(5000);
      const { data, error } = await base();
      if (error) throw error;
      let open = 0, ready = 0, converted = 0, advance = 0, value = 0;
      for (const r of (data ?? []) as PreOrderRow[]) {
        value += Number(r.total) || 0;
        advance += Number(r.advance_amount) || 0;
        if (r.preorder_converted_at) converted++;
        else if (r.preorder_ready_at) ready++;
        else open++;
      }
      return { open, ready, converted, advance, value };
    },
  });

  const markReady = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("orders")
        .update({ preorder_ready_at: new Date().toISOString() } as never)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked ready for fulfillment");
      qc.invalidateQueries({ queryKey: ["pre-orders"] });
      qc.invalidateQueries({ queryKey: ["pre-orders-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orders")
        .update({
          is_preorder: false,
          preorder_converted_at: new Date().toISOString(),
          status: "confirmed",
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Converted to regular order — now in Order List");
      qc.invalidateQueries({ queryKey: ["pre-orders"] });
      qc.invalidateQueries({ queryKey: ["pre-orders-counts"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = countsQuery.data ?? { open: 0, ready: 0, converted: 0, advance: 0, value: 0 };
  const rows = ordersQuery.data ?? [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5" /> Pre-orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reserve stock-out or upcoming products. Convert to regular orders when ready.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { ordersQuery.refetch(); countsQuery.refetch(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Open" value={counts.open} icon={<Clock className="h-4 w-4" />} tone="blue" />
        <Kpi label="Ready" value={counts.ready} icon={<PackageCheck className="h-4 w-4" />} tone="amber" />
        <Kpi label="Converted" value={counts.converted} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
        <Kpi label="Advance Collected" value={fmtBDT(counts.advance)} icon={<Wallet className="h-4 w-4" />} tone="violet" />
        <Kpi label="Pipeline Value" value={fmtBDT(counts.value)} icon={<Package className="h-4 w-4" />} tone="neutral" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="open">Open <span className="ml-2 text-xs opacity-60">{counts.open}</span></TabsTrigger>
            <TabsTrigger value="ready">Ready <span className="ml-2 text-xs opacity-60">{counts.ready}</span></TabsTrigger>
            <TabsTrigger value="converted">Converted <span className="ml-2 text-xs opacity-60">{counts.converted}</span></TabsTrigger>
            <TabsTrigger value="products">Pre-order Products</TabsTrigger>
          </TabsList>
          {tab !== "products" && (
            <div className="relative w-72 max-w-full">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, phone, invoice…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          )}
        </div>

        <TabsContent value={tab} className="mt-4">
          {tab === "products" ? (
            <PreorderProductsPanel scopeIds={scopeIds} />
          ) : ordersQuery.isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-14 border rounded-xl bg-card">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <div className="text-sm text-muted-foreground">No {tab} pre-orders</div>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((o) => (
                <PreOrderCard
                  key={o.id}
                  o={o}
                  onReady={() => markReady.mutate([o.id])}
                  onConvert={() => convertOrder.mutate(o.id)}
                  busy={markReady.isPending || convertOrder.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: "blue" | "amber" | "emerald" | "violet" | "neutral" }) {
  const toneCls: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    neutral: "text-foreground/80 bg-muted",
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{label}</span>
        <span className={cn("h-7 w-7 rounded-md grid place-items-center", toneCls[tone])}>{icon}</span>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function PreOrderCard({ o, onReady, onConvert, busy }: { o: PreOrderRow; onReady: () => void; onConvert: () => void; busy: boolean }) {
  const name = customerName(o);
  const phone = customerPhone(o);
  const advance = Number(o.advance_amount) || 0;
  const due = Math.max(0, (Number(o.total) || 0) - advance);
  const isReady = !!o.preorder_ready_at && !o.preorder_converted_at;
  const isConverted = !!o.preorder_converted_at;
  const overdue = o.preorder_expected_date && new Date(o.preorder_expected_date) < new Date() && !isConverted;

  return (
    <div className="rounded-xl border bg-card hover:border-foreground/20 transition-colors">
      <div className="p-4 flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/erp/orders/$orderId"
              params={{ orderId: o.id }}
              className="font-semibold text-sm hover:underline inline-flex items-center gap-1"
            >
              {invoiceDisplay(o)} <ExternalLink className="h-3 w-3 opacity-60" />
            </Link>
            {isConverted ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Converted</Badge>
            ) : isReady ? (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">Ready</Badge>
            ) : (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">Open</Badge>
            )}
            {overdue && (
              <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30">
                <AlertCircle className="h-3 w-3 mr-1" /> Overdue
              </Badge>
            )}
          </div>
          <div className="mt-1.5 text-sm">
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground"> · {phone || "—"}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            <span>Placed {fmtDate(o.created_at)}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> ETA {fmtDate(o.preorder_expected_date)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(o.items ?? []).slice(0, 4).map((it) => (
            <div key={it.id} className="flex items-center gap-2 rounded-md border bg-muted/30 pl-1 pr-2 py-1">
              {it.image ? (
                <img src={it.image} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <div className="h-8 w-8 rounded bg-muted grid place-items-center"><Package className="h-3.5 w-3.5 opacity-50" /></div>
              )}
              <div className="text-[11px] leading-tight max-w-[140px]">
                <div className="font-medium truncate">{it.name ?? "—"}</div>
                <div className="text-muted-foreground">×{it.quantity}</div>
              </div>
            </div>
          ))}
          {(o.items?.length ?? 0) > 4 && (
            <span className="text-xs text-muted-foreground">+{(o.items!.length - 4)} more</span>
          )}
        </div>

        <div className="text-right min-w-[140px]">
          <div className="text-base font-semibold tabular-nums">{fmtBDT(Number(o.total))}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            Advance {fmtBDT(advance)} · Due {fmtBDT(due)}
          </div>
          <div className="mt-2 flex gap-1.5 justify-end">
            {!isReady && !isConverted && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onReady}>
                <PackageCheck className="h-3.5 w-3.5 mr-1" /> Mark Ready
              </Button>
            )}
            {!isConverted && (
              <Button size="sm" disabled={busy} onClick={onConvert}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Convert
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----- Pre-order Products panel ----- */

type ProductRow = {
  id: string;
  title: string;
  image: string | null;
  sku: string | null;
  stock: number;
  is_preorder: boolean;
  preorder_expected_date: string | null;
  preorder_note: string | null;
  brand_id: string | null;
};

function PreorderProductsPanel({ scopeIds }: { scopeIds: string[] }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [onlyPreorder, setOnlyPreorder] = useState(true);

  const productsQuery = useQuery({
    queryKey: ["preorder-products", scopeIds, q, onlyPreorder],
    enabled: scopeIds.length > 0,
    queryFn: async () => {
      let qb = applyBrandScope(
        supabase
          .from("products")
          .select("id,title,image,sku,stock,is_preorder,preorder_expected_date,preorder_note,brand_id"),
        scopeIds,
      ).order("is_preorder", { ascending: false }).order("title").limit(300);
      if (onlyPreorder) qb = qb.eq("is_preorder", true);
      if (q.trim()) qb = qb.or(`title.ilike.%${q.trim()}%,sku.ilike.%${q.trim()}%`);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const updateProduct = useMutation({
    mutationFn: async (input: Partial<ProductRow> & { id: string }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("products").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preorder-products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = productsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-72 max-w-full">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search product / SKU" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <Switch checked={onlyPreorder} onCheckedChange={setOnlyPreorder} />
          <span>Only pre-order products</span>
        </label>
        <span className="text-xs text-muted-foreground ml-auto">
          Turning on the toggle auto-tags every new order for this product as a pre-order.
        </span>
      </div>

      {productsQuery.isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 border rounded-xl bg-card text-sm text-muted-foreground">
          No products match.
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {rows.map((p) => (
            <div key={p.id} className="p-3 flex items-center gap-3 flex-wrap">
              {p.image ? (
                <img src={p.image} className="h-12 w-12 rounded object-cover" alt="" />
              ) : (
                <div className="h-12 w-12 rounded bg-muted grid place-items-center"><Package className="h-4 w-4 opacity-50" /></div>
              )}
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium text-sm">{p.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  SKU {p.sku || "—"} · Stock <span className={cn("tabular-nums", p.stock <= 0 ? "text-red-500" : "")}>{p.stock}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">ETA</span>
                <Input
                  type="date"
                  value={p.preorder_expected_date ?? ""}
                  onChange={(e) => updateProduct.mutate({ id: p.id, preorder_expected_date: e.target.value || null })}
                  className="h-8 w-[150px]"
                />
              </div>
              <label className="inline-flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Pre-order</span>
                <Switch
                  checked={p.is_preorder}
                  onCheckedChange={(v) => updateProduct.mutate({ id: p.id, is_preorder: v })}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}