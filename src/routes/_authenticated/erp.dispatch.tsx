import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Truck, PackageCheck, PackageOpen, PackagePlus, Send, Camera, Printer,
  BarChart3, Loader2, CheckCircle2, AlertCircle,
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

type Mode = "pack" | "ready" | "ship";
type OrderRow = {
  id: string;
  invoice_no: string | null;
  status: string;
  total: number | null;
  payment_method: string | null;
  courier_name: string | null;
  shipping_name: string | null;
  guest_name: string | null;
  tracking_number: string | null;
  updated_at: string | null;
  items?: Array<{ name: string; variant_label: string | null; quantity: number; sku: string | null; price: number; image: string | null }>;
};

const PENDING_STATUSES = ["confirmed", "processing", "packaging", "ready_to_pack"] as const;

function bdt(n: number) {
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}
function sum(rows: OrderRow[]) {
  return rows.reduce((s, r) => s + (r.total ?? 0), 0);
}

function DispatchPage() {
  const { brandIds } = useBrand();
  const qc = useQueryClient();
  const bookPathao = useServerFn(pathaoBookOrderAutoFn);

  const [mode, setMode] = useState<Mode>("pack");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [lastScan, setLastScan] = useState<{ ok: boolean; msg: string; invoice?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<ScanInputHandle>(null);

  const queryKey = useMemo(() => ["dispatch-orders", brandIds] as const, [brandIds]);

  const { data, isLoading } = useQuery({
    queryKey,
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const select =
        "id, invoice_no, status, total, payment_method, courier_name, shipping_name, guest_name, tracking_number, updated_at, items:order_items(name, variant_label, quantity, sku:product_id, price, image)";

      const pending = await applyBrandScope(
        supabase.from("orders").select(select).in("status", PENDING_STATUSES as unknown as string[]),
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
      if (e.key === "1") setMode("pack");
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

  const handleScan = useCallback(
    async (raw: string) => {
      if (busy) return;
      setBusy(true);
      try {
        // Normalize — accept invoice number, with or without prefix
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
          setLastScan({ ok: false, msg: `No order found for "${v}"` });
          return;
        }

        const inv = order.invoice_no ?? order.id.slice(0, 8);

        if (mode === "pack") {
          if (!(PENDING_STATUSES as readonly string[]).includes(order.status)) {
            beepError();
            setLastScan({ ok: false, msg: `#${inv} is "${order.status}", not pending`, invoice: inv });
            return;
          }
          await transition(order.id, "packed");
          beepSuccess();
          setLastScan({ ok: true, msg: `#${inv} → PACKED`, invoice: inv });
        } else if (mode === "ready") {
          if (order.status !== "packed") {
            beepError();
            setLastScan({ ok: false, msg: `#${inv} is "${order.status}", must be PACKED first`, invoice: inv });
            return;
          }
          await transition(order.id, "ready_to_ship");
          beepSuccess();
          setLastScan({ ok: true, msg: `#${inv} → READY TO SHIP`, invoice: inv });
        } else if (mode === "ship") {
          if (order.status !== "ready_to_ship") {
            beepError();
            setLastScan({ ok: false, msg: `#${inv} is "${order.status}", must be READY first`, invoice: inv });
            return;
          }
          // Auto-book courier
          try {
            const res: any = await bookPathao({ data: { orderId: order.id } });
            await transition(order.id, "shipped");
            beepShip();
            const consign = res?.consignment ?? res?.tracking ?? "";
            setLastScan({
              ok: true,
              msg: `#${inv} → SHIPPED · Pathao ${consign}`,
              invoice: inv,
            });
            toast.success(`#${inv} shipped`, {
              description: consign ? `Consignment: ${consign}` : "Booked with Pathao",
            });
          } catch (e: any) {
            beepError();
            setLastScan({ ok: false, msg: `#${inv} booking failed: ${e?.message ?? e}`, invoice: inv });
            return;
          }
        }

        qc.invalidateQueries({ queryKey });
      } catch (e: any) {
        beepError();
        toast.error(e?.message ?? "Scan failed");
        setLastScan({ ok: false, msg: e?.message ?? "Scan failed" });
      } finally {
        setBusy(false);
        scanRef.current?.focus();
      }
    },
    [brandIds, busy, mode, bookPathao, qc, queryKey, transition],
  );

  const pending = data?.pending ?? [];
  const packed = data?.packed ?? [];
  const ready = data?.ready ?? [];
  const shipped = data?.shipped ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Truck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Dispatch Center</h1>
            <p className="text-sm text-muted-foreground">
              Scan to advance · Shortcuts: 1=Pack 2=Ready 3=Ship P=Print
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            Today shipped: {shipped.length} · {bdt(sum(shipped))}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setSummaryOpen(true)}>
            <BarChart3 className="h-4 w-4 mr-2" /> Summary
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
            <Printer className="h-4 w-4 mr-2" /> Print Batch
          </Button>
        </div>
      </div>

      {/* Mode + scan */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            variant="outline"
          >
            <ToggleGroupItem value="pack" className="gap-2"><PackageOpen className="h-4 w-4" /> Pack</ToggleGroupItem>
            <ToggleGroupItem value="ready" className="gap-2"><PackagePlus className="h-4 w-4" /> Ready</ToggleGroupItem>
            <ToggleGroupItem value="ship" className="gap-2"><Send className="h-4 w-4" /> Ship</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" onClick={() => setCameraOpen(true)}>
            <Camera className="h-4 w-4 mr-2" /> Camera
          </Button>
          {busy && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>

        <ScanInput
          ref={scanRef}
          onScan={handleScan}
          disabled={busy || brandIds.length === 0}
          placeholder={
            mode === "pack"
              ? "Scan to PACK pending order…"
              : mode === "ready"
                ? "Scan to mark READY TO SHIP…"
                : "Scan to SHIP (auto Pathao booking)…"
          }
        />

        {lastScan && (
          <div
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md ${
              lastScan.ok
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
            }`}
          >
            {lastScan.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{lastScan.msg}</span>
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
          onAction={(o) => handleScan(o.invoice_no ?? o.id)}
          actionEnabled={mode === "pack"}
        />
        <Column
          title="Packed"
          icon={<PackageCheck className="h-4 w-4" />}
          tone="blue"
          rows={packed}
          loading={isLoading}
          actionLabel="Mark Ready"
          onAction={(o) => handleScan(o.invoice_no ?? o.id)}
          actionEnabled={mode === "ready"}
        />
        <Column
          title="Ready to Ship"
          icon={<PackagePlus className="h-4 w-4" />}
          tone="violet"
          rows={ready}
          loading={isLoading}
          actionLabel="Ship + Book"
          onAction={(o) => handleScan(o.invoice_no ?? o.id)}
          actionEnabled={mode === "ship"}
        />
        <Column
          title="Shipped Today"
          icon={<Send className="h-4 w-4" />}
          tone="emerald"
          rows={shipped}
          loading={isLoading}
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
}) {
  const toneMap = {
    amber: "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20",
    blue: "border-blue-300 bg-blue-50/50 dark:bg-blue-950/20",
    violet: "border-violet-300 bg-violet-50/50 dark:bg-violet-950/20",
    emerald: "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20",
  };
  return (
    <Card className={`p-3 border-t-4 ${toneMap[tone]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold">
          {icon} {title}
        </div>
        <Badge variant="outline">
          {rows.length} · {bdt(sum(rows))}
        </Badge>
      </div>
      <ScrollArea className="h-[460px] pr-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">— empty —</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((o) => (
              <div key={o.id} className="border rounded-md p-2 bg-background text-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold">
                      {o.invoice_no ?? o.id.slice(0, 8)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {o.shipping_name ?? o.guest_name ?? "—"}
                    </div>
                    {showCourier && o.courier_name && (
                      <div className="text-[10px] font-mono mt-0.5 text-emerald-700 dark:text-emerald-300">
                        {o.courier_name} · {o.tracking_number ?? "—"}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold">{bdt(o.total ?? 0)}</div>
                    {actionLabel && onAction && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] mt-1"
                        disabled={!actionEnabled}
                        onClick={() => onAction(o)}
                      >
                        {actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}