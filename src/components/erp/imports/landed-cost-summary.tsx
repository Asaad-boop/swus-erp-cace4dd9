import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listWarehouses, postCartonReceiptToInventory } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export function LandedCostSummary({
  carton,
  poItems,
  poFxRate,
  poOtherCharges,
  poTotalUsableUnits,
  poId,
  brandId,
}: {
  carton: any;
  poItems: any[];
  poFxRate: number;
  poOtherCharges: number;
  poTotalUsableUnits: number;
  poId: string;
  brandId: string;
}) {
  const qc = useQueryClient();
  const whFn = useServerFn(listWarehouses);
  const { data: warehouses = [] } = useQuery({ queryKey: ["imp-wh", brandId], queryFn: () => whFn({ data: { brandId } }) });
  const [warehouseId, setWarehouseId] = useState("");

  const postFn = useServerFn(postCartonReceiptToInventory);
  const items: any[] = carton?.items ?? [];
  const piMap = new Map(poItems.map((p) => [p.id, p]));

  const cartonUsable = items.reduce((s, it) => s + Number(it.usable_qty ?? 0), 0);
  const cartonDamaged = items.reduce((s, it) => s + Number(it.damaged_qty ?? 0), 0);
  const cartonShipShare = Number(carton?.cost_share_bdt ?? 0);
  const shipPerUnit = cartonUsable > 0 ? cartonShipShare / cartonUsable : 0;
  const otherPerUnit = poTotalUsableUnits > 0 ? poOtherCharges / poTotalUsableUnits : 0;

  // Weighted average product cost for display
  let weightedProduct = 0;
  let totalUsableForAvg = 0;
  items.forEach((it) => {
    const pi = piMap.get(it.po_item_id);
    const unitCny = Number(pi?.unit_cost_cny ?? pi?.unit_cost_foreign ?? 0);
    const productCost = unitCny * poFxRate;
    const u = Number(it.usable_qty ?? 0);
    weightedProduct += productCost * u;
    totalUsableForAvg += u;
  });
  const avgProductCost = totalUsableForAvg > 0 ? weightedProduct / totalUsableForAvg : 0;
  const landed = avgProductCost + shipPerUnit + otherPerUnit;

  const ready = cartonUsable > 0 && !!warehouseId && !carton.posted_at;

  const mut = useMutation({
    mutationFn: () => postFn({ data: { carton_id: carton.id, warehouse_id: warehouseId } }),
    onSuccess: (out: any) => {
      const u = out?.totals?.usable_units ?? cartonUsable;
      toast.success(`✅ Posted ${u} pcs — landed ৳${landed.toFixed(2)}/unit`);
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card className="p-4 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/40">
      <div className="text-[11px] tracking-wider font-semibold text-muted-foreground mb-2">LANDED COST SUMMARY</div>
      <div className="space-y-1 text-sm">
        <Row label="Product Cost (CNY × FX)" value={`৳${avgProductCost.toFixed(2)}/pcs`} />
        <Row label="Shipping share" value={`৳${shipPerUnit.toFixed(2)}/pcs`} />
        <Row label="Other share" value={`৳${otherPerUnit.toFixed(2)}/pcs`} />
        <div className="border-t border-border my-2" />
        <div className="flex items-center justify-between font-bold text-base">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> LANDED COST</span>
          <span className="tabular-nums text-emerald-700 dark:text-emerald-300">৳{landed.toFixed(2)}/pcs</span>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground mt-2">
          <span>Usable: <span className="font-semibold tabular-nums text-foreground">{cartonUsable} pcs</span></span>
          <span>Damaged: <span className="font-semibold tabular-nums text-orange-600">{cartonDamaged} pcs</span></span>
        </div>
      </div>

      {!carton.posted_at && (
        <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <Label className="text-xs">Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {warehouses.filter((w: any) => w.is_active).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => mut.mutate()} disabled={!ready || mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Post to Inventory
          </Button>
        </div>
      )}
      {carton.posted_at && (
        <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Posted on {new Date(carton.posted_at).toLocaleString()}
        </div>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}