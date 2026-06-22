import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Truck, PackageCheck, PackageOpen, PackagePlus, Send, Camera, Printer,
  BarChart3, Loader2, CheckCircle2, AlertCircle, Sparkles, Undo2,
  Phone, MapPin, Banknote, Package, Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { ScanInput, type ScanInputHandle } from "@/components/erp/dispatch/scan-input";
import { CameraScanner } from "@/components/erp/dispatch/camera-scanner";
import { BatchPrintDialog } from "@/components/erp/dispatch/batch-print-dialog";
import { DispatchSummary } from "@/components/erp/dispatch/dispatch-summary";
import { beepError, beepShip, beepSuccess } from "@/lib/erp/audio-feedback";

export const Route = createFileRoute("/_authenticated/erp/dispatch")({
  head: () => ({ meta: [{ title: "Dispatch — ERP" }] }),
  component: DispatchPage,
});

type Mode = "auto" | "pack" | "ready" | "ship";
type Stage = "pending" | "packed" | "ready" | "shipped";

type OrderRow = {
  id: string;
  invoice_no: string | null;
  status: string;
  total: number | null;
  payment_method: string | null;
  courier_name: string | null;
  shipping_name: string | null;
  guest_name: string | null;
  shipping_phone: string | null;
  guest_phone: string | null;
  shipping_thana: string | null;
  shipping_city: string | null;
  tracking_number: string | null;
  updated_at: string | null;
  created_at: string | null;
  packaged_at: string | null;
  items?: Array<{ name: string; variant_label: string | null; quantity: number; sku: string | null; price: number; image: string | null }>;
};

type ScanLogEntry = {
  ok: boolean;
  msg: string;
  invoice?: string;
  orderId?: string;
  fromStatus?: string;
  toStatus?: string;
  undoable?: boolean;
  at: number;
};

const PENDING_STATUSES = ["confirmed", "processing", "packaging", "ready_to_pack"] as const;

function bdt(n: number) {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}
function sum(rows: OrderRow[]) {
  return rows.reduce((s, r) => s + (r.total ?? 0), 0);
}
function isCod(o: OrderRow) {
  return (o.payment_method ?? "").toLowerCase().includes("cod");
}
function itemCount(o: OrderRow) {
  return (o.items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);
}
function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function customerName(o: OrderRow) {
  return o.shipping_name ?? o.guest_name ?? "—";
}
function customerPhone(o: OrderRow) {
  return o.shipping_phone ?? o.guest_phone ?? "";
}
function customerArea(o: OrderRow) {
  return [o.shipping_thana, o.shipping_city].filter(Boolean).join(", ");
}
function stageFor(status: string): Stage | null {
  if ((PENDING_STATUSES as readonly string[]).includes(status)) return "pending";
  if (status === "packed") return "packed";
  if (status === "ready_to_ship") return "ready";
  if (status === "shipped") return "shipped";
  return null;
}

