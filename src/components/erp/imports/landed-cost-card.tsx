import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calculator, Lock, RefreshCw, Loader2, Save, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtBdt } from "@/lib/erp/imports/types";
import { getLatestFxRate, updatePoLandedCost } from "@/lib/erp/imports/imports.functions";

export type LandedItem = {
  id: string;             // either real imp_po_items.id (detail page) or temp id (new page)
  name: string;
  quantity: number;
  unit_cost_cny: number;
};

type Props = {
  brandId: string;
  items: LandedItem[];
  /** Initial / current values from DB. */
  initialFxRate?: number | null;
  initialFreight?: number;
  initialCustoms?: number;
  initialOther?: number;
  initialAgentCommissionCny?: number;
  fxLockedAt?: string | null;
  fxSource?: string | null;
  /** If po_id is provided the card shows a Save button that persists via server fn. */
  poId?: string;
  /** Called whenever the calculator values change (used by New PO page for live preview). */
  onChange?: (v: {
    fx_rate_cny_bdt: number;
    freight_cost_bdt: number;
    customs_duty_bdt: number;
    other_charges_bdt: number;
    agent_commission_cny: number;
  }) => void;
};

export function LandedCostCard({
  brandId, items, initialFxRate, initialFreight = 0, initialCustoms = 0, initialOther = 0, initialAgentCommissionCny = 0,
  fxLockedAt, fxSource, poId, onChange,
}: Props) {
  const qc = useQueryClient();
  const fxFn = useServerFn(getLatestFxRate);
  const saveFn = useServerFn(updatePoLandedCost);

  const [fxRate, setFxRate] = useState<number>(Number(initialFxRate ?? 14));
  const [freight, setFreight] = useState<number>(Number(initialFreight) || 0);
  const [customs, setCustoms] = useState<number>(Number(initialCustoms) || 0);
  const [other, setOther] = useState<number>(Number(initialOther) || 0);
  const [agentCny, setAgentCny] = useState<number>(Number(initialAgentCommissionCny) || 0);
  const [source, setSource] = useState<"manual" | "auto">((fxSource as any) ?? "manual");

  const totals = useMemo(() => {
    const totalUnits = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const totalProductBdt = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_cost_cny) || 0) * (fxRate || 0), 0);
    const extras = (freight || 0) + (customs || 0) + (other || 0);
    const commissionPerUnit = (agentCny || 0) * (fxRate || 0);
    const commissionTotal = commissionPerUnit * totalUnits;
    const grand = totalProductBdt + extras + commissionTotal;
    const perUnit = totalUnits > 0 ? grand / totalUnits : 0;
    return { totalUnits, totalProductBdt, extras, commissionPerUnit, commissionTotal, grand, perUnit };
  }, [items, fxRate, freight, customs, other, agentCny]);

  const breakdown = useMemo(() => {
    return items.map((it) => {
      const qty = Number(it.quantity) || 0;
      const unitBdt = (Number(it.unit_cost_cny) || 0) * (fxRate || 0);
      const lineValue = unitBdt * qty;
      const share = totals.totalProductBdt > 0 ? (lineValue / totals.totalProductBdt) * totals.extras : 0;
      const landedUnit = qty > 0 ? unitBdt + share / qty : unitBdt;
      return { ...it, unitBdt, lineValue, extrasShare: share, landedUnit, landedLine: landedUnit * qty };
    });
  }, [items, fxRate, totals.totalProductBdt, totals.extras]);

  // Live preview hook for New PO
  const push = (patch?: Partial<{ fx: number; fr: number; cu: number; ot: number; ac: number }>) => {
    onChange?.({
      fx_rate_cny_bdt: patch?.fx ?? fxRate,
      freight_cost_bdt: patch?.fr ?? freight,
      customs_duty_bdt: patch?.cu ?? customs,
      other_charges_bdt: patch?.ot ?? other,
      agent_commission_cny: patch?.ac ?? agentCny,
    });
  };

  const fxQuery = useQuery({
    queryKey: ["fx-latest", brandId, "CNY", "BDT"],
    enabled: false,
    queryFn: () => fxFn({ data: { brandId, from: "CNY", to: "BDT" } }),
  });

  const pullAutoRate = async () => {
    const r = await fxQuery.refetch();
    const rate = (r.data as any)?.rate;
    if (rate) {
      setFxRate(Number(rate));
      setSource("auto");
      push({ fx: Number(rate) });
      toast.success(`Pulled CNY→BDT @ ${rate}`);
    } else {
      toast.info("No saved FX rate for this brand yet");
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!poId) throw new Error("No PO id");
      return saveFn({
        data: {
          po_id: poId,
          fx_rate_cny_bdt: fxRate,
          fx_rate_source: source,
          freight_cost_bdt: freight,
          customs_duty_bdt: customs,
          other_charges_bdt: other,
          agent_commission_cny: agentCny,
          items: items.map((it) => ({ id: it.id, unit_cost_cny: Number(it.unit_cost_cny) || 0 })),
          lock_rate: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Landed cost saved & FX rate locked");
      qc.invalidateQueries({ queryKey: ["po-detail", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Landed Cost (CNY → BDT)</h3>
          {fxLockedAt && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Lock className="h-3 w-3" /> Locked {new Date(fxLockedAt).toLocaleDateString()}
            </Badge>
          )}
          {fxSource && <Badge variant="secondary" className="text-[10px] uppercase">{fxSource}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={pullAutoRate} disabled={fxQuery.isFetching}>
            {fxQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Auto FX
          </Button>
          {poId && (
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || items.length === 0}>
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save & Lock
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-3 mt-4">
        <Field label="FX rate (1 CNY = ? BDT)">
          <Input type="number" step="0.0001" min={0} value={fxRate}
            onChange={(e) => { const v = Number(e.target.value); setFxRate(v); setSource("manual"); push({ fx: v }); }} />
        </Field>
        <Field label="Freight (BDT)">
          <Input type="number" step="0.01" min={0} value={freight}
            onChange={(e) => { const v = Number(e.target.value); setFreight(v); push({ fr: v }); }} />
        </Field>
        <Field label="Customs / Duty (BDT)">
          <Input type="number" step="0.01" min={0} value={customs}
            onChange={(e) => { const v = Number(e.target.value); setCustoms(v); push({ cu: v }); }} />
        </Field>
        <Field label="Other charges (BDT)">
          <Input type="number" step="0.01" min={0} value={other}
            onChange={(e) => { const v = Number(e.target.value); setOther(v); push({ ot: v }); }} />
        </Field>
        <Field label="Agent commission (CNY/pcs)">
          <Input type="number" step="0.01" min={0} value={agentCny}
            onChange={(e) => { const v = Number(e.target.value); setAgentCny(v); push({ ac: v }); }} />
          {fxRate > 0 ? (
            <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
              = {fmtBdt(totals.commissionPerUnit)}/pcs · total {fmtBdt(totals.commissionTotal)}
            </div>
          ) : (
            <div className="mt-1 text-[10px] text-orange-600">Set FX rate first</div>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Stat label="Total units" value={totals.totalUnits.toLocaleString("en-BD")} />
        <Stat label="Product cost" value={fmtBdt(totals.totalProductBdt)} />
        <Stat label="Extras" value={fmtBdt(totals.extras)} />
        <Stat label="Landed / unit" value={fmtBdt(totals.perUnit)} highlight />
      </div>

      {items.length > 0 && (
        <div className="mt-4 rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-right text-xs">Qty</TableHead>
                <TableHead className="text-right text-xs">¥ / unit</TableHead>
                <TableHead className="text-right text-xs">৳ / unit</TableHead>
                <TableHead className="text-right text-xs">Extras share</TableHead>
                <TableHead className="text-right text-xs">Landed / unit</TableHead>
                <TableHead className="text-right text-xs">Landed total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs max-w-[220px] truncate">{r.name || "—"}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{r.quantity}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">¥{(Number(r.unit_cost_cny) || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtBdt(r.unitBdt)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{fmtBdt(r.extrasShare)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-semibold">{fmtBdt(r.landedUnit)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtBdt(r.landedLine)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totals.totalUnits > 0 && totals.extras > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          Extras allocated proportionally by line value. Adjust FX or charges and the breakdown recalculates instantly.
        </p>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-sm font-bold tabular-nums mt-0.5 ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}