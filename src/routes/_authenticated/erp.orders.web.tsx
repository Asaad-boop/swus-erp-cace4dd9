import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as React from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Loader2, Star, AlertTriangle, Repeat, Phone as PhoneIcon, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { WebOrdersFilterBar, computeDateRange, type SortKey, type DatePreset } from "@/components/erp/orders/web-orders-filter-bar";
import { WebBulkActionBar, type WebStatusKey } from "@/components/erp/orders/web-bulk-action-bar";
import { BulkPrintDialog } from "@/components/erp/orders/bulk-print-dialog";
import { PathaoBulkUploadDialog } from "@/components/erp/orders/pathao-bulk-upload-dialog";
import { WebOrdersAnalytics } from "@/components/erp/orders/web-orders-analytics";

const PAGE_SIZE = 25;
const STATUS_KEYS = ["processing", "good_but_no_response", "no_response", "advance_payment", "on_hold", "complete", "cancelled"] as const;

const searchSchema = z.object({
  tab: fallback(
    z.enum(["processing", "incomplete", "good_but_no_response", "no_response", "advance_payment", "on_hold", "complete", "cancelled", "all"]),
    "processing",
  ).default("processing"),
  q: fallback(z.string(), "").default(""),
  source: fallback(z.string(), "all").default("all"),
  sort: fallback(z.enum(["newest", "oldest", "highest", "lowest", "recent_note"]), "newest").default("newest"),
  preset: fallback(z.enum(["all", "today", "yesterday", "7d", "30d", "custom"]), "all").default("all"),
  from: fallback(z.string().nullable(), null).default(null),
  to: fallback(z.string().nullable(), null).default(null),
  page: fallback(z.number().int().min(1), 1).default(1),
});
type WebOrdersSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/erp/orders/web")({
  head: () => ({ meta: [{ title: "Web Orders — ERP" }] }),
  validateSearch: zodValidator(searchSchema),
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
  attribution?: { utm_source: string | null; utm_medium: string | null } | null;
};

