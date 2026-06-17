import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtBdt, type Account } from "@/lib/erp/finance";
import type { Brand } from "@/contexts/brand-context";

type Props = {
  open: boolean;
  onClose: () => void;
  brandId: string | null;
  accounts: Account[];
  defaultFromId?: string | null;
  // When brandId is null and brands.length > 1, the dialog renders a brand picker.
  brands?: Brand[];
};

export function TransferDialog({ open, onClose, brandId, accounts, defaultFromId, brands = [] }: Props) {
  const qc = useQueryClient();
  const [fromId, setFromId] = useState<string>(defaultFromId ?? "");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  const showBrandPicker = !brandId && brands.length > 1;
  const effectiveBrandId = brandId ?? pickedBrandId ?? null;

  useEffect(() => {
    if (open) {
      setPickedBrandId(brandId ?? (brands.length === 1 ? brands[0].id : ""));
    }
  }, [open, brandId, brands]);

  const scopedAccounts = useMemo(
    () => (effectiveBrandId ? accounts.filter((a) => a.brand_id === effectiveBrandId) : []),
    [accounts, effectiveBrandId],
  );

  useEffect(() => {
    setFromId(defaultFromId ?? ""); setToId("");
  }, [effectiveBrandId, defaultFromId]);

  const from = scopedAccounts.find((a) => a.id === fromId);
  const to = scopedAccounts.find((a) => a.id === toId);
  const amt = Number(amount || 0);
  const insufficient = from && amt > Number(from.current_balance);

  const mut = useMutation({
    mutationFn: async () => {
      if (!effectiveBrandId) throw new Error("Select a brand");
      if (!fromId || !toId) throw new Error("Select both accounts");
      if (fromId === toId) throw new Error("From and To must be different");
      if (!amt || amt <= 0) throw new Error("Amount must be > 0");
      const { error } = await supabase.from("erp_transactions").insert({
        brand_id: effectiveBrandId,
        txn_type: "transfer",
        account_id: fromId,
        to_account_id: toId,
        amount: amt,
        transaction_date: date,
        description: note || `Transfer: ${from?.name} → ${to?.name}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer recorded");
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["wallet_statement"] });
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      setAmount(""); setNote("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Balance Transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {showBrandPicker && (
            <div>
              <Label>Brand *</Label>
              <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>From account</Label>
            <Select value={fromId} onValueChange={setFromId} disabled={!effectiveBrandId}>
              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {scopedAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} · {fmtBdt(a.current_balance)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-center text-muted-foreground"><ArrowRight className="h-4 w-4" /></div>
          <div>
            <Label>To account</Label>
            <Select value={toId} onValueChange={setToId} disabled={!effectiveBrandId}>
              <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
              <SelectContent>
                {scopedAccounts.filter((a) => a.id !== fromId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} · {fmtBdt(a.current_balance)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Top-up bKash from Cash" />
          </div>
          {insufficient && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Warning: source balance is {fmtBdt(from?.current_balance ?? 0)}, transfer will go negative.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !fromId || !toId || !amt}>
            {mut.isPending ? "Saving…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}