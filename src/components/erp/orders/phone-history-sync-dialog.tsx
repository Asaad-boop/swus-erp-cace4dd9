import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowRight, Phone, CheckCircle2, XCircle, AlertCircle, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/contexts/brand-context";
import { ORDER_STATUSES, statusBadge, type OrderStatus } from "@/lib/erp/orders";
import { fetchCourierHistoryFn } from "@/lib/erp/courier-history.functions";
import { syncCourierStatusFn, type CourierSyncResult } from "@/lib/erp/courier-sync.functions";
import type { CourierProvider } from "@/lib/erp/courier-status-mapping";

type OrderInput = {
  id: string;
  invoice_no: string | null;
  customer: string | null;
  phone: string | null;
  status: OrderStatus;
};

type RowState = {
  order: OrderInput;
  loading: boolean;
  total: number;
  success: number;
  cancelled: number;
  suggested: OrderStatus | null;
  override: OrderStatus | null;
  selected: boolean;
  error?: string;
  manualProvider: CourierProvider;
  manualId: string;
  fetching: boolean;
  fetchedRaw?: string | null;
  fetchedFee?: number | null;
  fetchedProvider?: string | null;
};

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("880")) return "0" + d.slice(3);
  if (d.length === 10 && d.startsWith("1")) return "0" + d;
  return d.length >= 10 ? d : null;
}

function suggestStatus(total: number, success: number, cancelled: number): OrderStatus | null {
  if (total === 0) return null;
  // Phone history shudhu confirm kore customer legit + courier e parcel jay.
  // Eta proof noy je EI order delivered hoye geche. Tai shipped order ke
  // in_transit e ano — actual delivered status courier API theke ashbe.
  if (success > 0) return "in_transit";
  if (cancelled > 0 && success === 0) return "cancelled";
  return null;
}

