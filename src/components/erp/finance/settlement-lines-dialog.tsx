import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  cod_fee: number;
  delivery_fee: number;
  final_fee: number;
  matched_order_id: string | null;
  match_status: string;
  expected_amount: number | null;
  variance: number | null;
};

const STATUS_STYLE: Record<string, string> = {
  matched: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  shortfall: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  overage: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  unmatched: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  brand_mismatch: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  status_inconsistent: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

export function SettlementLinesDialog({ remittance, onClose }: { remittance: RemittanceRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const remId = remittance?.id ?? null;

  const q = useQuery({
    queryKey: ["settlement_lines", remId],
    enabled: !!remId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_courier_settlement_lines")
        .select("id,consignment_id,merchant_order_id,invoice_type,store_name,recipient_name,payout,cod_fee,delivery_fee,final_fee,matched_order_id,match_status,expected_amount,variance")
        .eq("remittance_id", remId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Line[];
    },
  });

  const rows = q.data ?? [];

  const summary = useMemo(() => {
    const s = {
      matched: 0, shortfall: 0, overage: 0, unmatched: 0, brand_mismatch: 0, status_inconsistent: 0,
      payoutTotal: 0, expectedTotal: 0, shortfallTotal: 0,
    };
    for (const r of rows) {
      const key = r.match_status as keyof typeof s;
      if (typeof s[key] === "number") (s[key] as number) = (s[key] as number) + 1;
      s.payoutTotal += Number(r.payout || 0);
      s.expectedTotal += Number(r.expected_amount || 0);
      if (r.match_status === "shortfall") s.shortfallTotal += Number(r.expected_amount || 0) - Number(r.payout || 0);
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!remittance} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Settlement Reconciliation · {remittance?.courier} · {remittance?.remittance_date}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Stat label="Payout total" value={fmtBdt(summary.payoutTotal)} />
          <Stat label="Expected total" value={fmtBdt(summary.expectedTotal)} />
          <Stat label="Shortfall total" value={fmtBdt(summary.shortfallTotal)} tone={summary.shortfallTotal > 0 ? "amber" : undefined} />
          <Stat label="Lines" value={`${rows.length} (M ${summary.matched} · S ${summary.shortfall} · O ${summary.overage} · U ${summary.unmatched})`} />
        </div>

        <div className="max-h-[55vh] overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant #</TableHead>
                <TableHead>Consignment</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Store</TableHead>
                <TableHead className="text-right">Payout</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!q.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No lines.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.merchant_order_id ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.consignment_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.invoice_type ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.store_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBdt(r.payout)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.expected_amount != null ? fmtBdt(r.expected_amount) : "—"}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", (r.variance ?? 0) < 0 ? "text-amber-600" : (r.variance ?? 0) > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                    {r.variance != null ? `${r.variance >= 0 ? "+" : ""}${fmtBdt(r.variance)}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("capitalize", STATUS_STYLE[r.match_status] ?? "")}>{r.match_status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                </TableRow>
              ))}
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