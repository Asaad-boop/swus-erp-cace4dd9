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
import { fmtBdt } from "@/lib/erp/finance";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string;
  productId: string;
  productName?: string;
};

const TYPES = ["video_production", "photography", "influencer", "model", "content_creator", "studio", "meta_ads_manual", "other_marketing", "packaging", "other"] as const;

export function ProductExpenseAllocationDialog({ open, onClose, brandId, productId, productName }: Props) {
  const qc = useQueryClient();
  const [expenseType, setExpenseType] = useState<(typeof TYPES)[number]>("video_production");
  const [amount, setAmount] = useState("");
  const [txnId, setTxnId] = useState<string>("");
  const [allocationMethod, setAllocationMethod] = useState<"direct" | "percent" | "equal_split">("direct");
  const [note, setNote] = useState("");

  // recent expense transactions for picking
  const txnQ = useQuery({
    queryKey: ["pp-expense-txns", brandId],
    enabled: open && !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_transactions")
        .select("id, amount, description, transaction_date, txn_type")
        .eq("brand_id", brandId)
        .eq("txn_type", "expense")
        .order("transaction_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount || 0);
      if (amt <= 0) throw new Error("Amount must be > 0");
      const { error } = await supabase.from("erp_product_expense_allocations").insert({
        brand_id: brandId,
        product_id: productId,
        expense_transaction_id: txnId || null,
        expense_type: expenseType,
        amount: amt,
        allocation_method: allocationMethod,
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense allocated to product");
      qc.invalidateQueries({ queryKey: ["pp-report"] });
      setAmount(""); setNote(""); setTxnId("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Allocate Expense to Product</DialogTitle>
          {productName && <DialogDescription>{productName}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Link to expense transaction (optional)</Label>
            <Select value={txnId} onValueChange={(v) => {
              setTxnId(v);
              const t = (txnQ.data ?? []).find((x) => x.id === v);
              if (t && !amount) setAmount(String(t.amount));
            }}>
              <SelectTrigger><SelectValue placeholder={txnQ.isLoading ? "Loading…" : "Pick or leave blank"} /></SelectTrigger>
              <SelectContent>
                {(txnQ.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.transaction_date} · {fmtBdt(t.amount)} · {t.description ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Expense type</Label>
              <Select value={expenseType} onValueChange={(v: any) => setExpenseType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Allocation method</Label>
              <Select value={allocationMethod} onValueChange={(v: any) => setAllocationMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="percent">Percent</SelectItem>
                  <SelectItem value="equal_split">Equal split</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Amount allocated to this product (৳)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Allocate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}