import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Package, Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveShippingCost } from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export function ShippingCostCard({
  poId,
  initialWeight,
  initialRate,
  initialOther,
  initialShippingCost,
}: {
  poId: string;
  initialWeight: number;
  initialRate: number;
  initialOther: number;
  initialShippingCost: number;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(saveShippingCost);
  const [weight, setWeight] = useState<number>(initialWeight || 0);
  const [rate, setRate] = useState<number>(initialRate || 0);
  const [other, setOther] = useState<number>(initialOther || 0);

  const total = +(Number(weight || 0) * Number(rate || 0)).toFixed(2);

  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        po_id: poId,
        shipping_weight_kg: Number(weight) || 0,
        shipping_rate_per_kg: Number(rate) || 0,
        other_charges_bdt: Number(other) || 0,
      },
    }),
    onSuccess: () => {
      toast.success("Shipping cost saved — carton shares recalculated");
      qc.invalidateQueries({ queryKey: ["imp-po", poId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="p-4 border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900/40">
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-blue-600" />
        <h3 className="font-semibold text-sm">Shipping Cost (Arrived BD)</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Total Weight (KG)</Label>
          <Input type="number" step="0.01" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Rate (৳/KG)</Label>
          <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs">Total Shipping</Label>
          <div className="h-10 px-3 flex items-center font-bold tabular-nums text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-800">
            {fmtBdt(total || initialShippingCost)}
          </div>
        </div>
        <div>
          <Label className="text-xs">Other Charges (৳)</Label>
          <Input type="number" step="0.01" value={other} onChange={(e) => setOther(Number(e.target.value))} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save & distribute to cartons
        </Button>
      </div>
    </Card>
  );
}