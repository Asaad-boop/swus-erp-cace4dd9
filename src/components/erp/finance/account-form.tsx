import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_TYPES, type Account } from "@/lib/erp/finance";

export function AccountForm({ open, onClose, brandId, editing }: { open: boolean; onClose: () => void; brandId: string | null; editing?: Account | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("cash");
  const [number, setNumber] = useState("");
  const [opening, setOpening] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name ?? "");
        setType(editing.account_type ?? "cash");
        setNumber(editing.account_number ?? "");
        setOpening(String(editing.opening_balance ?? 0));
        setNotes(editing.notes ?? "");
      } else {
        setName(""); setType("cash"); setNumber(""); setOpening("0"); setNotes("");
      }
    }
  }, [open, editing]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["erp_accounts"] });
    qc.invalidateQueries({ queryKey: ["wallets"] });
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      if (!name.trim()) throw new Error("Name required");
      const ob = Number(opening) || 0;
      if (editing) {
        const { error } = await supabase.from("erp_accounts").update({
          name: name.trim(), account_type: type,
          account_number: number || null,
          opening_balance: ob,
          notes: notes || null,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("erp_accounts").insert({
          brand_id: brandId, name: name.trim(), account_type: type,
          account_number: number || null,
          opening_balance: ob, current_balance: ob,
          notes: notes || null, is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Account updated" : "Account created");
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nothing to delete");
      const { count } = await supabase.from("erp_transactions")
        .select("id", { count: "exact", head: true })
        .or(`account_id.eq.${editing.id},to_account_id.eq.${editing.id}`);
      if ((count ?? 0) > 0) {
        const { error } = await supabase.from("erp_accounts").update({ is_active: false }).eq("id", editing.id);
        if (error) throw error;
        return "archived" as const;
      }
      const { error } = await supabase.from("erp_accounts").delete().eq("id", editing.id);
      if (error) throw error;
      return "deleted" as const;
    },
    onSuccess: (kind) => {
      toast.success(kind === "archived" ? "Account has transactions — archived instead" : "Account deleted");
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit Account" : "New Account"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Cash" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Account number</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Opening balance</Label><Input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter className="flex sm:justify-between gap-2">
          {editing ? (
            <Button
              variant="destructive"
              onClick={() => { if (confirm("Delete this account? If it has transactions it will be archived instead.")) del.mutate(); }}
              disabled={del.isPending || mut.isPending}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : editing ? "Save" : "Create"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}