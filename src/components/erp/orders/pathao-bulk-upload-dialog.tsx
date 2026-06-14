import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, X as XIcon, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pathaoBookOrderAutoFn } from "@/lib/erp/pathao.functions";
import { invoiceDisplay, type OrderRow } from "@/lib/erp/orders";

type RowStatus = "pending" | "uploading" | "success" | "failed" | "skipped";

type Row = {
  orderId: string;
  display: string;
  status: RowStatus;
  tracking: string | null;
  message: string;
  ms: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orders: Pick<OrderRow, "id" | "invoice_no">[];
};

export function PathaoBulkUploadDialog({ open, onOpenChange, orders }: Props) {
  const bookFn = useServerFn(pathaoBookOrderAutoFn);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  // Initialise queue + run on open
  useEffect(() => {
    if (!open) return;
    const initial: Row[] = orders.map((o) => ({
      orderId: o.id,
      display: invoiceDisplay(o),
      status: "pending",
      tracking: null,
      message: "Waiting…",
      ms: 0,
    }));
    setRows(initial);
    setDone(false);
    setRunning(true);
    cancelRef.current = false;

    (async () => {
      for (let i = 0; i < initial.length; i++) {
        if (cancelRef.current) break;
        const o = initial[i];
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "uploading", message: "Uploading…" } : r)));
        const t0 = Date.now();
        try {
          const res = (await bookFn({ data: { orderId: o.orderId } })) as {
            consignment?: string | null;
            tracking?: string | null;
            skipped?: boolean;
            message?: string;
          };
          const ms = Date.now() - t0;
          const tracking = res.tracking || res.consignment || null;
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: res.skipped ? "skipped" : "success",
                    tracking,
                    message: res.skipped ? (res.message ?? "Already booked") : "Upload successful",
                    ms,
                  }
                : r,
            ),
          );
        } catch (e) {
          const ms = Date.now() - t0;
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: "failed", message: (e as Error).message || "Failed", ms } : r,
            ),
          );
        }
      }
      setRunning(false);
      setDone(true);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["courier-shipments"] });
    })();

    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = rows.length;
  const finishedRows = rows.filter((r) => r.status === "success" || r.status === "failed" || r.status === "skipped");
  const completed = finishedRows.length;
  const success = rows.filter((r) => r.status === "success" || r.status === "skipped").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const avgMs = finishedRows.length > 0 ? finishedRows.reduce((s, r) => s + r.ms, 0) / finishedRows.length : 0;
  const avgSec = (avgMs / 1000).toFixed(1);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && running) return; // block close while running
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4 text-emerald-600" />
              Pathao Upload Progress
            </DialogTitle>
            <StatusPill done={done} running={running} failed={failed} />
          </div>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold tabular-nums">{pct}%</span>
            <span className="text-muted-foreground tabular-nums">
              Progress: <span className="font-semibold text-foreground">{completed}</span> / {total}
              {avgMs > 0 && <> (Avg: {avgSec}s per order)</>}
            </span>
          </div>
          <Progress value={pct} className="h-2.5 [&>div]:bg-emerald-500" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{avgMs > 0 ? `Average upload time: ${avgSec}s per order` : "Preparing…"}</span>
            <span className="space-x-3">
              <span className="text-emerald-600 font-semibold">Success: {success}</span>
              <span className={cn("font-semibold", failed > 0 ? "text-red-600" : "text-muted-foreground")}>
                Failed: {failed}
              </span>
            </span>
          </div>
        </div>

        <div className="mx-5 mb-4 rounded-lg border overflow-hidden bg-card">
          <div className="grid grid-cols-[1.1fr_0.8fr_1.1fr_1.4fr_0.5fr] px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted/40 border-b">
            <div>Order ID</div>
            <div>Status</div>
            <div>Tracking ID</div>
            <div>Message</div>
            <div className="text-right">Time</div>
          </div>
          <div className="max-h-[320px] overflow-y-auto divide-y">
            {rows.map((r) => (
              <RowItem key={r.orderId} row={r} />
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-t bg-muted/30 flex justify-end gap-2">
          {running ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusPill({ done, running, failed }: { done: boolean; running: boolean; failed: number }) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
        <Loader2 className="h-3 w-3 animate-spin" /> Uploading
      </span>
    );
  }
  if (done && failed === 0) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </span>
    );
  }
  if (done && failed > 0) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 text-[11px] font-semibold">
        <XCircle className="h-3 w-3" /> Completed with errors
      </span>
    );
  }
  return null;
}

function RowItem({ row }: { row: Row }) {
  return (
    <div className="grid grid-cols-[1.1fr_0.8fr_1.1fr_1.4fr_0.5fr] items-center px-3 py-2 text-xs">
      <div className="font-mono font-semibold truncate pr-2">{row.display}</div>
      <div>
        <StatusBadge status={row.status} />
      </div>
      <div className="pr-2">
        {row.tracking ? (
          <span className="inline-flex items-center h-5 px-2 rounded-full bg-emerald-500 text-white font-mono text-[10px] font-bold">
            {row.tracking}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div
        className={cn(
          "truncate pr-2",
          row.status === "failed" ? "text-red-600" : "text-muted-foreground",
        )}
        title={row.message}
      >
        {row.message}
      </div>
      <div className="text-right text-muted-foreground tabular-nums">
        {row.ms > 0 ? `${(row.ms / 1000).toFixed(1)}s` : ""}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; cls: string; icon?: React.ReactNode }> = {
    pending: { label: "PENDING", cls: "bg-muted text-muted-foreground" },
    uploading: {
      label: "UPLOADING",
      cls: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
      icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
    },
    success: {
      label: "SUCCESS",
      cls: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    skipped: {
      label: "SKIPPED",
      cls: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
    },
    failed: {
      label: "FAILED",
      cls: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
      icon: <XIcon className="h-2.5 w-2.5" />,
    },
  };
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-bold tracking-wider", m.cls)}>
      {m.icon}
      {m.label}
    </span>
  );
}