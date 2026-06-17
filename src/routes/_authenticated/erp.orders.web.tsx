import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrand } from "@/contexts/brand-context";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { cn } from "@/lib/utils";
import { computeAutoTags, topTag, type AutoTagKey } from "@/lib/erp/order-tags";
import { AutoTagChips } from "@/components/erp/orders/auto-tag-chips";
import { CopyIconBtn, PhoneActions } from "@/components/erp/orders/contact-actions";
import { AdvanceBadge } from "@/components/erp/orders/advance-badge";
import { TagFilterBar, buildFilterOptions } from "@/components/erp/orders/tag-filter-bar";
import { IncompleteOrdersTable } from "@/components/erp/orders/incomplete-orders-table";
import { useAbandonedCartCount } from "@/hooks/erp/use-abandoned-carts-query";

export const Route = createFileRoute("/_authenticated/erp/orders/web")({
  head: () => ({ meta: [{ title: "Web Orders — ERP" }] }),
  component: WebOrdersPage,
});

type WebStatus =
  | "processing"
  | "incomplete"
  | "good_but_no_response"
  | "no_response"
  | "advance_payment"
  | "on_hold"
  | "complete"
  | "cancelled";

const STATUS_TABS: { key: WebStatus | "all"; label: string; color: string }[] = [
  { key: "processing", label: "Processing", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  { key: "incomplete", label: "Incomplete", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  { key: "good_but_no_response", label: "Good But No Response", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  { key: "no_response", label: "No Response", color: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  { key: "advance_payment", label: "Advance Payment", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" },
  { key: "on_hold", label: "On Hold", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  { key: "complete", label: "Complete", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { key: "cancelled", label: "Cancel", color: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  { key: "all", label: "All", color: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
];

type WebOrderRow = {
  id: string;
  created_at: string;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  latest_note: string | null;
  customer_note: string | null;
  notes: string | null;
  tags: string[] | null;
  source_website: string | null;
  web_status: WebStatus | null;
  total: number;
  advance_amount: number | null;
  call_attempt_count: number | null;
  call_status: string | null;
  brand_id: string | null;
  items_summary?: { name: string; quantity: number; image: string | null; unit_price: number | null }[];
  latest_order_note?: string | null;
};

type Breakdown = { total: number; confirmed: number; cancelled: number; returned: number; delivered: number };

type ProviderStat = { total: number; success: number; cancelled: number };
type CourierBreakdown = {
  pathao: ProviderStat;
  steadfast: ProviderStat;
  found: boolean;
};

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880")) return "0" + digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) return "0" + digits;
  return digits;
}

const STATUS_ACCENT: Record<string, string> = {
  processing: "bg-blue-500",
  incomplete: "bg-orange-500",
  good_but_no_response: "bg-amber-500",
  no_response: "bg-red-500",
  advance_payment: "bg-purple-500",
  on_hold: "bg-yellow-500",
  complete: "bg-emerald-500",
  cancelled: "bg-zinc-400",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function SuccessBlock({ total, success }: { total: number; success: number }) {
  const pct = total > 0 ? Math.round((success / total) * 100) : 0;
  const tone = total === 0
    ? { text: "text-muted-foreground/60", ring: "stroke-muted-foreground/30", chip: "bg-muted/40 text-muted-foreground ring-border", glow: "" }
    : pct >= 80
      ? { text: "text-emerald-600 dark:text-emerald-400", ring: "stroke-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", glow: "shadow-[0_0_12px_-2px_rgba(16,185,129,0.35)]" }
      : pct >= 50
        ? { text: "text-amber-600 dark:text-amber-400", ring: "stroke-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30", glow: "shadow-[0_0_12px_-2px_rgba(245,158,11,0.35)]" }
        : { text: "text-rose-600 dark:text-rose-400", ring: "stroke-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30", glow: "shadow-[0_0_12px_-2px_rgba(244,63,94,0.35)]" };
  if (total === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
  const R = 15;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - pct / 100);
  return (
    <div className="flex items-center gap-3">
      <div className={cn("relative shrink-0 rounded-full", tone.glow)}>
        <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
          <circle cx="18" cy="18" r={R} className="fill-none stroke-muted/50" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r={R}
            className={cn("fill-none transition-all duration-700 ease-out", tone.ring)}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-[11px] font-bold tabular-nums tracking-tight", tone.text)}>{pct}%</span>
        </div>
      </div>
      <div className="text-xs tabular-nums leading-tight space-y-1">
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset", tone.chip)}>
          {pct}% success
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Order</span>
          <span className="font-semibold text-foreground">{success}<span className="text-muted-foreground/50">/{total}</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Rating</span>
          <span className="font-semibold text-foreground">{success}</span>
        </div>
      </div>
    </div>
  );
}

function AllItemsPopover({
  items,
  total,
}: {
  items: { name: string; quantity: number; image: string | null; unit_price: number | null }[];
  total: number;
}) {
  const totalQty = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  return (
    <PopoverContent
      align="start"
      side="top"
      className="w-80 p-0 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
          {items.length} item{items.length === 1 ? "" : "s"} · {totalQty} qty
        </div>
        <div className="text-sm font-bold tabular-nums text-primary">৳{Number(total).toLocaleString()}</div>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2.5 p-2.5 hover:bg-muted/40">
            <div className="h-11 w-11 rounded-md border bg-muted overflow-hidden shrink-0">
              {it.image ? (
                <img src={it.image} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                  {it.name.slice(0, 2)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium leading-tight line-clamp-2">{it.name}</div>
              {it.unit_price != null && (
                <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                  ৳{Number(it.unit_price).toLocaleString()} × {it.quantity}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] font-bold tabular-nums">×{it.quantity}</div>
              <div className="text-[10px] font-semibold tabular-nums text-primary">
                ৳{(Number(it.unit_price ?? 0) * (it.quantity ?? 0)).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PopoverContent>
  );
}

function WebOrdersPage() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const brandNameById = new Map(brands.map((b) => [b.id, b.name] as const));
  const brandsKey = brandIds.join(",");
  const [activeTab, setActiveTab] = useState<WebStatus | "all">("processing");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<Set<AutoTagKey>>(new Set());
  const [incompletePage, setIncompletePage] = useState(0);
  const { data: incompleteCount } = useAbandonedCartCount(activeBrand?.id ?? null, brandIds);

  const { data, isLoading } = useQuery({
    queryKey: ["web-orders", brandsKey, activeTab, search],
    enabled: brandIds.length > 0 && activeTab !== "incomplete",
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id,created_at,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,guest_name,guest_phone,latest_note,customer_note,notes,tags,source_website,web_status,total,advance_amount,call_attempt_count,call_status,brand_id",
          { count: "exact" },
        )
        .in("brand_id", brandIds)
        .eq("source", "website")
        .order("created_at", { ascending: false })
        .limit(100);

      if (activeTab !== "all") q = q.eq("web_status", activeTab);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(
          `shipping_name.ilike.%${s}%,shipping_phone.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as WebOrderRow[];

      // fetch items summary
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const [{ data: items }, { data: orderNotes }] = await Promise.all([
          supabase
            .from("order_items")
            .select("order_id,name,quantity,image,unit_price")
            .in("order_id", ids),
          supabase
            .from("order_notes")
            .select("order_id,body,created_at")
            .in("order_id", ids)
            .order("created_at", { ascending: false }),
        ]);
        const byOrder = new Map<string, { name: string; quantity: number; image: string | null; unit_price: number | null }[]>();
        (items ?? []).forEach((it) => {
          const arr = byOrder.get(it.order_id) ?? [];
          arr.push({ name: it.name ?? "—", quantity: it.quantity ?? 0, image: it.image ?? null, unit_price: it.unit_price ?? null });
          byOrder.set(it.order_id, arr);
        });
        const latestNoteByOrder = new Map<string, string>();
        (orderNotes ?? []).forEach((n) => {
          if (!latestNoteByOrder.has(n.order_id) && n.body) latestNoteByOrder.set(n.order_id, n.body);
        });
        rows.forEach((r) => {
          r.items_summary = byOrder.get(r.id) ?? [];
          r.latest_order_note = latestNoteByOrder.get(r.id) ?? null;
        });
      }
      return rows;
    },
  });

  // counts per status
  const { data: counts } = useQuery({
    queryKey: ["web-orders-counts", brandsKey],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const result: Record<string, number> = { all: 0 };
      const { data, error } = await supabase
        .from("orders")
        .select("web_status")
        .in("brand_id", brandIds)
        .eq("source", "website")
        .limit(5000);
      if (error) throw error;
      (data ?? []).forEach((r) => {
        result.all++;
        const k = (r as { web_status: string | null }).web_status;
        if (k) result[k] = (result[k] ?? 0) + 1;
      });
      return result;
    },
  });

  const rows = data ?? [];

  // customer breakdown by phone — historical totals across all orders in this brand
  const phones = Array.from(new Set(rows.map((r) => r.shipping_phone ?? r.guest_phone).filter(Boolean) as string[]));
  const courierPhones = Array.from(new Set(phones.map(normalizePhone).filter(Boolean)));
  const { data: breakdowns } = useQuery({
    queryKey: ["customer-breakdown", brandsKey, phones.sort().join(",")],
    enabled: brandIds.length > 0 && phones.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("shipping_phone,guest_phone,web_status,status")
        .in("brand_id", brandIds)
        .or(phones.map((p) => `shipping_phone.eq.${p},guest_phone.eq.${p}`).join(","))
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, Breakdown>();
      (data ?? []).forEach((o) => {
        const ph = (o as { shipping_phone: string | null; guest_phone: string | null }).shipping_phone
          ?? (o as { guest_phone: string | null }).guest_phone;
        if (!ph) return;
        const b = map.get(ph) ?? { total: 0, confirmed: 0, cancelled: 0, returned: 0, delivered: 0 };
        b.total++;
        const ws = (o as { web_status: string | null }).web_status;
        const st = (o as { status: string | null }).status;
        if (ws === "complete") b.confirmed++;
        else if (ws === "cancelled") b.cancelled++;
        if (st === "delivered") b.delivered++;
        else if (st === "returned") b.returned++;
        map.set(ph, b);
      });
      return map;
    },
  });

  // Courier history (Pathao + Steadfast) by phone — from cache
  const fetchCourierHistory = useServerFn(fetchCourierHistoryFn);
  // FAST PATH: read DB-cached rows directly so cards appear instantly on reload
  const { data: cachedCourierHistory } = useQuery({
    queryKey: ["courier-history-cache", brandsKey, courierPhones.sort().join(",")],
    enabled: courierPhones.length > 0,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("courier_history_cache")
        .select("phone, data")
        .in("phone", courierPhones);
      const map = new Map<string, CourierBreakdown>();
      (data ?? []).forEach((row) => {
        const hist = row.data as { providers?: Array<{ name: string; total: number; success: number; cancelled: number; ok: boolean }> } | null;
        if (!hist) return;
        const result: CourierBreakdown = {
          pathao: { total: 0, success: 0, cancelled: 0 },
          steadfast: { total: 0, success: 0, cancelled: 0 },
          found: false,
        };
        (hist.providers ?? []).forEach((p) => {
          const stat = { total: p.total ?? 0, success: p.success ?? 0, cancelled: p.cancelled ?? 0 };
          if (p.name === "pathao") result.pathao = stat;
          else if (p.name === "steadfast") result.steadfast = stat;
        });
        result.found = result.pathao.total + result.steadfast.total > 0;
        map.set(row.phone, result);
      });
      return map;
    },
  });
  // SLOW PATH: hits external couriers if cache stale; runs in background
  const { data: freshCourierHistory } = useQuery({
    queryKey: ["courier-history", brandsKey, courierPhones.sort().join(",")],
    enabled: courierPhones.length > 0 && !!activeBrand?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { results } = await fetchCourierHistory({ data: { phones: courierPhones, brandId: activeBrand!.id } });
      const map = new Map<string, CourierBreakdown>();
      Object.entries(results).forEach(([phone, d]) => {
        const result: CourierBreakdown = {
          pathao: { total: 0, success: 0, cancelled: 0 },
          steadfast: { total: 0, success: 0, cancelled: 0 },
          found: !!d.found,
        };
        (d.providers ?? []).forEach((p) => {
          const stat = { total: p.total ?? 0, success: p.success ?? 0, cancelled: p.cancelled ?? 0 };
          if (p.name === "pathao") result.pathao = stat;
          else if (p.name === "steadfast") result.steadfast = stat;
        });
        map.set(phone, result);
        map.set(normalizePhone(phone), result);
      });
      return map;
    },
  });
  // Prefer fresh data when available; fall back to cached for instant render
  const courierHistory = freshCourierHistory ?? cachedCourierHistory;

  const getBreakdown = (r: WebOrderRow): Breakdown => {
    const phone = r.shipping_phone ?? r.guest_phone;
    if (!phone) return { total: 0, confirmed: 0, cancelled: 0, returned: 0, delivered: 0 };
    return breakdowns?.get(phone) ?? { total: 1, confirmed: 0, cancelled: 0, returned: 0, delivered: 0 };
  };

  const emptyProvider: ProviderStat = { total: 0, success: 0, cancelled: 0 };
  const getCourier = (r: WebOrderRow): CourierBreakdown => {
    const phone = normalizePhone(r.shipping_phone ?? r.guest_phone ?? "");
    if (!phone) return { pathao: emptyProvider, steadfast: emptyProvider, found: false };
    return courierHistory?.get(phone) ?? { pathao: emptyProvider, steadfast: emptyProvider, found: false };
  };

  // Compute auto-tags for every loaded row (cheap, sync)
  const taggedRows = rows.map((r) => {
    const items = r.items_summary ?? [];
    const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
    const tags = computeAutoTags(
      {
        total: r.total,
        customer_note: r.customer_note,
        notes: r.notes,
        shipping_city: r.shipping_city,
        call_attempt_count: r.call_attempt_count,
        created_at: r.created_at,
        status: r.web_status,
        itemCount: items.length,
        totalQty,
      },
      getBreakdown(r),
      getCourier(r),
    );
    return { row: r, tags };
  });

  const filterOptions = buildFilterOptions(taggedRows.map((t) => t.tags));
  const filteredRows = tagFilter.size === 0
    ? taggedRows
    : taggedRows.filter(({ tags }) => tags.some((t) => tagFilter.has(t.key)));

  const toggleTagFilter = (k: AutoTagKey) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Web Orders</h1>
          <p className="text-sm text-muted-foreground">
            {activeBrand?.name} · Orders from website
          </p>
        </div>
        <Input
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </header>

      <div className="border-b flex flex-wrap gap-1">
        {STATUS_TABS.map((t) => {
          const active = activeTab === t.key;
          const count =
            t.key === "incomplete"
              ? incompleteCount ?? 0
              : counts?.[t.key] ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-2",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      <TagFilterBar
        options={filterOptions}
        selected={tagFilter}
        onToggle={toggleTagFilter}
        onClear={() => setTagFilter(new Set())}
      />

      {activeTab === "incomplete" ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <IncompleteOrdersTable
            brandId={activeBrand?.id ?? null}
            search={search}
            page={incompletePage}
            pageSize={50}
            onPageChange={setIncompletePage}
            onOpenOrder={setOpenId}
          />
        </div>
      ) : (
      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Created</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[220px]">Customer</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Note</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[240px]">Order Items</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[160px]">Success Rate</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Tags</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Site</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j} className="py-4"><Skeleton className="h-10 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {tagFilter.size > 0 ? "No orders match the selected tags" : "No web orders in this status"}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map(({ row: r, tags: autoTags }) => {
                const name = r.shipping_name ?? r.guest_name ?? "—";
                const phone = r.shipping_phone ?? r.guest_phone ?? "";
                const note = r.latest_order_note ?? r.latest_note ?? r.customer_note ?? r.notes ?? "";
                const address = [r.shipping_address, r.shipping_city, r.shipping_district].filter(Boolean).join(", ");
                const items = r.items_summary ?? [];
                const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
                const b = getBreakdown(r);
                const courier = getCourier(r);
                const top = topTag(autoTags);
                const accent = top?.accent ?? STATUS_ACCENT[r.web_status ?? ""] ?? "bg-muted-foreground";
                const siteLabel = (r.source_website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/30 border-b last:border-0 align-top"
                    onClick={() => setOpenId(r.id)}
                  >
                    {/* Created */}
                    <TableCell className="py-4">
                      <div className="flex gap-2">
                        <div className={cn("w-1 rounded-full self-stretch", accent)} />
                        <div className="text-xs">
                          <div className="font-semibold text-foreground">{format(new Date(r.created_at), "dd MMM, yy")}</div>
                          <div className="text-muted-foreground">{format(new Date(r.created_at), "hh:mm a")}</div>
                          <div className="text-[10px] text-muted-foreground/80 mt-1">
                            {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Customer */}
                    <TableCell className="py-4">
                      <div>
                        <div className="min-w-0 text-xs space-y-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-semibold text-foreground truncate">{name}</span>
                            {name !== "—" && <CopyIconBtn value={name} label="Name" className="shrink-0" />}
                          </div>
                          {phone && (
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-muted-foreground truncate font-mono">{phone}</span>
                              <PhoneActions phone={phone} className="shrink-0" />
                            </div>
                          )}
                          {address && (
                            <div className="flex items-start gap-1 min-w-0">
                              <span className="text-muted-foreground line-clamp-2 leading-tight flex-1">{address}</span>
                              <CopyIconBtn value={address} label="Address" className="shrink-0 mt-0.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Note */}
                    <TableCell className="py-4">
                      {note ? (
                        <div className="group/note w-[210px] flex items-start gap-2 p-2 rounded-lg bg-white dark:bg-card border border-amber-200/70 dark:border-amber-900/40 shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_-1px_0_rgba(0,0,0,0.02)] hover:border-amber-300 dark:hover:border-amber-800 hover:shadow-md transition-all">
                          <div className="mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 shadow-inner">
                            <MessageSquare className="h-3 w-3 text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700/70 dark:text-amber-400/70 leading-none">
                              Customer Note
                            </span>
                            <p className="text-xs leading-snug text-foreground font-bold line-clamp-3">
                              {note}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Order Items */}
                    <TableCell className="py-4">
                      <div className="flex items-start gap-2">
                        <div className="flex -space-x-2">
                          {items.slice(0, 3).map((it, i) => (
                            <Popover key={i}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-10 w-10 rounded-md border-2 border-card bg-muted overflow-hidden shrink-0 hover:z-10 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  title={it.name}
                                >
                                  {it.image ? (
                                    <img src={it.image} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                                      {it.name.slice(0, 2)}
                                    </div>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                side="top"
                                className="w-72 p-0 overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex gap-3 p-3">
                                  <div className="h-[72px] w-[72px] rounded-lg border bg-muted overflow-hidden shrink-0">
                                    {it.image ? (
                                      <img src={it.image} alt={it.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                                        {it.name.slice(0, 2)}
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold leading-tight line-clamp-3">{it.name}</div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 border-t bg-muted/30 text-center">
                                  <div className="px-2 py-2 border-r">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Qty</div>
                                    <div className="text-sm font-bold tabular-nums">{it.quantity}</div>
                                  </div>
                                  <div className="px-2 py-2 border-r">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Price</div>
                                    <div className="text-sm font-bold tabular-nums">৳{Number(it.unit_price ?? 0).toLocaleString()}</div>
                                  </div>
                                  <div className="px-2 py-2">
                                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Total</div>
                                    <div className="text-sm font-bold tabular-nums text-primary">৳{(Number(it.unit_price ?? 0) * (it.quantity ?? 0)).toLocaleString()}</div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ))}
                          {items.length > 3 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-10 w-10 rounded-md border-2 border-card bg-muted hover:bg-muted/70 flex items-center justify-center text-[10px] font-semibold text-muted-foreground hover:z-10 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                  +{items.length - 3}
                                </button>
                              </PopoverTrigger>
                              <AllItemsPopover items={items} total={r.total} />
                            </Popover>
                          )}
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs space-y-0.5 min-w-0 text-left rounded-md px-1.5 py-1 hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
                            >
                              <div className="font-semibold text-foreground">৳ {Number(r.total).toLocaleString()}</div>
                              <div className="text-muted-foreground">
                                {items.length} {items.length === 1 ? "item" : "items"} · {totalQty} qty
                              </div>
                              <AdvanceBadge advance={r.advance_amount} total={r.total} variant="full" className="mt-1 items-start" />
                            </button>
                          </PopoverTrigger>
                          <AllItemsPopover items={items} total={r.total} />
                        </Popover>
                      </div>
                    </TableCell>

                    {/* Success Rate */}
                    <TableCell className="py-4">
                      <SuccessBlock
                        total={courier.pathao.total + courier.steadfast.total || b.total}
                        success={courier.pathao.success + courier.steadfast.success || b.confirmed}
                      />
                    </TableCell>

                    {/* Tags */}
                    <TableCell className="py-4">
                      <AutoTagChips autoTags={autoTags} manualTags={r.tags} max={4} />
                    </TableCell>

                    {/* Site */}
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-1 items-start">
                        {activeBrand?.name && (
                          <span className="inline-flex items-center rounded-md bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-semibold ring-1 ring-primary/30">
                            {activeBrand.name}
                          </span>
                        )}
                        {siteLabel ? (
                          <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground truncate max-w-[140px]">
                            {siteLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-4 text-right">
                      <div onClick={(e) => e.stopPropagation()} className="inline-block">
                        <Button asChild size="sm" variant="default" className="h-8">
                          <Link to="/erp/orders/$orderId" params={{ orderId: r.id }}>
                            Open
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      )}

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} mode="web" />
    </div>
  );
}