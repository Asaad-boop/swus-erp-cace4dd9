import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STOCK_REASONS, type ProductRow } from "@/lib/erp/inventory";

type Mode = "in" | "out";
type Props = {
  product: ProductRow | null;
  mode: Mode;
  onClose: () => void;
};

export function StockAdjustDialog({ product, mode, onClose }: Props) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<string>(mode === "in" ? "stock_in" : "stock_out");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product");
      if (!qty || qty <= 0) throw new Error("Quantity must be > 0");
      const delta = mode === "in" ? qty : -qty;
      const { error } = await supabase.rpc("adjust_product_stock", {
        _product_id: product.id,
        _delta: delta,
        _reason: reason,
        _note: note || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(mode === "in" ? "Stock added" : "Stock removed");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
      setQty(1); setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = !!product;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "in" ? "Stock In" : "Stock Out"} — {product?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">
            Current stock: <span className="font-semibold text-foreground">{product?.stock ?? 0}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STOCK_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="text-xs text-muted-foreground">
            New stock will be: <span className="font-semibold text-foreground">
              {Math.max((product?.stock ?? 0) + (mode === "in" ? qty : -qty), 0)}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}