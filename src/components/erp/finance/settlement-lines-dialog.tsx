import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBdt } from "@/lib/erp/finance";
import type { RemittanceRow } from "@/components/erp/finance/remittance-form";
import { cn } from "@/lib/utils";

type Line = {
  id: string;
  consignment_id: string | null;
  merchant_order_id: string | null;
  invoice_type: string | null;
  store_name: string | null;
  recipient_name: string | null;
  payout: number;
  collected_amount: number | null;
  cod_fee: number;
  delivery_fee: number;
  final_fee: number;
  matched_order_id: string | null;
  match_status: string;
  expected_amount: number | null;
  variance: number | null;
};

type OrderCtx = {
  id: string;
  invoice_no: string | null;
  total: number | null;
  advance_amount: number | null;
  status: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  matched: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  needs_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  unmatched: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  brand_mismatch: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
};

const ACTION_OPTIONS = [
  { value: "partial_delivery", label: "Partial Delivery" },
  { value: "partial_return", label: "Partial Return" },
  { value: "exchange", label: "Exchange" },
  { value: "internal_adjust", label: "Internal Error — Adjust" },
];

export function SettlementLinesDialog({ remittance, onClose }: { remittance: RemittanceRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const remId = remittance?.id ?? null;

  const q = useQuery({
    queryKey: ["settlement_lines", remId],
    enabled: !!remId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_courier_settlement_lines")
        .select("id,consignment_id,merchant_order_id,invoice_type,store_name,recipient_name,payout,collected_amount,cod_fee,delivery_fee,final_fee,matched_order_id,match_status,expected_amount,variance")
        .eq("remittance_id", remId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Line[];
    },
  });

  const rows = q.data ?? [];

  const orderIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.matched_order_id).filter((x): x is string => !!x))),
    [rows],
  );

  const orderCtxQ = useQuery({
    queryKey: ["settlement_order_ctx", remId, orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,invoice_no,total,advance_amount,status")
        .in("id", orderIds);
      if (error) throw error;
      const map = new Map<string, OrderCtx>();
      for (const o of (data ?? []) as OrderCtx[]) map.set(o.id, o);
      return map;
    },
  });
  const ctxMap = orderCtxQ.data ?? new Map<string, OrderCtx>();

  const summary = useMemo(() => {
    const s = {
      matched: 0, needs_review: 0, resolved: 0, unmatched: 0, brand_mismatch: 0,
      payoutTotal: 0, expectedTotal: 0, varianceTotal: 0,
    };
    for (const r of rows) {
      const key = r.match_status as keyof typeof s;
      if (typeof s[key] === "number") (s[key] as number) = (s[key] as number) + 1;
      s.payoutTotal += Number(r.payout || 0);
      s.expectedTotal += Number(r.expected_amount || 0);
      if (r.match_status === "needs_review") s.varianceTotal += Number(r.variance || 0);
    }
    return s;
  }, [rows]);

  const reconcileMut = useMutation({
    mutationFn: async () => {
      if (!remId) return;
      const { error } = await supabase.rpc("reconcile_courier_settlement", { _remittance_id: remId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Re-reconciled");
      qc.invalidateQueries({ queryKey: ["settlement_lines", remId] });
      qc.invalidateQueries({ queryKey: ["settlement_order_ctx", remId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actionMut = useMutation({
    mutationFn: async ({ lineId, action }: { lineId: string; action: string }) => {
      const { error } = await supabase.rpc("apply_settlement_variance_action", { _line_id: lineId, _action: action });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order status updated");
      qc.invalidateQueries({ queryKey: ["settlement_lines", remId] });
      qc.invalidateQueries({ queryKey: ["settlement_order_ctx", remId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!remittance} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Settlement Reconciliation · {remittance?.courier} · {remittance?.remittance_date}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Stat label="Payout total" value={fmtBdt(summary.payoutTotal)} />
          <Stat label="Expected total" value={fmtBdt(summary.expectedTotal)} />
          <Stat label="Review variance" value={fmtBdt(summary.varianceTotal)} tone={summary.varianceTotal !== 0 ? "amber" : undefined} />
          <Stat label="Lines" value={`${rows.length} (M ${summary.matched} · R ${summary.needs_review} · U ${summary.unmatched})`} />
        </div>

        <div className="max-h-[55vh] overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice / Consignment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Advance</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Order status</TableHead>
                <TableHead>Line status</TableHead>
                <TableHead>Review action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!q.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No lines.</TableCell></TableRow>}
              {rows.map((r) => {
                const ctx = r.matched_order_id ? ctxMap.get(r.matched_order_id) : undefined;
                const isReview = r.match_status === "needs_review";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      <div className="font-mono">{ctx?.invoice_no ?? r.merchant_order_id ?? "—"}</div>
                      <div className="font-mono text-muted-foreground">{r.consignment_id ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{ctx?.total != null ? fmtBdt(ctx.total) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-purple-700 dark:text-purple-300">
                      {ctx?.advance_amount ? fmtBdt(ctx.advance_amount) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{r.collected_amount != null ? fmtBdt(r.collected_amount) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground text-xs">{r.expected_amount != null ? fmtBdt(r.expected_amount) : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums text-xs", (r.variance ?? 0) < 0 ? "text-amber-600" : (r.variance ?? 0) > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                      {r.variance != null ? `${r.variance >= 0 ? "+" : ""}${fmtBdt(r.variance)}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{ctx?.status?.replace(/_/g, " ") ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={cn("capitalize text-[10px]", STATUS_STYLE[r.match_status] ?? "")}>{r.match_status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      {isReview && r.matched_order_id ? (
                        <Select onValueChange={(v) => actionMut.mutate({ lineId: r.id, action: v })} disabled={actionMut.isPending}>
                          <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Pick reason…" /></SelectTrigger>
                          <SelectContent>
                            {ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => reconcileMut.mutate()} disabled={reconcileMut.isPending}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Re-run reconciliation
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="rounded border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-semibold tabular-nums", tone === "amber" && "text-amber-600")}>{value}</div>
    </div>
  );
}