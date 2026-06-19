import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Printer, Truck, Loader2, Phone, MessageCircle, Plus, Minus, Trash2,
  Search, Star, Tag as TagIcon, XCircle, Smartphone, Save, Undo2, CheckCircle2, Sparkles,
  ChevronLeft, ChevronRight, RotateCcw, Repeat,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { pathaoCitiesFn, pathaoZonesFn, pathaoAreasFn, pathaoDetectAddressFn } from "@/lib/erp/pathao.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useOrderDetail } from "@/hooks/erp/use-orders-query";
import { customerName, customerPhone, invoiceDisplay, statusBadge, type OrderStatus } from "@/lib/erp/orders";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { BookPathaoDialog } from "@/components/erp/courier/book-pathao-dialog";
import { BookSteadfastDialog } from "@/components/erp/courier/book-steadfast-dialog";
import {
  OrderTimeline, ShipmentPanel, CustomerHistoryPanel, AttributionPanel,
  ReturnDialog, ExchangeDialog, useOrderNeighbors,
} from "@/components/erp/orders/order-detail-extras";
import { useCurrentRole } from "@/hooks/use-current-role";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/orders/$orderId")({
  head: () => ({ meta: [{ title: "Web Order Details — ERP" }] }),
  component: OrderDetailsPage,
});

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizePhone(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("880")) return "0" + digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return "0" + digits;
  return digits;
}

function bdtCompact(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);
}

/* -------------------------------------------------------------------------- */
/*  Stats strip — donut design (ours) + RedX + Fraud Note                      */
/* -------------------------------------------------------------------------- */

type StatCell = { total: number; success: number; cancel: number };

const STAT_COLUMNS = [
  { key: "ourRecord", label: "Our Record", dot: "bg-indigo-500", bar: "bg-indigo-500", tint: "from-indigo-500/[0.07]" },
  { key: "overall",   label: "Overall",    dot: "bg-sky-500",    bar: "bg-sky-500",    tint: "from-sky-500/[0.07]" },
  { key: "pathao",    label: "Pathao",     dot: "bg-rose-500",   bar: "bg-rose-500",   tint: "from-rose-500/[0.07]" },
  { key: "steadfast", label: "Steadfast",  dot: "bg-amber-500",  bar: "bg-amber-500",  tint: "from-amber-500/[0.07]" },
] as const;

