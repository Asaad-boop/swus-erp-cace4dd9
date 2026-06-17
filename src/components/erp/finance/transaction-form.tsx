import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Account, Category, TxnType } from "@/lib/erp/finance";
import type { Brand } from "@/contexts/brand-context";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  accounts: Account[];
  categories: Category[];
  defaultType?: TxnType;
  // When brandId is null and brands.length > 1, dialog shows a Brand picker.
  brands?: Brand[];
};

export function TransactionForm({ open, onClose, brandId, accounts, categories, defaultType = "income", brands = [] }: Props) {
  const qc = useQueryClient();
  const [type, setType] = useState<TxnType>(defaultType);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  const showBrandPicker = !brandId && brands.length > 1;
  const effectiveBrandId = brandId ?? pickedBrandId ?? null;

  useEffect(() => {
    if (open) {
      setPickedBrandId(brandId ?? (brands.length === 1 ? brands[0].id : ""));
    }
  }, [open, brandId, brands]);

  // When in All-Brands mode, after picking a brand, narrow accounts/categories.
  const scopedAccounts = useMemo(
    () => (effectiveBrandId ? accounts.filter((a) => a.brand_id === effectiveBrandId) : []),
    [accounts, effectiveBrandId],
  );
  const scopedCategories = useMemo(
    () => (effectiveBrandId ? categories.filter((c) => c.brand_id === effectiveBrandId) : []),
    [categories, effectiveBrandId],
  );

  // Reset account/category when brand changes so we don't keep an out-of-scope id.
  useEffect(() => {
    setAccountId(""); setToAccountId(""); setCategoryId("");
  }, [effectiveBrandId]);

  const reset = () => {
    setAmount(""); setAccountId(""); setToAccountId(""); setCategoryId("");
    setDescription(""); setDate(new Date().toISOString().slice(0, 10));
  };

  const filteredCats = scopedCategories.filter((c) =>
    type === "income" ? c.kind === "income" : type === "expense" ? c.kind === "expense" : true,
  );

  const mut = useMutation({
    mutationFn: async () => {
      if (!effectiveBrandId) throw new Error("Select a brand");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Amount must be > 0");
      if (type !== "transfer" && !accountId) throw new Error("Account is required");
      if (type === "transfer" && (!accountId || !toAccountId || accountId === toAccountId)) {
        throw new Error("Pick two different accounts for transfer");
      }
      const payload = {
        brand_id: effectiveBrandId,
        txn_type: type,
        amount: amt,
        account_id: accountId || null,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" || type === "adjustment" ? null : (categoryId || null),
        transaction_date: date,
        description: description || null,
      };
      const { error } = await supabase.from("erp_transactions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction saved");
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["erp_pnl"] });
      reset();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {showBrandPicker && (
            <div className="space-y-1.5">
              <Label>Brand *</Label>
              <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v: TxnType) => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>{type === "transfer" ? "From account" : "Account"}</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={!effectiveBrandId}>
              <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
              <SelectContent>
                {scopedAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.account_type})</SelectItem>)}
              </SelectContent>
            </Select>
            {effectiveBrandId && scopedAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground">No accounts in this brand yet.</p>
            )}
          </div>
          {type === "transfer" && (
            <div className="space-y-1.5">
              <Label>To account</Label>
              <Select value={toAccountId} onValueChange={setToAccountId} disabled={!effectiveBrandId}>
                <SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger>
                <SelectContent>
                  {scopedAccounts.filter((a) => a.id !== accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.account_type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {(type === "income" || type === "expense") && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={!effectiveBrandId}>
                <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                <SelectContent>
                  {filteredCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {effectiveBrandId && filteredCats.length === 0 && <p className="text-xs text-muted-foreground">No {type} categories yet. Add one in the Categories tab.</p>}
            </div>
          )}
          <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          {type === "adjustment" && <p className="text-xs text-amber-600">Adjustment will be added directly to the account balance (use a negative amount to decrease).</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}