function CallLogPopover({
  orderId, currentCount, onSaved,
}: {
  orderId: string;
  currentCount: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!result) { toast.error("Pick a result"); return; }
    setSaving(true);
    try {
      const body = `📞 ${result}${note.trim() ? ` — ${note.trim()}` : ""}`;
      const { error: noteErr } = await supabase.from("order_notes").insert({ order_id: orderId, body, is_internal: true });
      if (noteErr) throw noteErr;
      const { error: updErr } = await supabase
        .from("orders")
        .update({ call_attempt_count: currentCount + 1, call_status: result } as never)
        .eq("id", orderId);
      if (updErr) throw updErr;
      toast.success("Call logged");
      setResult(""); setNote(""); setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const RESULTS = ["Answered", "No Answer", "Busy", "Wrong Number"];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Log call"
          className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md border border-border/60 bg-background hover:bg-muted text-[10px] font-semibold text-foreground/80"
        >
          <PhoneIcon className="h-3 w-3" />
          {currentCount > 0 && <span className="tabular-nums">{currentCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Log call result</div>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={cn(
                "h-7 rounded-md text-[11px] font-medium border transition-colors",
                result === r ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border/60",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="text-xs min-h-[60px]"
        />
        <div className="flex justify-end gap-1.5 mt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving || !result}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  return _AllItemsPopover({ items, total });
}

function ProductThumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const url = src && src.trim() ? src : null;
  if (!url || failed) {
    return (
      <div className={cn("h-full w-full flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <Package className="h-1/2 w-1/2 opacity-50" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}

function _AllItemsPopover({
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
              <ProductThumb src={it.image} alt={it.name} />
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
  // placeholder; real component declared below
  return _WebOrdersPageBody();
}

function CustomerBadges({ total, confirmRate, delivered }: { total: number; confirmRate: number; delivered: number }) {
  if (total <= 1) return null;
  const tooltip = `${total} orders | ${confirmRate}% confirm rate | ${delivered} delivered`;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 flex-wrap">
            {total >= 5 ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0 h-4 rounded text-[9px] font-bold bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
                <Star className="h-2.5 w-2.5 fill-current" /> VIP
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0 h-4 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800">
                <Repeat className="h-2.5 w-2.5" /> {total}x
              </span>
            )}
            {confirmRate < 30 && total >= 3 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0 h-4 rounded text-[9px] font-bold bg-rose-100 text-rose-800 ring-1 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800">
                <AlertTriangle className="h-2.5 w-2.5" /> Low
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SourcePill({ attribution, siteLabel }: { attribution: { utm_source: string | null; utm_medium: string | null } | null | undefined; siteLabel: string }) {
  const raw = (attribution?.utm_source ?? "").toLowerCase();
  let icon = "🔗";
  let label = "Direct";
  let tone = "bg-muted/60 text-muted-foreground ring-border";
  if (raw.includes("facebook") || raw === "fb" || raw.includes("meta")) {
    icon = "📘"; label = "Facebook"; tone = "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60";
  } else if (raw.includes("instagram") || raw === "ig") {
    icon = "📷"; label = "Instagram"; tone = "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:ring-pink-900/60";
  } else if (raw.includes("google")) {
    icon = "🔍"; label = "Google"; tone = "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60";
  } else if (raw && raw !== "direct" && raw !== "organic") {
    icon = "🌐"; label = attribution!.utm_source!.slice(0, 16); tone = "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60";
  } else if (!raw && siteLabel) {
    icon = "🔗"; label = siteLabel;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-semibold ring-1 ring-inset max-w-[120px]", tone)}>
      <span>{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function _WebOrdersPageBody() {
  const { activeBrand, brandIds, isAllBrands, brands } = useBrand();
  const brandNameById = new Map(brands.map((b) => [b.id, b.name] as const));
  const brandsKey = brandIds.join(",");
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeTab = search.tab;
  const sort = search.sort;
  const sourceFilter = search.source;
  const datePreset = search.preset;
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<Set<AutoTagKey>>(new Set());
  const [incompletePage, setIncompletePage] = useState(0);
  const [searchInput, setSearchInput] = useState(search.q);
  const [debouncedSearch, setDebouncedSearch] = useState(search.q);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [pathaoBulkOpen, setPathaoBulkOpen] = useState(false);
  // inline status buttons removed; selection-based bulk actions only

  // Debounce search input (300ms) → URL + query key
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      navigate({ search: (prev: WebOrdersSearch) => ({ ...prev, q: searchInput || "" }), replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Sync external URL changes back into input
  useEffect(() => { if (search.q !== searchInput) setSearchInput(search.q); /* eslint-disable-next-line */ }, [search.q]);

  const { data: incompleteCount } = useAbandonedCartCount(activeBrand?.id ?? null, brandIds);

  // Date range from preset
  const dateRange = useMemo(
    () => computeDateRange(datePreset, search.from, search.to),
    [datePreset, search.from, search.to],
  );

  // Pre-fetch order IDs matching source filter (for fb/insta/google/other)
  const { data: sourceOrderIds } = useQuery({
    queryKey: ["web-orders-source-ids", brandsKey, sourceFilter],
    enabled: brandIds.length > 0 && ["facebook", "instagram", "google", "other"].includes(sourceFilter),
    staleTime: 60_000,
    queryFn: async () => {
      const map: Record<string, string> = {
        facebook: "%facebook%",
        instagram: "%instagram%",
        google: "%google%",
      };
      let q = applyBrandScope(
        supabase.from("mkt_order_attributions").select("order_id, utm_source"),
        brandIds,
      ).limit(10000);
      if (sourceFilter === "other") {
        q = q.not("utm_source", "ilike", "%facebook%")
          .not("utm_source", "ilike", "%instagram%")
          .not("utm_source", "ilike", "%google%")
          .not("utm_source", "is", null);
      } else {
        q = q.ilike("utm_source", map[sourceFilter]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.order_id)));
    },
  });

  // Infinite paginated orders
  const ordersQueryKey = ["web-orders-inf", brandsKey, activeTab, debouncedSearch, sort, sourceFilter, dateRange.from, dateRange.to, sourceOrderIds?.join(",") ?? ""] as const;

  const ordersQuery = useInfiniteQuery({
    queryKey: ordersQueryKey,
    enabled: brandIds.length > 0 && activeTab !== "incomplete"
      && (sourceFilter === "all" || sourceFilter === "direct" || !!sourceOrderIds),
    initialPageParam: 0,
    getNextPageParam: (last: { rows: WebOrderRow[]; total: number; nextPage: number | null }) => last.nextPage,
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      let q = applyBrandScope(
        supabase
          .from("orders")
          .select(
            "id,created_at,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,guest_name,guest_phone,latest_note,customer_note,notes,tags,source_website,web_status,total,advance_amount,call_attempt_count,call_status,brand_id,updated_at",
            { count: "exact" },
          ),
        brandIds,
      ).eq("source", "website");

      // sort
      if (sort === "newest") q = q.order("created_at", { ascending: false });
      else if (sort === "oldest") q = q.order("created_at", { ascending: true });
      else if (sort === "highest") q = q.order("total", { ascending: false });
      else if (sort === "lowest") q = q.order("total", { ascending: true });
      else if (sort === "recent_note") q = q.order("updated_at", { ascending: false });

      if (activeTab !== "all") q = q.eq("web_status", activeTab);
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        q = q.or(
          `shipping_name.ilike.%${s}%,shipping_phone.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%`,
        );
      }
      if (dateRange.from) q = q.gte("created_at", dateRange.from);
      if (dateRange.to) q = q.lte("created_at", dateRange.to);

      if (["facebook", "instagram", "google", "other"].includes(sourceFilter)) {
        const ids = sourceOrderIds ?? [];
        if (ids.length === 0) return { rows: [], total: 0, nextPage: null };
        q = q.in("id", ids);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;
      let rows = (data ?? []) as WebOrderRow[];

      // fetch items + notes + attribution for this page
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        const [{ data: items }, { data: orderNotes }, { data: attrs }] = await Promise.all([
          supabase.from("order_items").select("order_id,name,quantity,image,unit_price").in("order_id", ids),
          supabase.from("order_notes").select("order_id,body,created_at").in("order_id", ids).order("created_at", { ascending: false }),
          supabase.from("mkt_order_attributions").select("order_id,utm_source,utm_medium").in("order_id", ids),
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
        const attrByOrder = new Map<string, { utm_source: string | null; utm_medium: string | null }>();
        (attrs ?? []).forEach((a) => {
          if (!attrByOrder.has(a.order_id)) attrByOrder.set(a.order_id, { utm_source: a.utm_source, utm_medium: a.utm_medium });
        });
        rows.forEach((r) => {
          r.items_summary = byOrder.get(r.id) ?? [];
          r.latest_order_note = latestNoteByOrder.get(r.id) ?? null;
          r.attribution = attrByOrder.get(r.id) ?? null;
        });
      }

      // client-side filter for "direct" source (no attribution row)
      if (sourceFilter === "direct") {
        rows = rows.filter((r) => !r.attribution || !r.attribution.utm_source);
      }

      const total = count ?? 0;
      const fetched = (page + 1) * PAGE_SIZE;
      return { rows, total, nextPage: fetched < total ? page + 1 : null };
    },
  });

  const rows = useMemo(() => ordersQuery.data?.pages.flatMap((p) => p.rows) ?? [], [ordersQuery.data]);
  const totalRows = ordersQuery.data?.pages[0]?.total ?? 0;
  const isLoading = ordersQuery.isLoading;

  // counts per status — parallel head count queries
  const { data: counts } = useQuery({
    queryKey: ["web-orders-counts", brandsKey],
    enabled: brandIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const queries = STATUS_KEYS.map(async (st) => {
        const { count } = await applyBrandScope(
          supabase.from("orders").select("id", { count: "exact", head: true }),
          brandIds,
        ).eq("source", "website").eq("web_status", st);
        return [st, count ?? 0] as const;
      });
      const allQ = applyBrandScope(
        supabase.from("orders").select("id", { count: "exact", head: true }),
        brandIds,
      ).eq("source", "website");
      const [allRes, ...stRes] = await Promise.all([allQ, ...queries]);
      const result: Record<string, number> = { all: allRes.count ?? 0 };
      stRes.forEach(([k, v]) => { result[k] = v; });
      return result;
    },
  });

  // Realtime: new orders for active brand(s)
  useEffect(() => {
    if (brandIds.length === 0) return;
    const channel = supabase
      .channel(`web-orders-realtime-${brandsKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `source=eq.website` },
        (payload) => {
          const row = payload.new as { id: string; brand_id: string | null; total: number; shipping_name: string | null; guest_name: string | null; shipping_city: string | null };
          if (!row.brand_id || !brandIds.includes(row.brand_id)) return;
          const name = row.shipping_name ?? row.guest_name ?? "Customer";
          const city = row.shipping_city ? ` from ${row.shipping_city}` : "";
          toast.success(`🎉 New Order! ৳${Number(row.total).toLocaleString()} — ${name}${city}`, {
            duration: 8000,
            className: "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/60",
            onDismiss: () => {},
            action: { label: "Open", onClick: () => setOpenId(row.id) },
          });
          setFlashIds((prev) => { const n = new Set(prev); n.add(row.id); return n; });
          setTimeout(() => {
            setFlashIds((prev) => { const n = new Set(prev); n.delete(row.id); return n; });
          }, 3000);
          queryClient.invalidateQueries({ queryKey: ["web-orders-inf"] });
          queryClient.invalidateQueries({ queryKey: ["web-orders-counts"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [brandsKey, brandIds, queryClient]);

  // customer breakdown by phone — historical totals across all orders in this brand
  const phones = Array.from(new Set(rows.map((r) => r.shipping_phone ?? r.guest_phone).filter(Boolean) as string[]));
  const courierPhones = Array.from(new Set(phones.map(normalizePhone).filter(Boolean)));
  const { data: breakdowns } = useQuery({
    queryKey: ["customer-breakdown", brandsKey, phones.sort().join(",")],
    enabled: brandIds.length > 0 && phones.length > 0,
    queryFn: async () => {
      const { data, error } = await applyBrandScope(
        supabase.from("orders").select("shipping_phone,guest_phone,web_status,status"),
        brandIds,
      )
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
  // SLOW PATH: only fetch phones MISSING from cache, runs in background
  const missingPhones = courierPhones.filter((p) => !cachedCourierHistory?.has(p));
  const { data: freshCourierHistory } = useQuery({
    queryKey: ["courier-history", brandsKey, missingPhones.sort().join(",")],
    enabled: missingPhones.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { results } = await fetchCourierHistory({ data: { phones: missingPhones, brandId: activeBrand?.id } });
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
  // Merge cached + fresh so previously-cached rows render instantly while new phones backfill
  const courierHistory = useMemo(() => {
    const merged = new Map<string, CourierBreakdown>();
    cachedCourierHistory?.forEach((v, k) => merged.set(k, v));
    freshCourierHistory?.forEach((v, k) => merged.set(k, v));
    return merged;
  }, [cachedCourierHistory, freshCourierHistory]);

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

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMore = useCallback(() => {
    if (ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) {
      ordersQuery.fetchNextPage();
    }
  }, [ordersQuery]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadMore();
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [onLoadMore]);

  const setActiveTab = (key: WebStatus | "all") => navigate({ search: (prev: WebOrdersSearch) => ({ ...prev, tab: key }), replace: true });

  const updateFilters = (patch: Partial<{ source: string; sort: SortKey; datePreset: DatePreset; dateFrom: string | null; dateTo: string | null }>) => {
    navigate({
      search: (prev: WebOrdersSearch) => ({
        ...prev,
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.sort !== undefined ? { sort: patch.sort } : {}),
        ...(patch.datePreset !== undefined ? { preset: patch.datePreset } : {}),
        ...(patch.dateFrom !== undefined ? { from: patch.dateFrom } : {}),
        ...(patch.dateTo !== undefined ? { to: patch.dateTo } : {}),
      }),
      replace: true,
    });
  };
  const clearAllFilters = () => navigate({
    search: (prev: WebOrdersSearch) => ({ ...prev, source: "all", sort: "newest" as const, preset: "all" as const, from: null, to: null }),
    replace: true,
  });

  // ============ FEATURE 1 + 2: status mutations ============
  const invalidateWebOrders = () => {
    queryClient.invalidateQueries({ queryKey: ["web-orders-inf"] });
    queryClient.invalidateQueries({ queryKey: ["web-orders-counts"] });
  };

  const bulkStatus = useMutation({
    mutationFn: async (status: WebStatusKey) => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("orders")
        .update({ web_status: status as never })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Updated ${n} order${n === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      invalidateWebOrders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkAddTag = useMutation({
    mutationFn: async (tag: string) => {
      const ids = Array.from(selectedIds);
      const idRows = rows.filter((r) => ids.includes(r.id));
      await Promise.all(idRows.map(async (r) => {
        const next = Array.from(new Set([...(r.tags ?? []), tag]));
        await supabase.from("orders").update({ tags: next as never }).eq("id", r.id);
      }));
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`Tagged ${n} order${n === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      invalidateWebOrders();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // selection helpers — operate on currently visible filteredRows
  const visibleIds = useMemo(() => filteredRows.map(({ row }) => row.id), [filteredRows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAllVisible = (checked: boolean) => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (checked) visibleIds.forEach((id) => n.add(id));
    else visibleIds.forEach((id) => n.delete(id));
    return n;
  });
  const selectedOrderRows = rows.filter((r) => selectedIds.has(r.id));

  return (
    <div className="p-4 md:p-6">
      {/* Header — inline search */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight leading-tight">Web Orders</h1>
          <p className="text-sm text-muted-foreground truncate">
            {isAllBrands ? `All Brands (${brands.length})` : activeBrand?.name ?? "—"} · Orders from website
            {activeTab !== "incomplete" && totalRows > 0 && (
              <span className="ml-1.5">· {rows.length} of {totalRows}</span>
            )}
          </p>
        </div>
        <Input
          placeholder="Search by name or phone number…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full sm:w-[300px] h-9"
        />
      </header>

      {/* Tabs — pill style, single-row scroll */}
      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:thin]">
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
                "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  "tabular-nums inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[18px] h-[18px] px-1.5",
                  active ? "bg-white text-indigo-800" : "bg-background/80 text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter row — tags inline + dropdowns right-aligned */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-y py-1.5">
        <div className="min-w-0 flex-1">
          <TagFilterBar
            options={filterOptions}
            selected={tagFilter}
            onToggle={toggleTagFilter}
            onClear={() => setTagFilter(new Set())}
            compact
          />
        </div>
        <div className="shrink-0">
          <WebOrdersFilterBar
            state={{
              datePreset,
              dateFrom: search.from,
              dateTo: search.to,
              source: sourceFilter,
              sort,
            }}
            onChange={(patch) => updateFilters(patch)}
            onClearAll={clearAllFilters}
          />
        </div>
      </div>

      <div className="mt-2 space-y-4">

      {activeTab !== "incomplete" && (
        <WebOrdersAnalytics rows={rows} />
      )}

      {activeTab === "incomplete" ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <IncompleteOrdersTable
            brandId={activeBrand?.id ?? null}
            search={debouncedSearch}
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
              <TableHead className="w-[36px] pl-3">
                <Checkbox
                  checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAllVisible(!!v)}
                  aria-label="Select all visible"
                />
              </TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Created</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[220px]">Customer</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Note</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[240px]">Order Items</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[160px]">Success Rate</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[180px]">Tags</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[120px]">Site</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[130px]">Source</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j} className="py-2"><Skeleton className="h-10 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
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
                const flash = flashIds.has(r.id);
                const confirmRate = b.total > 0 ? Math.round((b.confirmed / b.total) * 100) : 0;
                const isSelected = selectedIds.has(r.id);
                return (
                  <TableRow
                    key={r.id}
                    className={cn(
                      "group/row cursor-pointer hover:bg-muted/30 border-b last:border-0 align-top transition-colors",
                      isSelected && "bg-blue-50/70 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/40",
                      flash && "animate-in slide-in-from-top-2 bg-emerald-50 dark:bg-emerald-950/40",
                    )}
                    onClick={() => setOpenId(r.id)}
                  >
                    {/* Select */}
                    <TableCell className="py-2 pl-3 w-[36px]" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(r.id)}
                        aria-label="Select row"
                      />
                    </TableCell>
                    {/* Created */}
                    <TableCell className="py-2">
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
                    <TableCell className="py-2">
                      <div className="max-w-[220px]">
                        <div className="min-w-0 text-xs space-y-0.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-semibold text-foreground truncate" title={name}>{name}</span>
                            {name !== "—" && <CopyIconBtn value={name} label="Name" className="shrink-0" />}
                            <CustomerBadges total={b.total} confirmRate={confirmRate} delivered={b.delivered} />
                          </div>
                          {phone && (
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-muted-foreground truncate font-mono">{phone}</span>
                              <PhoneActions phone={phone} className="shrink-0" />
                              <CallLogPopover
                                orderId={r.id}
                                currentCount={r.call_attempt_count ?? 0}
                                onSaved={invalidateWebOrders}
                              />
                            </div>
                          )}
                          {address && (
                            <div className="flex items-center gap-1 min-w-0">
                              <span
                                className="text-xs text-muted-foreground truncate leading-tight flex-1 max-w-[180px]"
                                title={address}
                              >
                                {address}
                              </span>
                              <CopyIconBtn value={address} label="Address" className="shrink-0" />
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Note */}
                    <TableCell className="py-2">
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
                    <TableCell className="py-2">
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
                                  <ProductThumb src={it.image} alt={it.name} />
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
                                    <ProductThumb src={it.image} alt={it.name} />
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
                    <TableCell className="py-2">
                      <SuccessBlock
                        total={courier.pathao.total + courier.steadfast.total || b.total}
                        success={courier.pathao.success + courier.steadfast.success || b.confirmed}
                      />
                    </TableCell>

                    {/* Tags */}
                    <TableCell className="py-2">
                      <AutoTagChips autoTags={autoTags} manualTags={r.tags} max={4} />
                    </TableCell>

                    {/* Site */}
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-1 items-start">
                        {(isAllBrands ? r.brand_id && brandNameById.get(r.brand_id) : activeBrand?.name) && (
                          <span className="inline-flex items-center rounded-md bg-primary/15 text-primary px-2 py-0.5 text-[11px] font-semibold ring-1 ring-primary/30">
                            {isAllBrands ? brandNameById.get(r.brand_id ?? "") : activeBrand?.name}
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

                    {/* Source */}
                    <TableCell className="py-2">
                      <SourcePill attribution={r.attribution} siteLabel={siteLabel} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-2 text-right">
                      <div onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 justify-end">
                        <Button asChild size="sm" variant="default" className="h-8">
                          <Link
                            to="/erp/orders/$orderId"
                            params={{ orderId: r.id }}
                            onClick={() => {
                              try {
                                sessionStorage.setItem(
                                  "order-nav-list",
                                  JSON.stringify(filteredRows.map((f) => f.row.id)),
                                );
                              } catch { /* ignore */ }
                            }}
                          >
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
        {activeTab !== "incomplete" && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {ordersQuery.isFetchingNextPage ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…</span>
            ) : ordersQuery.hasNextPage ? (
              <button onClick={onLoadMore} className="hover:text-foreground">Load more</button>
            ) : rows.length > 0 ? (
              <span>End of list · {rows.length} of {totalRows}</span>
            ) : null}
          </div>
        )}
      </div>
      )}
      </div>

      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} mode="web" />

      <WebBulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onStatus={(s) => bulkStatus.mutate(s)}
        onPrintInvoices={() => { if (selectedIds.size > 0) setPrintOpen(true); }}
        onBookCourier={() => { if (selectedIds.size > 0) setPathaoBulkOpen(true); }}
        onAddTag={(tag) => bulkAddTag.mutate(tag)}
        isPending={bulkStatus.isPending || bulkAddTag.isPending}
      />

      <BulkPrintDialog
        open={printOpen}
        onOpenChange={(o) => setPrintOpen(o)}
        mode="invoice"
        orderIds={Array.from(selectedIds)}
      />

      <PathaoBulkUploadDialog
        open={pathaoBulkOpen}
        onOpenChange={(o) => { setPathaoBulkOpen(o); if (!o) setSelectedIds(new Set()); }}
        orders={selectedOrderRows.map((r) => ({ id: r.id, invoice_no: null }))}
      />
    </div>
  );
}