function StatsStrip({
  stats,
  customerName: cname,
  fraudNote,
  onRefresh,
  refreshing,
  loading,
}: {
  stats: Record<string, StatCell>;
  customerName: string;
  fraudNote: string;
  onRefresh: () => void;
  refreshing: boolean;
  loading?: boolean;
}) {
  // Hide cards without data: Our Record/RedX/Steadfast/Pathao hide if total===0.
  // Overall always shown when any provider has data.
  void cname; void onRefresh; void refreshing;
  const visibleColumns = STAT_COLUMNS.filter((c) => {
    const s = stats[c.key];
    if (!s) return false;
    if (c.key === "overall") {
      return (stats.pathao?.total ?? 0) + (stats.steadfast?.total ?? 0) > 0;
    }
    return s.total > 0;
  });
  const showFraud = !!fraudNote.trim();
  const cardCount = visibleColumns.length + (showFraud ? 1 : 0);
  // While courier history is loading on first paint, show skeleton placeholders
  // so the strip does not flicker in/out on page reload.
  if (loading && cardCount === 0) {
    return (
      <div className="rounded-2xl border bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-2 sm:grid-cols-2 divide-x divide-y sm:divide-y-0 divide-border/60">
          {[0, 1].map((i) => (
            <div key={i} className="px-4 py-4 space-y-3">
              <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted/60 animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-3 w-16 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
                  <div className="h-3 w-14 rounded bg-muted/60 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (cardCount === 0) return null;
  const gridCols = cardCount >= 4 ? "sm:grid-cols-4"
    : cardCount === 3 ? "sm:grid-cols-3"
    : cardCount === 2 ? "sm:grid-cols-2"
    : "sm:grid-cols-1";
  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
      <div className={cn("grid grid-cols-2 divide-x divide-y sm:divide-y-0 divide-border/60", gridCols)}>
        {visibleColumns.map((c) => {
          const s = stats[c.key]!;
          const denom = s.success + s.cancel;
          const successPct = denom > 0 ? Math.round((s.success / denom) * 100) : 0;
          const isEmpty = s.total === 0;
          const tone = isEmpty
            ? { text: "text-muted-foreground/60", ring: "stroke-muted-foreground/30", chip: "bg-muted/40 text-muted-foreground ring-border", glow: "" }
            : successPct >= 80
              ? { text: "text-emerald-600 dark:text-emerald-400", ring: "stroke-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", glow: "shadow-[0_0_16px_-2px_rgba(16,185,129,0.4)]" }
              : successPct >= 50
                ? { text: "text-amber-600 dark:text-amber-400", ring: "stroke-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30", glow: "shadow-[0_0_16px_-2px_rgba(245,158,11,0.4)]" }
                : { text: "text-rose-600 dark:text-rose-400", ring: "stroke-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30", glow: "shadow-[0_0_16px_-2px_rgba(244,63,94,0.4)]" };
          const R = 15;
          const C = 2 * Math.PI * R;
          const offset = denom === 0 ? C : C * (1 - successPct / 100);
          return (
            <div key={c.key} className="group relative px-4 py-4 transition-colors hover:bg-muted/30">
              <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-60", c.tint)} />
              <div className="relative space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground truncate">{c.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={cn("relative shrink-0 rounded-full", tone.glow)}>
                    <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                      <circle cx="18" cy="18" r={R} className="fill-none stroke-muted/50" strokeWidth="2.5" />
                      <circle cx="18" cy="18" r={R}
                        className={cn("fill-none transition-all duration-700 ease-out", tone.ring)}
                        strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={cn("text-[11px] font-bold tabular-nums tracking-tight", tone.text)}>
                        {denom === 0 ? "—" : `${successPct}%`}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs tabular-nums leading-tight space-y-1">
                    <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset", tone.chip)}>
                      {denom === 0 ? "no data" : `${successPct}% success`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Order</span>
                      <span className="font-semibold text-foreground">{s.success}<span className="text-muted-foreground/50">/{denom || s.total}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Cancel</span>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">{s.cancel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {showFraud && (
          <div className="group relative px-4 py-4">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-fuchsia-500/[0.07] to-transparent opacity-60" />
            <div className="relative space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground truncate">Fraud Note</span>
              </div>
              <p className="text-[11px] leading-snug text-foreground/80 line-clamp-5 whitespace-pre-wrap">{fraudNote}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Field shell                                                                */
/* -------------------------------------------------------------------------- */

function FieldShell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Click to Add Products panel                                                */
/* -------------------------------------------------------------------------- */

type ProductLite = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  stock: number;
  is_featured: boolean | null;
};

function ProductSearchPanel({
  brandId, onAdd,
}: { brandId: string | null; onAdd: (p: ProductLite) => void }) {
  const [codeQ, setCodeQ] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [debounced, setDebounced] = useState({ code: "", name: "" });

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ code: codeQ.trim(), name: nameQ.trim() }), 300);
    return () => clearTimeout(t);
  }, [codeQ, nameQ]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["erp-product-search", brandId, debounced],
    enabled: !!brandId,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id,title,price,image,stock,is_featured,slug")
        .eq("brand_id", brandId!)
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (debounced.name) q = q.ilike("title", `%${debounced.name}%`);
      if (debounced.code) q = q.or(`slug.ilike.%${debounced.code}%,id.eq.${debounced.code}`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (ProductLite & { slug: string })[];
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Code/sku">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={codeQ} onChange={(e) => setCodeQ(e.target.value)} placeholder="Type to Search…" className="h-8 pl-7 text-xs" />
          </div>
        </FieldShell>
        <FieldShell label="Name">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="Type to Search…" className="h-8 pl-7 text-xs" />
          </div>
        </FieldShell>
      </div>
      <div className="max-h-[360px] overflow-y-auto -mx-2">
        {isFetching && (results ?? []).length === 0 && (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        )}
        {!isFetching && (results ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No products found</p>
        )}
        <ul className="divide-y">
          {(results ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-2 py-2 hover:bg-muted/40 transition-colors">
              <div className="h-10 w-10 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                {p.image
                  ? <img src={p.image} alt="" className="h-full w-full object-cover" />
                  : <span className="text-[8px] text-muted-foreground">No Image</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate flex items-center gap-1">
                  {p.is_featured && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                  {p.title}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">SKU: {p.slug?.slice(0, 24) ?? p.id.slice(0, 8)}</div>
                <div className="flex items-center gap-2 text-[10px] mt-0.5">
                  <span className="text-rose-600">Price: ৳{bdtCompact(Number(p.price))}</span>
                  <span className={cn("text-muted-foreground", p.stock <= 0 && "text-rose-600")}>Stock: {p.stock}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2"
                disabled={p.stock <= 0}
                onClick={() => onAdd({ id: p.id, title: p.title, price: Number(p.price), image: p.image, stock: p.stock, is_featured: p.is_featured })}>
                <Plus className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

type WebStatus =
  | "processing" | "incomplete" | "good_but_no_response" | "no_response"
  | "advance_payment" | "on_hold" | "complete" | "cancelled";

const WEB_STATUSES: { key: WebStatus; label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "incomplete", label: "Incomplete" },
  { key: "good_but_no_response", label: "Good But No Response" },
  { key: "no_response", label: "No Response" },
  { key: "advance_payment", label: "Advance Payment" },
  { key: "on_hold", label: "On Hold" },
  { key: "complete", label: "Complete" },
  { key: "cancelled", label: "Cancel" },
];

function OrderDetailsPage() {
  const { orderId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useOrderDetail(orderId);

  const order = data?.order;
  const items = data?.items ?? [];
  const notes = data?.notes ?? [];
  const phone = order ? normalizePhone(customerPhone(order)) : "";

  /* ------------------------------ Local form state ------------------------- */

  const [form, setForm] = useState({
    mobile: "", name: "", delivery_method: "", address: "", shipping_note: "",
    city_id: "", zone_id: "", area_id: "",
    source_platform: "", is_preorder: false, is_cross_sale: false,
    discount: 0, advance: 0, shipping_fee: 0,
    advance_source: "", advance_payment_number: "", advance_txn_id: "",
    note_input: "", tag_input: "",
  });
  const [baseline, setBaseline] = useState<typeof form | null>(null);

  useEffect(() => {
    if (!order) return;
    setForm((f) => {
      const next = {
        ...f,
        mobile: phone,
        name: customerName(order),
        delivery_method: order.delivery_method ?? "",
        address: order.shipping_address ?? "",
        shipping_note: order.shipping_note ?? "",
        city_id: order.pathao_city_id != null ? String(order.pathao_city_id) : "",
        zone_id: order.pathao_zone_id != null ? String(order.pathao_zone_id) : "",
        area_id: order.pathao_area_id != null ? String(order.pathao_area_id) : "",
        source_platform: order.source_platform ?? order.source_website ?? "Website",
        is_preorder: !!order.is_preorder,
        is_cross_sale: !!order.is_cross_sale,
        discount: Number(order.discount_amount ?? 0),
        advance: Number(order.advance_amount ?? 0),
        shipping_fee: Number(order.shipping_fee ?? 0),
        advance_source: order.advance_source ?? "",
        advance_payment_number: order.advance_payment_number ?? "",
        advance_txn_id: order.advance_txn_id ?? "",
      };
      setBaseline(next);
      return next;
    });
    setDraftWebStatus((order.web_status as WebStatus) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  /* ------------------------------ Pathao geo cascades ---------------------- */

  const fetchCities = useServerFn(pathaoCitiesFn);
  const fetchZones = useServerFn(pathaoZonesFn);
  const fetchAreas = useServerFn(pathaoAreasFn);
  const detectAddress = useServerFn(pathaoDetectAddressFn);

  const { data: cities } = useQuery({
    queryKey: ["pathao-cities", order?.brand_id],
    enabled: !!order,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await fetchCities({ data: order?.brand_id ? { brandId: order.brand_id } : {} });
      return ((r as { items: { city_id: number; city_name: string }[] }).items ?? []).map((c) => ({
        id: String(c.city_id),
        name_en: c.city_name,
      }));
    },
  });
  const { data: zones } = useQuery({
    queryKey: ["pathao-zones", form.city_id, order?.brand_id],
    enabled: !!form.city_id,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await fetchZones({ data: { cityId: Number(form.city_id), brandId: order?.brand_id ?? undefined } });
      return ((r as { items: { zone_id: number; zone_name: string }[] }).items ?? []).map((z) => ({
        id: String(z.zone_id),
        name_en: z.zone_name,
      }));
    },
  });
  const { data: areas } = useQuery({
    queryKey: ["pathao-areas", form.zone_id, order?.brand_id],
    enabled: !!form.zone_id,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const r = await fetchAreas({ data: { zoneId: Number(form.zone_id), brandId: order?.brand_id ?? undefined } });
      return ((r as { items: { area_id: number; area_name: string }[] }).items ?? []).map((a) => ({
        id: String(a.area_id),
        name_en: a.area_name,
      }));
    },
  });

  const detectLocation = useMutation({
    mutationFn: async () => {
      if (!form.address || form.address.trim().length < 3) {
        throw new Error("Address is too short to detect");
      }
      const r = (await detectAddress({
        data: { address: form.address.trim(), brandId: order?.brand_id ?? undefined },
      })) as {
        city: { id: number; name: string } | null;
        zone: { id: number; name: string } | null;
        area: { id: number; name: string } | null;
      };
      return r;
    },
    onSuccess: (r) => {
      setForm((f) => ({
        ...f,
        city_id: r.city ? String(r.city.id) : "",
        zone_id: r.zone ? String(r.zone.id) : "",
        area_id: r.area ? String(r.area.id) : "",
      }));
      if (!r.city) toast.error("Could not detect city from address");
      else if (!r.zone) toast.warning(`Found city ${r.city.name} — please pick zone manually`);
      else if (!r.area) toast.success(`Detected ${r.city.name} → ${r.zone.name}. Pick area if needed.`);
      else toast.success(`Detected ${r.city.name} → ${r.zone.name} → ${r.area.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ------------------------------ Courier history -------------------------- */

  const { data: ourRecord } = useQuery({
    queryKey: ["customer-our-record", order?.brand_id, phone, orderId],
    enabled: !!order?.brand_id && !!phone,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,web_status,shipping_phone,guest_phone")
        .eq("brand_id", order!.brand_id!)
        .or(`shipping_phone.eq.${phone},guest_phone.eq.${phone}`)
        .neq("id", orderId)
        .limit(2000);
      if (error) throw error;
      let total = 0, success = 0, cancel = 0;
      (data ?? []).forEach((o) => {
        total++;
        const s = (o.status ?? "") + " " + (o.web_status ?? "");
        if (/deliver|complete/i.test(s)) success++;
        else if (/cancel|fake|return/i.test(s)) cancel++;
      });
      return { total, success, cancel };
    },
  });

  const fetchCourierHistory = useServerFn(fetchCourierHistoryFn);
  const [refreshing, setRefreshing] = useState(false);

  // FAST PATH: read the DB-cached row directly so cards appear instantly on reload
  const { data: cachedCourierHistory } = useQuery({
    queryKey: ["courier-history-cache", phone],
    enabled: !!phone && phone.length >= 11,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_history_cache")
        .select("data")
        .eq("phone", phone)
        .maybeSingle();
      const hist = data?.data as { providers?: Array<{ name: string; total: number; success: number; cancelled: number; ok: boolean; error?: string }> } | null;
      if (!hist) return null;
      const pathao = hist.providers?.find((p) => p.name === "pathao");
      const steadfast = hist.providers?.find((p) => p.name === "steadfast");
      return {
        pathao: { total: pathao?.total ?? 0, success: pathao?.success ?? 0, cancel: pathao?.cancelled ?? 0 },
        steadfast: { total: steadfast?.total ?? 0, success: steadfast?.success ?? 0, cancel: steadfast?.cancelled ?? 0 },
        steadfastError: steadfast?.ok ? "" : steadfast?.error ?? "",
      };
    },
  });

  // SLOW PATH: hits external couriers if cache stale; runs in background
  const { data: freshCourierHistory, refetch: refetchHistory, isFetching: courierFetching } = useQuery({
    queryKey: ["courier-history", order?.brand_id, phone],
    enabled: !!order?.brand_id && !!phone && phone.length >= 11,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { results } = await fetchCourierHistory({ data: { phones: [phone], brandId: order!.brand_id! } });
      const r = results[phone];
      const pathao = r?.providers.find((p) => p.name === "pathao");
      const steadfast = r?.providers.find((p) => p.name === "steadfast");
      return {
        pathao: { total: pathao?.total ?? 0, success: pathao?.success ?? 0, cancel: pathao?.cancelled ?? 0 },
        steadfast: { total: steadfast?.total ?? 0, success: steadfast?.success ?? 0, cancel: steadfast?.cancelled ?? 0 },
        steadfastError: steadfast?.ok ? "" : steadfast?.error ?? "",
      };
    },
  });
  // Prefer fresh data when available; fall back to cached for instant render
  const courierHistory = freshCourierHistory ?? cachedCourierHistory;
  const courierLoading = !cachedCourierHistory && !freshCourierHistory && courierFetching;

  const stats = useMemo<Record<string, StatCell>>(() => {
    const our = ourRecord ?? { total: 0, success: 0, cancel: 0 };
    const pathao = courierHistory?.pathao ?? { total: 0, success: 0, cancel: 0 };
    const steadfast = courierHistory?.steadfast ?? { total: 0, success: 0, cancel: 0 };
    const redx = { total: 0, success: 0, cancel: 0 };
    const overall = {
      total: pathao.total + steadfast.total + redx.total,
      success: pathao.success + steadfast.success + redx.success,
      cancel: pathao.cancel + steadfast.cancel + redx.cancel,
    };
    return { ourRecord: our, overall, pathao, redx, steadfast };
  }, [ourRecord, courierHistory]);

  /* ------------------------------ Item arithmetic -------------------------- */

  const itemsSubtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.line_total ?? Number(it.unit_price ?? it.price) * it.quantity), 0),
    [items],
  );
  const grandTotal = Math.max(0, itemsSubtotal + Number(form.shipping_fee) - Number(form.discount) - Number(form.advance));

  /* ------------------------------ Mutations -------------------------------- */

  const invalidate = () => qc.invalidateQueries({ queryKey: ["order-detail", orderId] });

  const getAdvanceValidationError = () => {
    if (Number(form.advance) <= 0) return null;
    if (!form.advance_source) return "Select advance payment source";
    if (!form.advance_payment_number || form.advance_payment_number.length < 4) return "Enter payment number or last 4 digits";
    return null;
  };

  const updateStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase.rpc("transition_order_status", { _order_id: orderId, _new_status: status });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["orders"] }); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmOrder = useMutation({
    mutationFn: async () => {
      const advanceError = getAdvanceValidationError();
      if (advanceError) throw new Error(advanceError);
      // 1) Persist any pending customer + pricing edits first
      const subtotal = itemsSubtotal;
      const total = Math.max(0, subtotal + Number(form.shipping_fee) - Number(form.discount) - Number(form.advance));
      const basePayload = {
        shipping_phone: form.mobile,
        shipping_name: form.name,
        delivery_method: form.delivery_method || null,
        shipping_address: form.address,
        shipping_note: form.shipping_note,
        pathao_city_id: form.city_id ? Number(form.city_id) : null,
        pathao_city_name: cities?.find((c) => c.id === form.city_id)?.name_en ?? null,
        pathao_zone_id: form.zone_id ? Number(form.zone_id) : null,
        pathao_zone_name: zones?.find((z) => z.id === form.zone_id)?.name_en ?? null,
        pathao_area_id: form.area_id ? Number(form.area_id) : null,
        pathao_area_name: areas?.find((a) => a.id === form.area_id)?.name_en ?? null,
        shipping_city: cities?.find((c) => c.id === form.city_id)?.name_en ?? order?.shipping_city ?? null,
        shipping_thana: zones?.find((z) => z.id === form.zone_id)?.name_en ?? order?.shipping_thana ?? null,
        source_platform: form.source_platform,
        is_preorder: form.is_preorder,
        is_cross_sale: form.is_cross_sale,
        subtotal,
        shipping_fee: Number(form.shipping_fee),
        discount_amount: Number(form.discount),
        advance_amount: Number(form.advance),
        advance_source: Number(form.advance) > 0 ? form.advance_source : null,
        advance_payment_number: Number(form.advance) > 0 ? form.advance_payment_number : null,
        advance_txn_id: Number(form.advance) > 0 && form.advance_txn_id ? form.advance_txn_id : null,
        total,
        web_status: "complete" as const,
      };
      const updatePayload = order?.is_guest_order
        ? { ...basePayload, guest_name: form.name, guest_phone: form.mobile }
        : basePayload;
      const { error: upErr } = await supabase.from("orders").update(updatePayload).eq("id", orderId);
      if (upErr) throw upErr;

      // 2) Transition status -> confirmed (reserves stock + sets confirmed_at)
      if (order?.status === "new") {
        const { error: rpcErr } = await supabase.rpc("transition_order_status", {
          _order_id: orderId,
          _new_status: "confirmed" as OrderStatus,
        });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: () => {
      toast.success("Order confirmed");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      invalidate();
      navigate({ to: "/erp/orders/web" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateWebStatus = useMutation({
    mutationFn: async ({ status, extra }: { status: WebStatus; extra?: Partial<{ hold_reason: string; cancellation_reason: string; cancel_reason: string; advance_amount: number }> }) => {
      const { error } = await supabase
        .from("orders")
        .update({ web_status: status, ...(extra ?? {}) })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Marked as ${vars.status.replace(/_/g, " ")}`);
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickWebStatus = (v: WebStatus) => {
    if (v === "on_hold" || v === "cancelled" || v === "advance_payment") {
      setPendingReason("");
      setPendingAdvance("");
      setPendingWebStatus(v);
      return;
    }
    updateWebStatus.mutate({ status: v });
  };

  const submitPendingWebStatus = async () => {
    if (!pendingWebStatus) return;
    if (pendingWebStatus === "on_hold") {
      if (!pendingReason.trim()) { toast.error("Please provide a hold reason"); return; }
      updateWebStatus.mutate({ status: "on_hold", extra: { hold_reason: pendingReason.trim() } });
    } else if (pendingWebStatus === "cancelled") {
      if (!pendingReason.trim()) { toast.error("Please provide a cancellation reason"); return; }
      updateWebStatus.mutate({
        status: "cancelled",
        extra: { cancellation_reason: pendingReason.trim(), cancel_reason: pendingReason.trim() },
      });
    } else if (pendingWebStatus === "advance_payment") {
      const amt = Number(pendingAdvance);
      if (!amt || amt <= 0) { toast.error("Enter a valid advance amount"); return; }
      updateWebStatus.mutate({
        status: "advance_payment",
        extra: { advance_amount: amt },
      });
      const note = pendingReason.trim();
      if (note) {
        try { await supabase.rpc("add_order_note", { _order_id: orderId, _body: `Advance note: ${note}`, _is_internal: true }); } catch { /* non-fatal */ }
      }
      setForm((f) => ({ ...f, advance: amt }));
    }
    setPendingWebStatus(null);
  };

  const saveCustomer = useMutation({
    mutationFn: async () => {
      const payload = {
        shipping_phone: form.mobile,
        shipping_name: form.name,
        delivery_method: form.delivery_method || null,
        shipping_address: form.address,
        shipping_note: form.shipping_note,
        pathao_city_id: form.city_id ? Number(form.city_id) : null,
        pathao_city_name: cities?.find((c) => c.id === form.city_id)?.name_en ?? null,
        pathao_zone_id: form.zone_id ? Number(form.zone_id) : null,
        pathao_zone_name: zones?.find((z) => z.id === form.zone_id)?.name_en ?? null,
        pathao_area_id: form.area_id ? Number(form.area_id) : null,
        pathao_area_name: areas?.find((a) => a.id === form.area_id)?.name_en ?? null,
        shipping_city: cities?.find((c) => c.id === form.city_id)?.name_en ?? order?.shipping_city ?? null,
        shipping_thana: zones?.find((z) => z.id === form.zone_id)?.name_en ?? order?.shipping_thana ?? null,
        source_platform: form.source_platform,
        is_preorder: form.is_preorder,
        is_cross_sale: form.is_cross_sale,
        ...(order?.is_guest_order ? { guest_name: form.name, guest_phone: form.mobile } : {}),
      } as const;
      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer details saved"); setBaseline((b) => b ? { ...b, ...form } : b); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePricing = useMutation({
    mutationFn: async () => {
      const advanceError = getAdvanceValidationError();
      if (advanceError) throw new Error(advanceError);
      const subtotal = itemsSubtotal;
      const total = Math.max(0, subtotal + Number(form.shipping_fee) - Number(form.discount) - Number(form.advance));
      const { error } = await supabase.from("orders").update({
        subtotal, shipping_fee: Number(form.shipping_fee), discount_amount: Number(form.discount),
        advance_amount: Number(form.advance),
        advance_source: Number(form.advance) > 0 ? form.advance_source : null,
        advance_payment_number: Number(form.advance) > 0 ? form.advance_payment_number : null,
        advance_txn_id: Number(form.advance) > 0 && form.advance_txn_id ? form.advance_txn_id : null,
        total,
      }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pricing saved");
      setBaseline((b) => b ? {
        ...b,
        discount: form.discount,
        advance: form.advance,
        shipping_fee: form.shipping_fee,
        advance_source: form.advance_source,
        advance_payment_number: form.advance_payment_number,
        advance_txn_id: form.advance_txn_id,
      } : b);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async (input: { id: string; quantity?: number; unit_price?: number }) => {
      const it = items.find((x) => x.id === input.id); if (!it) return;
      const quantity = input.quantity ?? it.quantity;
      const unit_price = input.unit_price ?? Number(it.unit_price ?? it.price);
      const line_total = quantity * unit_price;
      const { error } = await supabase.from("order_items")
        .update({ quantity, unit_price, price: unit_price, line_total }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: async (p: ProductLite) => {
      const existing = items.find((x) => x.product_id === p.id);
      if (existing) { await updateItem.mutateAsync({ id: existing.id, quantity: existing.quantity + 1 }); return; }
      const unit_price = p.price;
      const { error } = await supabase.from("order_items").insert({
        order_id: orderId, product_id: p.id, name: p.title, image: p.image,
        quantity: 1, price: unit_price, unit_price, line_total: unit_price,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item added"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTags = useMutation({
    mutationFn: async (tags: string[]) => {
      const { error } = await supabase.from("orders").update({ order_tags: tags }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_order_note", { _order_id: orderId, _body: form.note_input, _is_internal: true });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Note added");
      setForm((f) => ({ ...f, note_input: "" }));
      qc.invalidateQueries({ queryKey: ["web-orders"] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ------------------------------ Dialogs ---------------------------------- */

  const [bookOpen, setBookOpen] = useState(false);
  const [bookSteadfastOpen, setBookSteadfastOpen] = useState(false);
  const [pendingWebStatus, setPendingWebStatus] = useState<WebStatus | null>(null);
  const [pendingReason, setPendingReason] = useState("");
  const [pendingAdvance, setPendingAdvance] = useState("");
  const [draftWebStatus, setDraftWebStatus] = useState<WebStatus | "">("");

  if (isLoading || !order) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const tags: string[] = order.order_tags ?? [];
  // Only treat as fraud note when we actually have fraud data — not generic API errors
  const rawFraud = courierHistory?.steadfastError || "";
  const isRealFraud = /fraud|cancel|return/i.test(rawFraud) && rawFraud.length > 0 && !/unauthor|forbidden|not\s*found|invalid|error|failed|timeout/i.test(rawFraud);
  const fraudNote = isRealFraud ? rawFraud : "";

  /* ------------------------------ Render ----------------------------------- */

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4 print:hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/erp/orders/web"><ArrowLeft className="h-4 w-4 mr-1" />Web Order Details</Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-[11px] rounded-lg border bg-card px-3 py-1.5">
            <span className="text-muted-foreground">Created</span>
            <span className="text-emerald-600 font-medium">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
            <span className="h-3 w-px bg-border" />
            <span className="text-muted-foreground">Updated</span>
            <span className="font-medium">{formatDistanceToNow(new Date(order.updated_at ?? order.created_at), { addSuffix: true })}</span>
            <span className="h-3 w-px bg-border" />
            <span className="text-muted-foreground">Status</span>
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", statusBadge(order.status).className)}>{statusBadge(order.status).label}</Badge>
            <span className="h-3 w-px bg-border" />
            <span className="text-muted-foreground">Source</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">{order.source ?? "—"}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Invoice</Button>
          <Button size="sm" variant="outline" onClick={() => setBookOpen(true)}><Truck className="h-3.5 w-3.5 mr-1" />Pathao</Button>
          <Button size="sm" variant="outline" onClick={() => setBookSteadfastOpen(true)}><Truck className="h-3.5 w-3.5 mr-1" />Steadfast</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        {/* MAIN */}
        <div className="space-y-4">
          {/* Stats strip */}
          <StatsStrip
            stats={stats}
            customerName={form.name}
            fraudNote={fraudNote}
            refreshing={refreshing}
            loading={courierLoading || (courierFetching && !courierHistory)}
            onRefresh={async () => { setRefreshing(true); await refetchHistory(); setRefreshing(false); }}
          />

          {/* Customer row */}
          <section className="rounded-xl border bg-card p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FieldShell label="Mobile Number">
                <div className="relative">
                  <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="h-9 pr-16 font-mono" />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                    <a href={`tel:${form.mobile}`} className="p-1 rounded hover:bg-muted text-emerald-600"><Phone className="h-3.5 w-3.5" /></a>
                    <a href={`https://wa.me/${form.mobile.replace(/^0/, "880")}`} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-muted text-emerald-600"><MessageCircle className="h-3.5 w-3.5" /></a>
                  </div>
                </div>
                {stats.ourRecord.total > 0 && (
                  <p className="text-[10px] text-sky-600">Check Our Record above for customer history</p>
                )}
              </FieldShell>
              <FieldShell label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
              </FieldShell>
              <FieldShell label="Delivery Method">
                <Select value={form.delivery_method || ""} onValueChange={(v) => setForm({ ...form, delivery_method: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choose courier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pathao">Pathao</SelectItem>
                    <SelectItem value="steadfast">Steadfast</SelectItem>
                    <SelectItem value="redx">RedX</SelectItem>
                    <SelectItem value="own">Own Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FieldShell label="Address">
                <Textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="resize-none"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    AI will pick the matching Pathao city / zone / area.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1"
                    disabled={detectLocation.isPending || form.address.trim().length < 3}
                    onClick={() => detectLocation.mutate()}
                  >
                    {detectLocation.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Sparkles className="h-3 w-3" />}
                    Detect with AI
                  </Button>
                </div>
              </FieldShell>
              <FieldShell label="Shipping Note">
                <Textarea rows={3} value={form.shipping_note} onChange={(e) => setForm({ ...form, shipping_note: e.target.value })} className="resize-none" />
                <div className="text-[10px] text-right text-muted-foreground">{form.shipping_note.length}/150</div>
              </FieldShell>
              <div className="space-y-3">
                <FieldShell label="Source Platform">
                  <Select value={form.source_platform} onValueChange={(v) => setForm({ ...form, source_platform: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Facebook">Facebook</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                      <SelectItem value="Phone">Phone</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldShell>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-xs">Preorder</span>
                  <Switch checked={form.is_preorder} onCheckedChange={(v) => setForm({ ...form, is_preorder: v })} />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-xs">Cross Sale</span>
                  <Switch checked={form.is_cross_sale} onCheckedChange={(v) => setForm({ ...form, is_cross_sale: v })} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FieldShell label="City">
                <Select value={form.city_id} onValueChange={(v) => setForm({ ...form, city_id: v, zone_id: "", area_id: "" })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>{(cities ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </FieldShell>
              <FieldShell label="Zone">
                <Select value={form.zone_id} onValueChange={(v) => setForm({ ...form, zone_id: v, area_id: "" })} disabled={!form.city_id}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select zone" /></SelectTrigger>
                  <SelectContent>{(zones ?? []).map((z) => <SelectItem key={z.id} value={z.id}>{z.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </FieldShell>
              <FieldShell label="Area">
                <Select value={form.area_id} onValueChange={(v) => setForm({ ...form, area_id: v })} disabled={!form.zone_id}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select an area" /></SelectTrigger>
                  <SelectContent>{(areas ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name_en}</SelectItem>)}</SelectContent>
                </Select>
              </FieldShell>
            </div>
            {(() => {
              const customerKeys = ["mobile","name","delivery_method","address","shipping_note","city_id","zone_id","area_id","source_platform","is_preorder","is_cross_sale"] as const;
              const dirty = !!baseline && customerKeys.some((k) => (form as any)[k] !== (baseline as any)[k]);
              return (
                <div className="flex items-center justify-end gap-2 pt-1 border-t">
                  {dirty && <span className="text-[11px] text-amber-600 mr-auto">Unsaved changes</span>}
                  <Button size="sm" variant="ghost" disabled={!dirty || saveCustomer.isPending}
                    onClick={() => baseline && setForm({ ...form, ...baseline })}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" />Discard
                  </Button>
                  <Button size="sm" disabled={!dirty || saveCustomer.isPending}
                    onClick={() => saveCustomer.mutate()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {saveCustomer.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Save Customer
                  </Button>
                </div>
              );
            })()}
          </section>

          {/* Ordered Products + Add Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-xl border bg-card p-4">
              <header className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Ordered Products <span className="ml-1 text-xs text-muted-foreground">{items.length}</span></h3>
              </header>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No items in this order</p>
              ) : (
                <ul className="divide-y -mx-2">
                  {items.map((it) => {
                    const unit = Number(it.unit_price ?? it.price);
                    const total = Number(it.line_total ?? unit * it.quantity);
                    return (
                      <li key={it.id} className="px-2 py-3">
                        <div className="flex items-start gap-3">
                          <div className="h-12 w-12 rounded-md bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                            {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" /> : <span className="text-[8px] text-muted-foreground">No Image</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono text-muted-foreground">{it.product_id.slice(0, 8)}</div>
                            <div className="text-sm font-medium truncate">{it.name}</div>
                            <div className="text-[10px] text-rose-600">৳{bdtCompact(unit)} <span className="text-muted-foreground">Stock</span></div>
                          </div>
                          <button onClick={() => deleteItem.mutate(it.id)} className="p-1 rounded hover:bg-rose-500/10 text-rose-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <FieldShell label="Qty">
                            <QtyInput value={it.quantity} onChange={(v) => updateItem.mutate({ id: it.id, quantity: v })} />
                          </FieldShell>
                          <FieldShell label="Price">
                            <QtyInput value={unit} onChange={(v) => updateItem.mutate({ id: it.id, unit_price: v })} step={10} />
                          </FieldShell>
                          <FieldShell label="Total">
                            <Input value={bdtCompact(total)} readOnly className="h-8 text-xs bg-muted/40 tabular-nums" />
                          </FieldShell>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="rounded-xl border bg-card p-4">
              <header className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Click To Add Products</h3>
              </header>
              <ProductSearchPanel brandId={order.brand_id ?? null} onAdd={(p) => addItem.mutate(p)} />
            </section>
          </div>

          {/* Totals row */}
          <section className="rounded-xl border bg-card p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <FieldShell label="Discount">
                <NumInput value={form.discount} onChange={(v) => setForm({ ...form, discount: v })} />
              </FieldShell>
              <FieldShell label="Advance">
                <NumInput value={form.advance} onChange={(v) => setForm({ ...form, advance: v })} />
              </FieldShell>
              {Number(form.advance) > 0 && (
                <div className="col-span-2 md:col-span-5 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                  <FieldShell label="Advance Source *">
                    <Select value={form.advance_source} onValueChange={(v) => setForm({ ...form, advance_source: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bKash">bKash</SelectItem>
                        <SelectItem value="Nagad">Nagad</SelectItem>
                        <SelectItem value="Rocket">Rocket</SelectItem>
                        <SelectItem value="Upay">Upay</SelectItem>
                        <SelectItem value="Bank">Bank Transfer</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldShell>
                  <FieldShell label="Payment No / Last 4 *">
                    <Input
                      inputMode="numeric"
                      maxLength={20}
                      value={form.advance_payment_number}
                      onChange={(e) => setForm({ ...form, advance_payment_number: e.target.value.replace(/[^0-9]/g, "") })}
                      placeholder="017... or 5678"
                      className="h-9 tabular-nums"
                    />
                  </FieldShell>
                  <FieldShell label="Transaction ID (optional)">
                    <Input
                      maxLength={50}
                      value={form.advance_txn_id}
                      onChange={(e) => setForm({ ...form, advance_txn_id: e.target.value })}
                      placeholder="Txn ID"
                      className="h-9"
                    />
                  </FieldShell>
                </div>
              )}
              <FieldShell label="Sub Total">
                <Input value={bdtCompact(itemsSubtotal)} readOnly className="h-9 bg-muted/40 tabular-nums" />
              </FieldShell>
              <FieldShell label="Delivery Charge">
                <NumInput value={form.shipping_fee} onChange={(v) => setForm({ ...form, shipping_fee: v })} />
              </FieldShell>
              <FieldShell label="Grand Total">
                <Input value={bdtCompact(grandTotal)} readOnly className="h-9 bg-rose-500/5 border-rose-500/30 text-rose-600 font-bold tabular-nums" />
              </FieldShell>
            </div>
            {order.payment_method?.toLowerCase().includes("cod") && (
              <p className="text-center text-xs text-rose-600 mt-3">The payment method is Cash on Delivery (COD). Please confirm with the customer.</p>
            )}
            {order.status !== "confirmed" && order.web_status !== "complete" ? (
              <Button
                className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
                disabled={confirmOrder.isPending}
                onClick={() => confirmOrder.mutate()}
              >
                {confirmOrder.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirm Order (৳{bdtCompact(grandTotal)}.00)</>}
              </Button>
            ) : (
              <Button
                className="w-full mt-3"
                size="lg"
                variant="outline"
                disabled={savePricing.isPending}
                onClick={() => savePricing.mutate()}
              >
                {savePricing.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save Order (৳${bdtCompact(grandTotal)}.00)`}
              </Button>
            )}
          </section>
        </div>

        {/* RIGHT SIDEBAR */}
        <aside className="space-y-4">
          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Order Summary</h3>
              <span className="text-[10px] font-mono text-muted-foreground">#{invoiceDisplay(order)}</span>
            </header>
            <div className="p-4 space-y-2 text-xs">
              <Row label="Date" value={format(new Date(order.created_at), "dd MMM yyyy, hh:mm a")} />
              <Row label="Status" value={<Badge className={statusBadge(order.status).className}>{statusBadge(order.status).label}</Badge>} />
              <Row label="Payment" value={order.payment_method ?? "—"} />
              <Row label="Source" value={order.source ?? "—"} />
              <div className="h-px bg-border my-2" />
              <Row label="Subtotal" value={`৳${bdtCompact(itemsSubtotal)}`} />
              <Row label="Delivery" value={`৳${bdtCompact(form.shipping_fee)}`} />
              <Row label="Total" value={<span className="font-bold text-foreground">৳{bdtCompact(grandTotal)}</span>} />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">IP:</span></div>
            <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-emerald-600" /><span className="text-muted-foreground">Mobile:</span><span className="font-mono">+88{form.mobile}</span></div>
            <div className="flex items-center gap-2"><Smartphone className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Device:</span><span>Not available</span></div>
          </section>

          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-4 py-2.5 border-b bg-muted/30"><h3 className="text-sm font-semibold">Order Items</h3></header>
            <ul className="p-2 space-y-1.5 max-h-60 overflow-y-auto">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40">
                  <div className="h-9 w-9 rounded bg-muted shrink-0 overflow-hidden">
                    {it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{it.name}</div>
                    <div className="text-[10px] text-muted-foreground">{it.quantity}× ৳{bdtCompact(Number(it.unit_price ?? it.price))}</div>
                  </div>
                </li>
              ))}
              {items.length === 0 && <li className="text-xs text-center text-muted-foreground py-3">No items</li>}
            </ul>
          </section>

          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
              <TagIcon className="h-3.5 w-3.5" /><h3 className="text-sm font-semibold">Order Tags</h3>
            </header>
            <div className="p-4 space-y-2">
              <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
                {tags.map((t) => (
                  <button key={t} onClick={() => updateTags.mutate(tags.filter((x) => x !== t))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20">
                    {t}<XCircle className="h-3 w-3" />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={form.tag_input} onChange={(e) => setForm({ ...form, tag_input: e.target.value })}
                  placeholder="Add tag…" className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && form.tag_input.trim()) {
                      e.preventDefault();
                      updateTags.mutate(Array.from(new Set([...tags, form.tag_input.trim()])));
                      setForm((f) => ({ ...f, tag_input: "" }));
                    }
                  }} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-4 py-2.5 border-b bg-muted/30"><h3 className="text-sm font-semibold">Order Actions</h3></header>
            <div className="p-4 space-y-3">
              <Select
                value={draftWebStatus}
                disabled={updateWebStatus.isPending}
                onValueChange={(v) => setDraftWebStatus(v as WebStatus)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Change status" /></SelectTrigger>
                <SelectContent>
                  {WEB_STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(() => {
                const changed = !!draftWebStatus && draftWebStatus !== (order.web_status ?? "");
                return (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={!changed || updateWebStatus.isPending}
                    onClick={() => draftWebStatus && onPickWebStatus(draftWebStatus as WebStatus)}
                  >
                    {updateWebStatus.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : "Update Status"}
                  </Button>
                );
              })()}
              <Button asChild size="sm" variant="ghost" className="w-full justify-start h-7 text-xs">
                <Link to="/erp/orders/web"><ArrowLeft className="h-3 w-3 mr-1" />Back to List</Link>
              </Button>
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground">Note</label>
                <Textarea rows={2} value={form.note_input} onChange={(e) => setForm({ ...form, note_input: e.target.value })} placeholder="Internal note…" className="text-xs resize-none" />
                <Button size="sm" variant="outline" className="w-full h-7 text-xs" disabled={!form.note_input.trim() || addNote.isPending} onClick={() => addNote.mutate()}>Add Note</Button>
                {notes.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {notes.slice(0, 4).map((n) => (
                      <div key={n.id} className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                        <div className="text-[10px] text-muted-foreground">{format(new Date(n.created_at), "dd MMM, hh:mm a")}</div>
                        <div className="whitespace-pre-wrap leading-snug">{n.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toast.info("Reminder SMS queued")}>Send Reminder SMS</Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toast.info("Advance SMS queued")}>Send Advance SMS</Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card overflow-hidden">
            <header className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
              <Hash className="h-3.5 w-3.5" /><h3 className="text-sm font-semibold">Attribution</h3>
            </header>
            <div className="p-4 space-y-2 text-xs">
              <p className="text-[10px] text-muted-foreground">Track where this order came from</p>
              <Badge variant="outline" className="text-[10px]">{form.source_platform || "utm"}</Badge>
              <Row label="Site" value={order.source_website ?? "—"} />
              <Row label="Platform" value={order.source_platform ?? "—"} />
            </div>
          </section>
        </aside>
      </div>

      <PrintableInvoice order={order} items={items as never} />
      <BookPathaoDialog open={bookOpen} onOpenChange={setBookOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} />
      <BookSteadfastDialog open={bookSteadfastOpen} onOpenChange={setBookSteadfastOpen} orderId={orderId} defaultAmount={Number(order.total ?? 0)} />
      <Dialog open={pendingWebStatus !== null} onOpenChange={(o) => !o && setPendingWebStatus(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingWebStatus === "on_hold" && "Put Order On Hold"}
              {pendingWebStatus === "cancelled" && "Cancel Order"}
              {pendingWebStatus === "advance_payment" && "Advance Payment"}
            </DialogTitle>
            <DialogDescription>
              {pendingWebStatus === "on_hold" && "Why are you putting this order on hold?"}
              {pendingWebStatus === "cancelled" && "Please tell us why this order is being cancelled."}
              {pendingWebStatus === "advance_payment" && "How much advance does the customer need to pay?"}
            </DialogDescription>
          </DialogHeader>
          {pendingWebStatus === "advance_payment" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Advance Amount (৳) <span className="text-rose-600">*</span>
                </label>
                <Input
                  type="number" min={1} autoFocus
                  value={pendingAdvance}
                  onChange={(e) => setPendingAdvance(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Note <span className="text-muted-foreground/70">(optional)</span>
                </label>
                <Textarea
                  rows={2}
                  maxLength={300}
                  value={pendingReason}
                  onChange={(e) => setPendingReason(e.target.value)}
                  placeholder="e.g. customer ke advance jonno bola hoyeche…"
                  className="resize-none"
                />
                <p className="text-[10px] text-muted-foreground">Source/payment details order create form e add koren.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Reason</label>
              <Textarea
                rows={3} autoFocus maxLength={500}
                value={pendingReason}
                onChange={(e) => setPendingReason(e.target.value)}
                placeholder="Type the reason…"
                className="resize-none"
              />
              <div className="text-[10px] text-right text-muted-foreground">{pendingReason.length}/500</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingWebStatus(null)}>Cancel</Button>
            <Button
              disabled={updateWebStatus.isPending}
              onClick={submitPendingWebStatus}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {updateWebStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small input helpers                                                        */
/* -------------------------------------------------------------------------- */

function QtyInput({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = (n: number) => { const v = Math.max(0, Number.isFinite(n) ? n : 0); onChange(v); setLocal(String(v)); };
  return (
    <div className="flex items-center h-8 rounded-md border overflow-hidden">
      <button type="button" className="px-2 h-full hover:bg-muted text-muted-foreground" onClick={() => commit(Number(local) - step)}><Minus className="h-3 w-3" /></button>
      <input value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => commit(Number(local))}
        className="flex-1 min-w-0 text-center text-xs bg-transparent outline-none tabular-nums" />
      <button type="button" className="px-2 h-full hover:bg-muted text-muted-foreground" onClick={() => commit(Number(local) + step)}><Plus className="h-3 w-3" /></button>
    </div>
  );
}

function NumInput({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit?: () => void }) {
  return (
    <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} onBlur={onCommit} className="h-9 tabular-nums" />
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums truncate text-right">{value}</span>
    </div>
  );
}