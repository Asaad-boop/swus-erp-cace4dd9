import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PackageCheck, Printer, BarChart3, Eye, ArrowRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ScanInput, type ScanMode } from "@/components/erp/dispatch/scan-input";
import { CameraScanner } from "@/components/erp/dispatch/camera-scanner";
import { DispatchSummary } from "@/components/erp/dispatch/dispatch-summary";
import { BatchPrintDialog, type PrintScope, type PrintType } from "@/components/erp/dispatch/batch-print-dialog";
import { PickingListPrint } from "@/components/erp/dispatch/picking-list-print";
import { PrintableInvoice } from "@/components/erp/orders/order-invoice";
import { playBeep } from "@/lib/erp/audio-feedback";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";

export const Route = createFileRoute("/_authenticated/erp/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch — ERP" }] }),
  component: DispatchPage,
});

const PENDING_STATUSES = ["confirmed", "processing", "packaging", "ready_to_pack"] as const;

type OrderRow = {
  id: string;
  invoice_no: string | null;
  status: string;
  brand_id: string | null;
  total: number | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_thana: string | null;
  shipping_city: string | null;
  pathao_city_id: number | null;
  pathao_zone_id: number | null;
  created_at: string;
  updated_at: string | null;
  items: { name: string; quantity: number; sku?: string | null }[];
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DispatchPage() {
  const qc = useQueryClient();
  const { brandIds, activeBrand } = useBrand();
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);

  const [mode, setMode] = useState<ScanMode>("pack");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string; sub?: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printing, setPrinting] = useState<{ orders: OrderRow[]; type: PrintType } | null>(null);
  const [busy, setBusy] = useState(false);
  const feedbackTimer = useRef<number | null>(null);

  const queryKey = useMemo(() => ["dispatch", brandIds.join(",")], [brandIds]);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const todayIso = startOfTodayIso();
      const select = "id, invoice_no, status, brand_id, total, shipping_name, shipping_phone, shipping_address, shipping_thana, shipping_city, pathao_city_id, pathao_zone_id, created_at, updated_at, items:order_items(name, quantity, sku)";

      const allStatuses = [...PENDING_STATUSES, "packed", "ready_to_ship"];
      const pendingQ = applyBrandScope(
        supabase.from("orders").select(select).in("status", allStatuses).order("created_at", { ascending: false }).limit(500),
        brandIds,
      );
      const shippedQ = applyBrandScope(
        supabase.from("orders").select(select).eq("status", "shipped").gte("updated_at", todayIso).order("updated_at", { ascending: false }).limit(200),
        brandIds,
      );
      const courierQ = applyBrandScope(
        supabase.from("courier_shipments").select("provider, order_id, created_at, orders!inner(brand_id, total, updated_at, status)").gte("created_at", todayIso).limit(500),
        brandIds,
        "orders.brand_id",
      );

      const [pending, shipped] = await Promise.all([pendingQ, shippedQ]);
      if (pending.error) throw pending.error;
      if (shipped.error) throw shipped.error;
      // courier breakdown best-effort (don't fail page if RLS blocks)
      let courier: { provider: string; total: number }[] = [];
      try {
        const cRes = await courierQ;
        if (!cRes.error && cRes.data) {
          courier = (cRes.data as any[]).map((r) => ({
            provider: r.provider || "unknown",
            total: Number(r.orders?.total) || 0,
          }));
        }
      } catch { /* ignore */ }

      return {
        pending: (pending.data ?? []) as OrderRow[],
        shipped: (shipped.data ?? []) as OrderRow[],
        courier,
      };
    },
    refetchOnWindowFocus: false,
  });

  // Realtime subscription
  useEffect(() => {
    if (brandIds.length === 0) return;
    const ch = supabase
      .channel("dispatch-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, queryKey, brandIds]);

  const columns = useMemo(() => {
    const all = data?.pending ?? [];
    return {
      pending: all.filter((o) => (PENDING_STATUSES as readonly string[]).includes(o.status)),
      packed: all.filter((o) => o.status === "packed"),
      ready: all.filter((o) => o.status === "ready_to_ship"),
      shipped: data?.shipped ?? [],
    };
  }, [data]);

  const showFeedback = (kind: "ok" | "err", msg: string, sub?: string) => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    setFeedback({ kind, msg, sub });
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 3000) as unknown as number;
  };

  const findOrder = async (raw: string): Promise<OrderRow | null> => {
    const v = raw.trim();
    if (!v) return null;
    const all = [...columns.pending, ...columns.packed, ...columns.ready, ...columns.shipped];
    const local = all.find(
      (o) =>
        (o.invoice_no && o.invoice_no.toUpperCase() === v.toUpperCase()) ||
        shortId(o.id) === v.toUpperCase().replace(/^#/, ""),
    );
    if (local) return local;
    // Fallback: DB lookup
    const select = "id, invoice_no, status, brand_id, total, shipping_name, shipping_phone, shipping_address, shipping_thana, shipping_city, pathao_city_id, pathao_zone_id, created_at, updated_at, items:order_items(name, quantity, sku)";
    const stripped = v.replace(/^#/, "").toLowerCase();
    const q = applyBrandScope(
      supabase.from("orders").select(select).or(`invoice_no.eq.${v},id::text.ilike.${stripped}%`).limit(1),
      brandIds,
    );
    const { data: rows } = await q;
    return ((rows as OrderRow[]) ?? [])[0] ?? null;
  };

  const handleScan = async (raw: string) => {
    setBusy(true);
    try {
      const order = await findOrder(raw);
      if (!order) {
        playBeep("error");
        showFeedback("err", "Order not found");
        return;
      }
      if (mode === "pack") {
        if (!(PENDING_STATUSES as readonly string[]).includes(order.status)) {
          playBeep("error");
          showFeedback("err", `Wrong status: ${order.status}`, "Expected: confirmed/processing");
          return;
        }
        const { error } = await supabase.rpc("transition_order_status", { _order_id: order.id, _new_status: "packed" });
        if (error) throw error;
        playBeep("success");
        showFeedback("ok", `#${shortId(order.id)} — ${order.shipping_name ?? "Customer"}`, `${order.status} → PACKED ✓`);
      } else if (mode === "ready") {
        if (order.status !== "packed") {
          playBeep("error");
          showFeedback("err", `Wrong status: ${order.status}`, "Expected: packed");
          return;
        }
        const { error } = await supabase.rpc("transition_order_status", { _order_id: order.id, _new_status: "ready_to_ship" });
        if (error) throw error;
        playBeep("success");
        showFeedback("ok", `#${shortId(order.id)} — ${order.shipping_name ?? "Customer"}`, "packed → READY ✓");
      } else {
        if (order.status !== "ready_to_ship") {
          playBeep("error");
          showFeedback("err", `Wrong status: ${order.status}`, "Expected: ready_to_ship");
          return;
        }
        if (!order.pathao_city_id || !order.pathao_zone_id) {
          playBeep("error");
          showFeedback("err", "Pathao city/zone not set", `Open order #${shortId(order.id)} to set`);
          window.open(`/erp/orders/${order.id}`, "_blank");
          return;
        }
        const res = await bookPathao({ data: { orderId: order.id } });
        playBeep("ship");
        showFeedback("ok", `#${shortId(order.id)} SHIPPED ✓`, `Consignment: ${(res as any)?.consignment ?? "—"}`);
      }
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      playBeep("error");
      showFeedback("err", e?.message || "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  const nextStage = async (o: OrderRow) => {
    if ((PENDING_STATUSES as readonly string[]).includes(o.status)) {
      setMode("pack");
    } else if (o.status === "packed") {
      setMode("ready");
    } else if (o.status === "ready_to_ship") {
      setMode("ship");
    }
    await handleScan(o.invoice_no || shortId(o.id));
  };

  // Print
  const startPrint = (scopes: PrintScope[], type: PrintType) => {
    const buckets: Record<PrintScope, OrderRow[]> = {
      pending: columns.pending,
      packed: columns.packed,
      ready: columns.ready,
    };
    const orders = scopes.flatMap((s) => buckets[s]);
    if (orders.length === 0) return;
    setPrintOpen(false);
    setPrinting({ orders, type });
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(null), 800);
    }, 100);
  };

  const printSingleOrder = (o: OrderRow) => {
    setPrinting({ orders: [o], type: "invoice" });
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrinting(null), 800);
    }, 100);
  };

  // Summary stats
  const stats = useMemo(() => {
    const sum = (arr: OrderRow[]) => arr.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const courierMap = new Map<string, { count: number; total: number }>();
    for (const c of data?.courier ?? []) {
      const k = c.provider || "manual";
      const cur = courierMap.get(k) ?? { count: 0, total: 0 };
      cur.count += 1; cur.total += c.total;
      courierMap.set(k, cur);
    }
    const pathao = courierMap.get("pathao") ?? { count: 0, total: 0 };
    const manual = Array.from(courierMap.entries())
      .filter(([k]) => k !== "pathao")
      .reduce((acc, [, v]) => ({ count: acc.count + v.count, total: acc.total + v.total }), { count: 0, total: 0 });

    const productMap = new Map<string, number>();
    for (const o of [...columns.packed, ...columns.ready, ...columns.shipped]) {
      for (const it of o.items ?? []) {
        productMap.set(it.name, (productMap.get(it.name) ?? 0) + (Number(it.quantity) || 0));
      }
    }
    const topProducts = Array.from(productMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    return {
      pendingCount: columns.pending.length, pendingValue: sum(columns.pending),
      packedCount: columns.packed.length, packedValue: sum(columns.packed),
      readyCount: columns.ready.length, readyValue: sum(columns.ready),
      shippedCount: columns.shipped.length, shippedValue: sum(columns.shipped),
      pathaoCount: pathao.count, pathaoValue: pathao.total,
      manualCount: manual.count, manualValue: manual.total,
      topProducts,
    };
  }, [columns, data?.courier]);

  const exportCsv = () => {
    const rows = [["Order", "Status", "Customer", "Phone", "Total"]];
    for (const list of [columns.pending, columns.packed, columns.ready, columns.shipped]) {
      for (const o of list) {
        rows.push([
          `#${o.invoice_no || shortId(o.id)}`,
          o.status,
          o.shipping_name ?? "",
          o.shipping_phone ?? "",
          String(o.total ?? ""),
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispatch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-indigo-600" /> Dispatch Center
          </h1>
          <p className="text-sm text-slate-500">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">{stats.pendingCount} pending</Badge>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{stats.packedCount} packed</Badge>
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{stats.readyCount} ready</Badge>
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{stats.shippedCount} shipped</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSummaryOpen(true)}>
            <BarChart3 className="h-4 w-4 mr-1" /> Summary
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
            <Printer className="h-4 w-4 mr-1" /> Print Batch
          </Button>
        </div>
      </div>

      {/* Scan input */}
      <ScanInput mode={mode} onModeChange={setMode} onScan={handleScan} onOpenCamera={() => setCameraOpen(true)} busy={busy} />

      {/* Feedback */}
      {feedback && (
        <div
          className={cn(
            "rounded-lg border-2 p-3 flex items-start gap-3",
            feedback.kind === "ok" ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300",
          )}
        >
          {feedback.kind === "ok" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
          )}
          <div>
            <div className={cn("font-semibold", feedback.kind === "ok" ? "text-emerald-900" : "text-red-900")}>
              {feedback.msg}
            </div>
            {feedback.sub && <div className="text-sm text-slate-700">{feedback.sub}</div>}
          </div>
        </div>
      )}

      {/* 3-column pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Column title="📦 PENDING" count={columns.pending.length} orders={columns.pending} color="gray" nextLabel="Mark Packed" onNext={nextStage} onPrint={printSingleOrder} loading={isLoading} />
        <Column title="📫 PACKED" count={columns.packed.length} orders={columns.packed} color="amber" nextLabel="Mark Ready" onNext={nextStage} onPrint={printSingleOrder} loading={isLoading} />
        <Column title="🚀 READY TO SHIP" count={columns.ready.length} orders={columns.ready} color="emerald" nextLabel="Book & Ship" onNext={nextStage} onPrint={printSingleOrder} loading={isLoading} />
      </div>

      {/* Modals */}
      <CameraScanner open={cameraOpen} onClose={() => setCameraOpen(false)} onDetect={(v) => handleScan(v)} />
      <DispatchSummary open={summaryOpen} onOpenChange={setSummaryOpen} stats={stats} dateLabel={dateLabel} onExportCsv={exportCsv} />
      <BatchPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        counts={{ pending: columns.pending.length, packed: columns.packed.length, ready: columns.ready.length }}
        onPrint={startPrint}
      />

      {/* Hidden print region */}
      {printing && (
        <div className="hidden print:block">
          {(printing.type === "invoice" || printing.type === "both") &&
            printing.orders.map((o) => (
              <PrintableInvoice key={`inv-${o.id}`} order={o as any} items={(o.items ?? []) as any} bulk />
            ))}
          {(printing.type === "picking" || printing.type === "both") && (
            <PickingListPrint orders={printing.orders as any} />
          )}
        </div>
      )}
      {busy && (
        <div className="fixed bottom-6 right-6 bg-white shadow-lg rounded-full p-3 border">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        </div>
      )}
    </div>
  );
}

function Column({
  title, count, orders, color, nextLabel, onNext, onPrint, loading,
}: {
  title: string;
  count: number;
  orders: OrderRow[];
  color: "gray" | "amber" | "emerald" | "blue";
  nextLabel: string;
  onNext: (o: OrderRow) => void;
  onPrint: (o: OrderRow) => void;
  loading: boolean;
}) {
  const borderColor = {
    gray: "border-l-slate-400",
    amber: "border-l-amber-500",
    emerald: "border-l-emerald-500",
    blue: "border-l-blue-500",
  }[color];
  return (
    <div className="rounded-xl border bg-slate-50 p-3 min-h-[400px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="outline" className="bg-white">{count}</Badge>
      </div>
      <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
        {loading && orders.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">Loading…</div>
        )}
        {!loading && orders.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">No orders</div>
        )}
        {orders.map((o) => (
          <div key={o.id} className={cn("rounded-lg bg-white border-l-4 shadow-sm p-3 space-y-1 text-sm", borderColor)}>
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold">#{o.invoice_no || shortId(o.id)}</span>
              {typeof o.total === "number" && (
                <span className="font-semibold tabular-nums">৳{Math.round(o.total).toLocaleString()}</span>
              )}
            </div>
            <div className="text-slate-700 truncate">
              {o.shipping_name ?? "—"} {o.shipping_phone && <span className="text-slate-400">· {o.shipping_phone}</span>}
            </div>
            {o.items?.length > 0 && (
              <div className="text-xs text-slate-500 truncate">
                {o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
              </div>
            )}
            {(o.shipping_thana || o.shipping_city) && (
              <div className="text-xs text-slate-500 truncate">📍 {[o.shipping_thana, o.shipping_city].filter(Boolean).join(", ")}</div>
            )}
            <div className="text-xs text-slate-400">⏱️ {timeAgo(o.created_at)}</div>
            <div className="flex items-center gap-1 pt-2 border-t">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onPrint(o)}>
                <Printer className="h-3 w-3 mr-1" /> Print
              </Button>
              <Button size="sm" className="h-7 px-2 text-xs flex-1" onClick={() => onNext(o)}>
                {nextLabel} <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(`/erp/orders/${o.id}`, "_blank")}>
                <Eye className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}