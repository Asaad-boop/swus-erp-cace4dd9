import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Eye, Phone, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  guest_name: string | null;
  guest_phone: string | null;
  latest_note: string | null;
  customer_note: string | null;
  tags: string[] | null;
  source_website: string | null;
  auto_call_enabled: boolean | null;
  web_status: WebStatus | null;
  total: number;
  call_attempt_count: number | null;
  call_status: string | null;
  brand_id: string | null;
  items_summary?: { name: string; quantity: number }[];
};

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
          "id,created_at,shipping_name,shipping_phone,guest_name,guest_phone,latest_note,customer_note,tags,source_website,auto_call_enabled,web_status,total,call_attempt_count,call_status,brand_id",
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
          .select("order_id,name,quantity")
          .in("order_id", ids);
        const byOrder = new Map<string, { name: string; quantity: number }[]>();
        (items ?? []).forEach((it) => {
          const arr = byOrder.get(it.order_id) ?? [];
          arr.push({ name: it.name ?? "—", quantity: it.quantity ?? 0 });
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

  const successRate = (r: WebOrderRow) => {
    const attempts = r.call_attempt_count ?? 0;
    if (attempts === 0) return { pct: 0, label: "—" };
    const success = r.call_status === "customer_confirmed" || r.call_status === "reached" ? 1 : 0;
    return { pct: Math.round((success / Math.max(attempts, 1)) * 100), label: `${success}/${attempts}` };
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

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase">Created At</TableHead>
              <TableHead className="text-xs uppercase">Auto Call</TableHead>
              <TableHead className="text-xs uppercase">Customer</TableHead>
              <TableHead className="text-xs uppercase">Note</TableHead>
              <TableHead className="text-xs uppercase">Order Items</TableHead>
              <TableHead className="text-xs uppercase">Success Rate</TableHead>
              <TableHead className="text-xs uppercase">Tags</TableHead>
              <TableHead className="text-xs uppercase">Site</TableHead>
              <TableHead className="text-xs uppercase text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  No web orders in this status
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const sr = successRate(r);
                const name = r.shipping_name ?? r.guest_name ?? "—";
                const phone = r.shipping_phone ?? r.guest_phone ?? "";
                const note = r.latest_note ?? r.customer_note ?? "";
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(r.id)}>
                    <TableCell className="text-xs whitespace-nowrap">
                      <div>{format(new Date(r.created_at), "dd MMM yy")}</div>
                      <div className="text-muted-foreground">{format(new Date(r.created_at), "hh:mm a")}</div>
                    </TableCell>
                    <TableCell>
                      {r.auto_call_enabled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <Phone className="h-3.5 w-3.5" /> On
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <PhoneOff className="h-3.5 w-3.5" /> Off
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm min-w-[150px]">
                      <div className="font-medium truncate">{name}</div>
                      <div className="text-xs text-muted-foreground">{phone}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                      {note || "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px]">
                      {(r.items_summary ?? []).slice(0, 3).map((it, i) => (
                        <div key={i} className="truncate">
                          <span className="font-medium">{it.quantity}×</span> {it.name}
                        </div>
                      ))}
                      {(r.items_summary?.length ?? 0) > 3 && (
                        <div className="text-muted-foreground">+{(r.items_summary!.length - 3)} more</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        <div className="font-semibold">{sr.pct}%</div>
                        <div className="text-muted-foreground">{sr.label}</div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[140px]">
                      <div className="flex flex-wrap gap-1">
                        {(r.tags ?? []).slice(0, 2).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
                        ))}
                        {(r.tags?.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {r.source_website ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
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