import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string;
  productId: string;
  productName?: string;
};

const RETURN_TYPES = ["normal_return", "paid_return", "damage_return", "refund"] as const;
const CONDITIONS = ["sellable", "damaged", "missing", "disposed"] as const;

export function ReturnCaseDialog({ open, onClose, brandId, productId, productName }: Props) {
  const qc = useQueryClient();
  const [orderItemId, setOrderItemId] = useState<string>("");
  const [returnType, setReturnType] = useState<(typeof RETURN_TYPES)[number]>("normal_return");
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>("sellable");
  const [qty, setQty] = useState("1");
  const [refund, setRefund] = useState("0");
  const [outboundCost, setOutboundCost] = useState("0");
  const [returnCost, setReturnCost] = useState("0");
  const [productCostLoss, setProductCostLoss] = useState("0");
  const [note, setNote] = useState("");

  // recent order_items for this product
  const itemsQ = useQuery({
    queryKey: ["return-dialog-items", brandId, productId],
    enabled: open && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, quantity, unit_price, line_total, unit_cost_snapshot, orders!inner(id, order_number, status, created_at, brand_id)")
        .eq("product_id", productId)
        .eq("orders.brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const selected = (itemsQ.data ?? []).find((i) => i.id === orderItemId);

  const mut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select an order item");
      const { error } = await supabase.from("erp_return_cases").insert({
        brand_id: brandId,
        order_id: selected.order_id,
        order_item_id: selected.id,
        product_id: productId,
        return_type: returnType,
        item_condition: condition,
        qty: Number(qty || 1),
        refund_amount: Number(refund || 0),
        outbound_delivery_cost: Number(outboundCost || 0),
        return_delivery_cost: Number(returnCost || 0),
        product_cost_loss: Number(productCostLoss || 0),
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Return case recorded");
      qc.invalidateQueries({ queryKey: ["pp-report"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark Return</DialogTitle>
          {productName && <DialogDescription>{productName}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Order item</Label>
            <Select value={orderItemId} onValueChange={(v) => {
              setOrderItemId(v);
              const it = (itemsQ.data ?? []).find((x) => x.id === v);
              if (it) {
                setRefund(String(it.line_total ?? 0));
                setProductCostLoss(String(Number(it.unit_cost_snapshot ?? 0) * Number(it.quantity ?? 1)));
              }
            }}>
              <SelectTrigger><SelectValue placeholder={itemsQ.isLoading ? "Loading…" : "Pick order item"} /></SelectTrigger>
              <SelectContent>
                {(itemsQ.data ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    #{i.orders?.order_number ?? i.order_id.slice(0, 8)} · qty {i.quantity} · ৳{Number(i.line_total ?? 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Return type</Label>
              <Select value={returnType} onValueChange={(v: any) => setReturnType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RETURN_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item condition</Label>
              <Select value={condition} onValueChange={(v: any) => setCondition(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Qty</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><Label>Refund (৳)</Label><Input type="number" value={refund} onChange={(e) => setRefund(e.target.value)} /></div>
            <div><Label>Outbound delivery cost</Label><Input type="number" value={outboundCost} onChange={(e) => setOutboundCost(e.target.value)} /></div>
            <div><Label>Return delivery cost</Label><Input type="number" value={returnCost} onChange={(e) => setReturnCost(e.target.value)} /></div>
            <div className="col-span-2"><Label>Product cost loss (if damaged/missing)</Label><Input type="number" value={productCostLoss} onChange={(e) => setProductCostLoss(e.target.value)} /></div>
          </div>
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !orderItemId}>{mut.isPending ? "Saving…" : "Save Return"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}