function DispatchPage() {
  const { brandIds } = useBrand();
  const qc = useQueryClient();
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);

  const [mode, setMode] = useState<Mode>("auto");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<ScanInputHandle>(null);

  const queryKey = useMemo(() => ["dispatch-orders", brandIds] as const, [brandIds]);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: brandIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const select =
        "id, invoice_no, status, total, payment_method, courier_name, shipping_name, guest_name, shipping_phone, guest_phone, shipping_thana, shipping_city, tracking_number, updated_at, created_at, packaged_at, items:order_items(name, variant_label, quantity, sku:product_id, price, image)";

      const pending = await applyBrandScope(
        supabase.from("orders").select(select).in("status", PENDING_STATUSES as unknown as never[]),
        brandIds,
      ).order("created_at", { ascending: true }).limit(200);

      const packed = await applyBrandScope(
        supabase.from("orders").select(select).eq("status", "packed"),
        brandIds,
      ).order("packaged_at", { ascending: true }).limit(200);

      const ready = await applyBrandScope(
        supabase.from("orders").select(select).eq("status", "ready_to_ship"),
        brandIds,
      ).order("updated_at", { ascending: true }).limit(200);

      const shipped = await applyBrandScope(
        supabase
          .from("orders")
          .select(select)
          .eq("status", "shipped")
          .gte("updated_at", todayIso),
        brandIds,
      ).order("updated_at", { ascending: false }).limit(200);

      return {
        pending: (pending.data ?? []) as OrderRow[],
        packed: (packed.data ?? []) as OrderRow[],
        ready: (ready.data ?? []) as OrderRow[],
        shipped: (shipped.data ?? []) as OrderRow[],
      };
    },
  });

  // Realtime: any order change → refetch
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
  }, [brandIds, qc, queryKey]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if (inField) return;
      if (e.key === "0") setMode("auto");
      else if (e.key === "1") setMode("pack");
      else if (e.key === "2") setMode("ready");
      else if (e.key === "3") setMode("ship");
      else if (e.key.toLowerCase() === "p") setPrintOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const transition = useCallback(
    async (orderId: string, newStatus: "packed" | "ready_to_ship" | "shipped") => {
      const { error } = await supabase.rpc("transition_order_status", {
        _order_id: orderId,
        _new_status: newStatus,
        _note: `Dispatch scan (${newStatus})`,
      });
      if (error) throw error;
    },
    [],
  );

  const pushLog = useCallback((e: Omit<ScanLogEntry, "at">) => {
    setScanLog((cur) => [{ ...e, at: Date.now() }, ...cur].slice(0, 5));
  }, []);

  const handleScan = useCallback(
    async (raw: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const v = raw.trim().replace(/^#/, "");

        const { data: found, error: fErr } = await applyBrandScope(
          supabase
            .from("orders")
            .select("id, invoice_no, status, total, courier_name")
            .or(`invoice_no.eq.${v},invoice_no.ilike.%${v}%`),
          brandIds,
        ).limit(1);

        if (fErr) throw fErr;
        const order = (found ?? [])[0];
        if (!order) {
          beepError();
          pushLog({ ok: false, msg: `No order found for "${v}"` });
          return;
        }

        const inv = order.invoice_no ?? order.id.slice(0, 8);
        const stage = stageFor(order.status);

        // Resolve effective action
        let action: "pack" | "ready" | "ship" | null = null;
        if (mode === "auto") {
          if (stage === "pending") action = "pack";
          else if (stage === "packed") action = "ready";
          else if (stage === "ready") action = "ship";
        } else action = mode;

        if (!action) {
          beepError();
          pushLog({ ok: false, msg: `#${inv} status "${order.status}" — no next stage`, invoice: inv });
          return;
        }

        if (action === "pack") {
          if (stage !== "pending") {
            beepError();
            pushLog({ ok: false, msg: `#${inv} already "${order.status}"`, invoice: inv });
            return;
          }
          await transition(order.id, "packed");
          beepSuccess();
          pushLog({ ok: true, msg: `#${inv} → PACKED`, invoice: inv, orderId: order.id, fromStatus: order.status, toStatus: "packed", undoable: true });
        } else if (action === "ready") {
          if (stage !== "packed") {
            beepError();
            pushLog({ ok: false, msg: `#${inv} is "${order.status}", must be PACKED first`, invoice: inv });
            return;
          }
          await transition(order.id, "ready_to_ship");
          beepSuccess();
          pushLog({ ok: true, msg: `#${inv} → READY TO SHIP`, invoice: inv, orderId: order.id, fromStatus: "packed", toStatus: "ready_to_ship", undoable: true });
        } else if (action === "ship") {
          if (stage !== "ready") {
            beepError();
            pushLog({ ok: false, msg: `#${inv} is "${order.status}", must be READY first`, invoice: inv });
            return;
          }
          try {
            const res: any = await bookPathao({ data: { orderId: order.id } });
            await transition(order.id, "shipped");
            beepShip();
            const consign = res?.consignment ?? res?.tracking ?? "";
            pushLog({ ok: true, msg: `#${inv} → SHIPPED · Pathao ${consign}`, invoice: inv, orderId: order.id, fromStatus: "ready_to_ship", toStatus: "shipped" });
            toast.success(`#${inv} shipped`, {
              description: consign ? `Consignment: ${consign}` : "Booked with Pathao",
            });
          } catch (e: any) {
            beepError();
            pushLog({ ok: false, msg: `#${inv} booking failed: ${e?.message ?? e}`, invoice: inv });
            return;
          }
        }

        qc.invalidateQueries({ queryKey });
      } catch (e: any) {
        beepError();
        toast.error(e?.message ?? "Scan failed");
        pushLog({ ok: false, msg: e?.message ?? "Scan failed" });
      } finally {
        setBusy(false);
        scanRef.current?.focus();
      }
    },
    [brandIds, busy, mode, bookPathao, qc, queryKey, transition, pushLog],
  );

  const handleUndo = useCallback(async () => {
    const last = scanLog.find((e) => e.undoable && e.orderId && e.fromStatus);
    if (!last) return;
    try {
      const { error } = await supabase.rpc("transition_order_status", {
        _order_id: last.orderId!,
        _new_status: last.fromStatus as never,
        _note: "Dispatch undo",
      });
      if (error) throw error;
      beepSuccess();
      toast.success(`Undid #${last.invoice ?? ""} (${last.toStatus} → ${last.fromStatus})`);
      setScanLog((cur) => cur.filter((e) => e !== last));
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      beepError();
      toast.error(e?.message ?? "Undo failed");
    }
  }, [scanLog, qc, queryKey]);

  const pending = data?.pending ?? [];
  const packed = data?.packed ?? [];
  const ready = data?.ready ?? [];
  const shipped = data?.shipped ?? [];

  const codShippedValue = shipped.filter(isCod).reduce((s, o) => s + (o.total ?? 0), 0);
  const codShippedCount = shipped.filter(isCod).length;
  const canUndo = scanLog.some((e) => e.undoable);

  const modeHero: Record<Mode, { grad: string; label: string; placeholder: string; icon: React.ReactNode }> = {
    auto: {
      grad: "from-primary/15 via-primary/5 to-transparent",
      label: "AUTO — detects next stage",
      placeholder: "Scan invoice — auto advance to next stage…",
      icon: <Sparkles className="h-5 w-5" />,
    },
    pack: {
      grad: "from-amber-500/20 via-amber-500/5 to-transparent",
      label: "PACK — pending → packed",
      placeholder: "Scan to PACK pending order…",
      icon: <PackageOpen className="h-5 w-5" />,
    },
    ready: {
      grad: "from-blue-500/20 via-blue-500/5 to-transparent",
      label: "READY — packed → ready to ship",
      placeholder: "Scan to mark READY TO SHIP…",
      icon: <PackagePlus className="h-5 w-5" />,
    },
    ship: {
      grad: "from-emerald-500/20 via-emerald-500/5 to-transparent",
      label: "SHIP — book courier + ship",
      placeholder: "Scan to SHIP (auto Pathao booking)…",
      icon: <Send className="h-5 w-5" />,
    },
  };
  const hero = modeHero[mode];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Top bar */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl font-bold">Dispatch Center</h1>
            <p className="text-xs text-muted-foreground">
              0=Auto · 1=Pack · 2=Ready · 3=Ship · P=Print · Esc=Clear
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSummaryOpen(true)}>
            <BarChart3 className="h-4 w-4 mr-2" /> Summary
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
            <Printer className="h-4 w-4 mr-2" /> Print Batch
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          tone="amber"
          icon={<PackageOpen className="h-4 w-4" />}
          label="Pending"
          value={pending.length}
          sub={bdt(sum(pending))}
        />
        <KpiCard
          tone="blue"
          icon={<PackageCheck className="h-4 w-4" />}
          label="Packed today"
          value={packed.length}
          sub={bdt(sum(packed))}
        />
        <KpiCard
          tone="violet"
          icon={<PackagePlus className="h-4 w-4" />}
          label="Ready to ship"
          value={ready.length}
          sub={bdt(sum(ready))}
        />
        <KpiCard
          tone="emerald"
          icon={<Send className="h-4 w-4" />}
          label="Shipped today"
          value={shipped.length}
          sub={`${bdt(sum(shipped))} · COD ${codShippedCount}/${bdt(codShippedValue)}`}
        />
      </div>

      {/* Scan hero */}
      <Card className={`p-4 sm:p-5 border-2 bg-gradient-to-br ${hero.grad}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between mb-3">
          <div className="flex min-w-0 items-center gap-2">
            {hero.icon}
            <span className="font-semibold text-sm truncate">{hero.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as Mode)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="auto" className="gap-1"><Sparkles className="h-3.5 w-3.5" /> Auto</ToggleGroupItem>
              <ToggleGroupItem value="pack" className="gap-1"><PackageOpen className="h-3.5 w-3.5" /> Pack</ToggleGroupItem>
              <ToggleGroupItem value="ready" className="gap-1"><PackagePlus className="h-3.5 w-3.5" /> Ready</ToggleGroupItem>
              <ToggleGroupItem value="ship" className="gap-1"><Send className="h-3.5 w-3.5" /> Ship</ToggleGroupItem>
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={() => setCameraOpen(true)}>
              <Camera className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!canUndo} onClick={handleUndo}>
              <Undo2 className="h-4 w-4" />
            </Button>
            {busy && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        <ScanInput
          ref={scanRef}
          onScan={handleScan}
          disabled={busy || brandIds.length === 0}
          placeholder={hero.placeholder}
        />

        {scanLog.length > 0 && (
          <div className="mt-3 space-y-1">
            {scanLog.map((entry, i) => (
              <div
                key={`${entry.at}-${i}`}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md ${
                  entry.ok
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                } ${i === 0 ? "font-semibold" : "opacity-70"}`}
              >
                {entry.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{entry.msg}</span>
                <span className="ml-auto shrink-0 text-[10px] opacity-70">{timeAgo(new Date(entry.at).toISOString())}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Column
          title="Pending"
          icon={<PackageOpen className="h-4 w-4" />}
          tone="amber"
          rows={pending}
          loading={isLoading}
          actionLabel="Pack"
          stageKey="pending"
          onAction={(o) => handleScan(o.invoice_no ?? o.id)}
          actionEnabled={mode === "pack" || mode === "auto"}
        />
        <Column
          title="Packed"
          icon={<PackageCheck className="h-4 w-4" />}
          tone="blue"
          rows={packed}
          loading={isLoading}
          actionLabel="Mark Ready"
          stageKey="packed"
          onAction={(o) => handleScan(o.invoice_no ?? o.id)}
          actionEnabled={mode === "ready" || mode === "auto"}
        />
        <Column
          title="Ready to Ship"
          icon={<PackagePlus className="h-4 w-4" />}
          tone="violet"
          rows={ready}
          loading={isLoading}
          actionLabel="Ship + Book"
          stageKey="ready"
          onAction={(o) => handleScan(o.invoice_no ?? o.id)}
          actionEnabled={mode === "ship" || mode === "auto"}
        />
        <Column
          title="Shipped Today"
          icon={<Send className="h-4 w-4" />}
          tone="emerald"
          rows={shipped}
          loading={isLoading}
          stageKey="shipped"
          showCourier
        />
      </div>

      <CameraScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetect={(code) => {
          setCameraOpen(false);
          handleScan(code);
        }}
      />

      <BatchPrintDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        orders={[...pending, ...packed, ...ready]}
      />

      <DispatchSummary
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        shippedToday={shipped}
        packedToday={packed}
      />
    </div>
  );
}