export function PhoneHistorySyncDialog({
  open,
  onOpenChange,
  orders,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orders: OrderInput[];
}) {
  const qc = useQueryClient();
  const { activeBrand } = useBrand();
  const fetchFn = useServerFn(fetchCourierHistoryFn);
  const syncFn = useServerFn(syncCourierStatusFn);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [fetching, setFetching] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || orders.length === 0) return;
    let cancel = false;
    setFetching(true);
    const initial: Record<string, RowState> = {};
    for (const o of orders) {
      initial[o.id] = {
        order: o,
        loading: true,
        total: 0,
        success: 0,
        cancelled: 0,
        suggested: null,
        override: null,
        selected: false,
        manualProvider: "pathao",
        manualId: "",
        fetching: false,
      };
    }
    setRows(initial);

    (async () => {
      const phones = Array.from(
        new Set(orders.map((o) => normalizePhone(o.phone)).filter((p): p is string => !!p)),
      );
      if (phones.length === 0) {
        setFetching(false);
        toast.error("Konno valid phone number paowa jay nai");
        return;
      }
      try {
        const res = await fetchFn({ data: { phones, brandId: activeBrand?.id ?? undefined } });
        if (cancel) return;
        const map = res.results as Record<string, { found: boolean; summary: { total: number; success: number; cancelled: number } }>;
        setRows((prev) => {
          const next = { ...prev };
          for (const o of orders) {
            const phone = normalizePhone(o.phone);
            const hist = phone ? map[phone] : null;
            if (!hist) {
              next[o.id] = { ...next[o.id], loading: false, error: "Phone nai" };
              continue;
            }
            const s = hist.summary;
            const sug = suggestStatus(s.total, s.success, s.cancelled);
            next[o.id] = {
              ...next[o.id],
              loading: false,
              total: s.total,
              success: s.success,
              cancelled: s.cancelled,
              suggested: sug,
              override: sug,
              selected: !!sug && sug !== o.status,
            };
          }
          return next;
        });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (!cancel) setFetching(false);
      }
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const list = useMemo(() => Object.values(rows), [rows]);
  const selectedCount = list.filter((r) => r.selected && r.override).length;

  const fetchByConsignment = async (orderId: string) => {
    const r = rows[orderId];
    if (!r) return;
    if (!r.manualId.trim()) {
      toast.error("Consignment ID din");
      return;
    }
    setRows((p) => ({ ...p, [orderId]: { ...p[orderId], fetching: true } }));
    try {
      const res = await syncFn({
        data: {
          orderIds: [orderId],
          brandId: activeBrand?.id ?? undefined,
          overrides: [{ orderId, provider: r.manualProvider, identifier: r.manualId.trim() }],
        },
      });
      const out = (res.results as CourierSyncResult[])[0];
      setRows((p) => ({
        ...p,
        [orderId]: {
          ...p[orderId],
          fetching: false,
          fetchedRaw: out.raw_status,
          fetchedFee: (out as unknown as { actual_fee?: number | null }).actual_fee ?? null,
          fetchedProvider: out.provider,
          override: out.mapped_status ?? p[orderId].override,
          selected: !!out.mapped_status && out.mapped_status !== p[orderId].order.status,
          error: out.ok ? undefined : out.error,
        },
      }));
      if (!out.ok) toast.error(out.error ?? "Fetch fail");
      else toast.success(`Status: ${out.raw_status ?? "—"}`);
    } catch (e) {
      toast.error((e as Error).message);
      setRows((p) => ({ ...p, [orderId]: { ...p[orderId], fetching: false } }));
    }
  };

  const apply = async () => {
    const toApply = list.filter((r) => r.selected && r.override);
    if (toApply.length === 0) return;
    setApplying(true);
    let okCount = 0;
    let failCount = 0;
    for (const r of toApply) {
      try {
        const { error } = await supabase.rpc("transition_order_status", {
          _order_id: r.order.id,
          _new_status: r.override!,
          _reason: r.fetchedRaw ? "courier_sync" : "phone_history_sync",
          _note: r.fetchedRaw
            ? `${r.fetchedProvider}: ${r.fetchedRaw}${r.fetchedFee ? ` · fee ${r.fetchedFee}` : ""}`
            : `Matched by phone history: ${r.success}/${r.total} delivered, ${r.cancelled} cancelled`,
        });
        if (error) throw error;
        okCount++;
      } catch {
        failCount++;
      }
    }
    setApplying(false);
    if (okCount) toast.success(`${okCount} order update hoyeche`);
    if (failCount) toast.error(`${failCount} order fail hoyeche`);
    qc.invalidateQueries({ queryKey: ["orders"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" /> Phone History Matcher
          </DialogTitle>
          <DialogDescription>
            Tracking ID nai emon order er phone number diye courier history theke status estimate kora hocche.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="text-left px-3 py-2">Order</th>
                <th className="text-left px-3 py-2">Phone</th>
                <th className="text-left px-3 py-2">History / Consignment</th>
                <th className="text-left px-3 py-2">Current → Apply</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const b = statusBadge(r.order.status);
                return (
                  <tr key={r.order.id} className="border-t">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={r.selected}
                        disabled={r.loading || !r.override}
                        onCheckedChange={(c) =>
                          setRows((p) => ({ ...p, [r.order.id]: { ...p[r.order.id], selected: !!c } }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-semibold">{r.order.invoice_no ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">{r.order.customer}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.order.phone}</td>
                    <td className="px-3 py-2">
                      {r.loading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : r.error ? (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3" /> {r.error}
                        </span>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-600" /> {r.success}
                            </Badge>
                            <Badge variant="outline" className="gap-1">
                              <XCircle className="h-3 w-3 text-destructive" /> {r.cancelled}
                            </Badge>
                            <span className="text-muted-foreground">/ {r.total}</span>
                          </div>
                          {r.fetchedRaw && (
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Truck className="h-3 w-3" /> {r.fetchedProvider}: <span className="font-mono">{r.fetchedRaw}</span>
                              {r.fetchedFee ? <span>· fee {r.fetchedFee}</span> : null}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Select
                              value={r.manualProvider}
                              onValueChange={(v) =>
                                setRows((p) => ({ ...p, [r.order.id]: { ...p[r.order.id], manualProvider: v as CourierProvider } }))
                              }
                            >
                              <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pathao">Pathao</SelectItem>
                                <SelectItem value="steadfast">Steadfast</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              value={r.manualId}
                              onChange={(e) =>
                                setRows((p) => ({ ...p, [r.order.id]: { ...p[r.order.id], manualId: e.target.value } }))
                              }
                              placeholder="Consignment ID"
                              className="h-7 text-xs w-[150px]"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2"
                              onClick={() => fetchByConsignment(r.order.id)}
                              disabled={r.fetching}
                            >
                              {r.fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Fetch"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{b.label}</Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Select
                          value={r.override ?? ""}
                          disabled={r.loading || !!r.error}
                          onValueChange={(v) =>
                            setRows((p) => ({ ...p, [r.order.id]: { ...p[r.order.id], override: v as OrderStatus, selected: true } }))
                          }
                        >
                          <SelectTrigger className="h-7 w-[150px] text-xs">
                            <SelectValue placeholder="Status select korun" />
                          </SelectTrigger>
                          <SelectContent>
                            {ORDER_STATUSES.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {statusBadge(s).label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {fetching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Fetching history…
              </span>
            ) : (
              <>{selectedCount} order apply hobe</>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={selectedCount === 0 || applying || fetching}>
              {applying && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Apply {selectedCount > 0 ? `(${selectedCount})` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}