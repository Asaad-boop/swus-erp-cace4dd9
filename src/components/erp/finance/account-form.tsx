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
import { ACCOUNT_TYPE_CATALOG, ACCOUNT_GROUP_META, type Account, type AccountTypeMeta, fmtBdt } from "@/lib/erp/finance";
import type { Brand } from "@/contexts/brand-context";
import { cn } from "@/lib/utils";

export function AccountForm({ open, onClose, brandId, editing, brands = [] }: { open: boolean; onClose: () => void; brandId: string | null; editing?: Account | null; brands?: Brand[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("cash");
  const [number, setNumber] = useState("");
  const [opening, setOpening] = useState("0");
  const [notes, setNotes] = useState("");
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  const showBrandPicker = !brandId && !editing && brands.length > 1;
  const ALL = "__all__";
  const isAllBrands = showBrandPicker && pickedBrandId === ALL;
  const effectiveBrandId: string | null =
    brandId ?? editing?.brand_id ?? (pickedBrandId && pickedBrandId !== ALL ? pickedBrandId : null);

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
      setPickedBrandId(brandId ?? (brands.length === 1 ? brands[0].id : ""));
    }
  }, [open, editing, brandId, brands]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["erp_accounts"] });
    qc.invalidateQueries({ queryKey: ["wallets"] });
  };

  const mut = useMutation({
    mutationFn: async () => {
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
      } else if (isAllBrands) {
        const { error } = await supabase.from("erp_accounts").insert({
          brand_id: null,
          name: name.trim(),
          account_type: type,
          account_number: number || null,
          opening_balance: ob,
          current_balance: ob,
          notes: notes || null,
          is_active: true,
        });
        if (error) throw error;
      } else {
        if (!effectiveBrandId) throw new Error("Select a brand");
        const { error } = await supabase.from("erp_accounts").insert({
          brand_id: effectiveBrandId, name: name.trim(), account_type: type,
          account_number: number || null,
          opening_balance: ob, current_balance: ob,
          notes: notes || null, is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Account updated" : isAllBrands ? "Shared account created (all brands)" : "Account created");
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{editing ? "Edit Account" : "New Account"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {editing ? "Update wallet details." : "Pick a type, give it a name, set opening balance. That's it."}
          </p>
        </DialogHeader>

        <div className="space-y-5 text-sm py-2">
          {showBrandPicker && (
            <section className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Brand</Label>
              <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
                <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>🌐 All brands (shared)</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {isAllBrands && (
                <p className="text-[11px] text-muted-foreground">
                  Shared account — sob brand e dekha jabe. Brand-wise report transactions theke ashbe.
                </p>
              )}
            </section>
          )}

          {/* Type picker grouped by category */}
          <section className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Account Type</Label>
            <TypePicker value={type} onChange={setType} />
          </section>

          {/* Basics */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Account name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Cash, City Bank Main, bKash Personal" />
            </div>
            <div className="space-y-1.5">
              <Label>Account / wallet number</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Opening balance (BDT)</Label>
              <Input type="number" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
              {Number(opening) > 0 && (
                <p className="text-[11px] text-muted-foreground">Will start at {fmtBdt(Number(opening))}</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Branch, account holder, anything useful…" />
            </div>
          </section>
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

function TypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const groups = Array.from(new Set(ACCOUNT_TYPE_CATALOG.map((t) => t.group)));
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const meta = ACCOUNT_GROUP_META[g];
        const items = ACCOUNT_TYPE_CATALOG.filter((t) => t.group === g);
        return (
          <div key={g} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((t) => (
                <TypeChip key={t.value} item={t} active={value === t.value} onClick={() => onChange(t.value)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TypeChip({ item, active, onClick }: { item: AccountTypeMeta; active: boolean; onClick: () => void }) {
  const meta = ACCOUNT_GROUP_META[item.group];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border px-3 py-2 transition-all",
        "hover:border-primary/60 hover:bg-muted/50",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-sm"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("text-sm", meta.accent)}>{meta.icon}</span>
        <span className="text-sm font-medium truncate">{item.label}</span>
      </div>
      {item.hint && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{item.hint}</div>}
    </button>
  );
}