function KpiCard({
  tone, icon, label, value, sub,
}: {
  tone: "amber" | "blue" | "violet" | "emerald";
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  const toneMap = {
    amber: "from-amber-500/15 to-transparent border-amber-500/30 text-amber-700 dark:text-amber-300",
    blue: "from-blue-500/15 to-transparent border-blue-500/30 text-blue-700 dark:text-blue-300",
    violet: "from-violet-500/15 to-transparent border-violet-500/30 text-violet-700 dark:text-violet-300",
    emerald: "from-emerald-500/15 to-transparent border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <Card className={`p-3 bg-gradient-to-br ${toneMap[tone]} border`}>
      <div className="flex items-center gap-2 text-xs font-medium">
        {icon} <span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1 text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </Card>
  );
}

function Column({
  title,
  icon,
  tone,
  rows,
  loading,
  actionLabel,
  onAction,
  actionEnabled,
  showCourier,
  stageKey,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "amber" | "blue" | "violet" | "emerald";
  rows: OrderRow[];
  loading: boolean;
  actionLabel?: string;
  onAction?: (o: OrderRow) => void;
  actionEnabled?: boolean;
  showCourier?: boolean;
  stageKey: Stage;
}) {
  const toneMap = {
    amber: "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20",
    blue: "border-blue-300 bg-blue-50/50 dark:bg-blue-950/20",
    violet: "border-violet-300 bg-violet-50/50 dark:bg-violet-950/20",
    emerald: "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20",
  };
  const codCount = rows.filter(isCod).length;

  function stageTime(o: OrderRow) {
    if (stageKey === "pending") return o.created_at;
    if (stageKey === "packed") return o.packaged_at ?? o.updated_at;
    return o.updated_at;
  }

  return (
    <Card className={`p-3 border-t-4 ${toneMap[tone]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold min-w-0">
          {icon} {title}
        </div>
        <div className="flex items-center gap-1.5">
          {codCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-300">
              <Banknote className="h-3 w-3" /> {codCount}
            </Badge>
          )}
          <Badge variant="outline">
            {rows.length} · {bdt(sum(rows))}
          </Badge>
        </div>
      </div>
      <ScrollArea className="h-[480px] pr-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">— empty —</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((o) => {
              const phone = customerPhone(o);
              const area = customerArea(o);
              const items = itemCount(o);
              const cod = isCod(o);
              return (
                <div
                  key={o.id}
                  className="border rounded-md p-2 bg-background text-sm hover:border-foreground/30 transition-colors"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-semibold">
                          {o.invoice_no ?? o.id.slice(0, 8)}
                        </span>
                        {cod ? (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-400 text-emerald-700 dark:text-emerald-300">COD</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] h-4 px-1">PAID</Badge>
                        )}
                        <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5">
                          <Package className="h-2.5 w-2.5" />{items}
                        </Badge>
                      </div>
                      <div className="truncate text-xs font-medium mt-0.5">
                        {customerName(o)}
                      </div>
                      {phone && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                          <Phone className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{phone}</span>
                        </div>
                      )}
                      {area && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{area}</span>
                        </div>
                      )}
                      {showCourier && o.courier_name && (
                        <div className="text-[10px] font-mono mt-0.5 text-emerald-700 dark:text-emerald-300 truncate">
                          {o.courier_name} · {o.tracking_number ?? "—"}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold">{bdt(o.total ?? 0)}</div>
                      <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />{timeAgo(stageTime(o))}
                      </div>
                      {actionLabel && onAction && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] mt-1 px-2"
                          disabled={!actionEnabled}
                          onClick={() => onAction(o)}
                        >
                          {actionLabel}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}