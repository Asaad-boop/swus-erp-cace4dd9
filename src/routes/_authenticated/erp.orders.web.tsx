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
import { useBrand } from "@/contexts/brand-context";
import { OrderDrawer } from "@/components/erp/orders/order-drawer";
import { cn } from "@/lib/utils";

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
  tags: string[] | null;
  source_website: string | null;
  web_status: WebStatus | null;
  total: number;
  call_attempt_count: number | null;
  call_status: string | null;
  brand_id: string | null;
  items_summary?: { name: string; quantity: number; image: string | null; unit_price: number | null }[];
};

type Breakdown = { total: number; confirmed: number; cancelled: number; returned: number };

type ProviderStat = { total: number; success: number; cancelled: number };
type CourierBreakdown = {
  pathao: ProviderStat;
  steadfast: ProviderStat;
  found: boolean;
};

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

const TAG_PALETTE = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
];

function tagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function SuccessRow({ label, dot, total, success, cancelled }: { label: string; dot: string; total: number; success: number; cancelled: number }) {
  const pct = total > 0 ? Math.round((success / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
      <span className="text-foreground/80 font-medium w-14 shrink-0">{label}</span>
      {total > 0 ? (
        <>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{success}</span>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">{cancelled}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground tabular-nums">{total}</span>
          <span className="ml-auto text-foreground/70 font-semibold tabular-nums">{pct}%</span>
        </>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      )}
    </div>
  );
}

function WebOrdersPage() {
  const { activeBrand } = useBrand();
  const [activeTab, setActiveTab] = useState<WebStatus | "all">("processing");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["web-orders", activeBrand?.id, activeTab, search],
    enabled: !!activeBrand?.id,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id,created_at,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,guest_name,guest_phone,latest_note,customer_note,tags,source_website,web_status,total,call_attempt_count,call_status,brand_id",
          { count: "exact" },
        )
        .eq("brand_id", activeBrand!.id)
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
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id,name,quantity,image,unit_price")
          .in("order_id", ids);
        const byOrder = new Map<string, { name: string; quantity: number; image: string | null; unit_price: number | null }[]>();
        (items ?? []).forEach((it) => {
          const arr = byOrder.get(it.order_id) ?? [];
          arr.push({ name: it.name ?? "—", quantity: it.quantity ?? 0, image: it.image ?? null, unit_price: it.unit_price ?? null });
          byOrder.set(it.order_id, arr);
        });
        rows.forEach((r) => (r.items_summary = byOrder.get(r.id) ?? []));
      }
      return rows;
    },
  });

  // counts per status
  const { data: counts } = useQuery({
    queryKey: ["web-orders-counts", activeBrand?.id],
    enabled: !!activeBrand?.id,
    queryFn: async () => {
      const result: Record<string, number> = { all: 0 };
      const { data, error } = await supabase
        .from("orders")
        .select("web_status")
        .eq("brand_id", activeBrand!.id)
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
  const { data: breakdowns } = useQuery({
    queryKey: ["customer-breakdown", activeBrand?.id, phones.sort().join(",")],
    enabled: !!activeBrand?.id && phones.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("shipping_phone,guest_phone,web_status")
        .eq("brand_id", activeBrand!.id)
        .or(phones.map((p) => `shipping_phone.eq.${p},guest_phone.eq.${p}`).join(","))
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, Breakdown>();
      (data ?? []).forEach((o) => {
        const ph = (o as { shipping_phone: string | null; guest_phone: string | null }).shipping_phone
          ?? (o as { guest_phone: string | null }).guest_phone;
        if (!ph) return;
        const b = map.get(ph) ?? { total: 0, confirmed: 0, cancelled: 0, returned: 0 };
        b.total++;
        const s = (o as { web_status: string | null }).web_status;
        if (s === "complete") b.confirmed++;
        else if (s === "cancelled") b.cancelled++;
        map.set(ph, b);
      });
      return map;
    },
  });

  // Courier history (Pathao + Steadfast) by phone — from cache
  const fetchCourierHistory = useServerFn(fetchCourierHistoryFn);
  const { data: courierHistory } = useQuery({
    queryKey: ["courier-history", activeBrand?.id, phones.sort().join(",")],
    enabled: phones.length > 0 && !!activeBrand?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { results } = await fetchCourierHistory({ data: { phones, brandId: activeBrand!.id } });
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
      });
      return map;
    },
  });

  const getBreakdown = (r: WebOrderRow): Breakdown => {
    const phone = r.shipping_phone ?? r.guest_phone;
    if (!phone) return { total: 0, confirmed: 0, cancelled: 0, returned: 0 };
    return breakdowns?.get(phone) ?? { total: 1, confirmed: 0, cancelled: 0, returned: 0 };
  };

  const emptyProvider: ProviderStat = { total: 0, success: 0, cancelled: 0 };
  const getCourier = (r: WebOrderRow): CourierBreakdown => {
    const phone = r.shipping_phone ?? r.guest_phone;
    if (!phone) return { pathao: emptyProvider, steadfast: emptyProvider, found: false };
    return courierHistory?.get(phone) ?? { pathao: emptyProvider, steadfast: emptyProvider, found: false };
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
          const count = counts?.[t.key] ?? 0;
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

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Created</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[220px]">Customer</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Note</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[240px]">Order Items</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[160px]">Success Rate</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[140px]">Tags</TableHead>
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
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No web orders in this status
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const name = r.shipping_name ?? r.guest_name ?? "—";
                const phone = r.shipping_phone ?? r.guest_phone ?? "";
                const note = r.latest_note ?? r.customer_note ?? "";
                const address = [r.shipping_address, r.shipping_city, r.shipping_district].filter(Boolean).join(", ");
                const items = r.items_summary ?? [];
                const totalQty = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
                const b = getBreakdown(r);
                const courier = getCourier(r);
                const accent = STATUS_ACCENT[r.web_status ?? ""] ?? "bg-muted-foreground";
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
                      <div className="flex gap-2.5">
                        <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-primary flex items-center justify-center text-xs font-bold">
                          {initials(name)}
                        </div>
                        <div className="min-w-0 text-xs space-y-0.5">
                          <div className="font-semibold text-foreground truncate">{name}</div>
                          {phone && (
                            <div className="text-muted-foreground truncate font-mono">{phone}</div>
                          )}
                          {address && (
                            <div className="text-muted-foreground line-clamp-2 leading-tight">{address}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Note */}
                    <TableCell className="py-4">
                      {note ? (
                        <div className="flex gap-1.5 text-xs text-foreground/80 bg-muted/40 rounded-md px-2 py-1.5 border border-border/50">
                          <MessageSquare className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                          <span className="line-clamp-3 italic leading-snug">{note}</span>
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
                            <div
                              key={i}
                              className="h-10 w-10 rounded-md border-2 border-card bg-muted overflow-hidden shrink-0"
                              title={it.name}
                            >
                              {it.image ? (
                                <img src={it.image} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-[10px] text-muted-foreground">
                                  {it.name.slice(0, 2)}
                                </div>
                              )}
                            </div>
                          ))}
                          {items.length > 3 && (
                            <div className="h-10 w-10 rounded-md border-2 border-card bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                              +{items.length - 3}
                            </div>
                          )}
                        </div>
                        <div className="text-xs space-y-0.5 min-w-0">
                          <div className="font-semibold text-foreground">৳ {Number(r.total).toLocaleString()}</div>
                          <div className="text-muted-foreground">
                            {items.length} {items.length === 1 ? "item" : "items"} · {totalQty} qty
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Success Rate */}
                    <TableCell className="py-4">
                      <div className="space-y-1 text-[10px]">
                        <SuccessRow label="Our" dot="bg-slate-500" total={b.total} success={b.confirmed} cancelled={b.cancelled} />
                        <SuccessRow label="Pathao" dot="bg-rose-500" total={courier.pathao.total} success={courier.pathao.success} cancelled={courier.pathao.cancelled} />
                        <SuccessRow label="Steadfast" dot="bg-amber-500" total={courier.steadfast.total} success={courier.steadfast.success} cancelled={courier.steadfast.cancelled} />
                      </div>
                    </TableCell>

                    {/* Tags */}
                    <TableCell className="py-4">
                      <div className="flex flex-wrap gap-1">
                        {(r.tags ?? []).slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className={cn(
                              "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                              tagColor(t),
                            )}
                          >
                            {t}
                          </span>
                        ))}
                        {(r.tags?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground self-center">+{r.tags!.length - 3}</span>
                        )}
                        {(r.tags?.length ?? 0) === 0 && <span className="text-xs text-muted-foreground/60">—</span>}
                      </div>
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

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}