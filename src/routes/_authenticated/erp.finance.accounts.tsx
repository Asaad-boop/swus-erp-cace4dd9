import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Archive, Pencil, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { fmtBdt } from "@/lib/erp/finance";

export const Route = createFileRoute("/_authenticated/erp/finance/accounts")({
  head: () => ({ meta: [{ title: "Chart of Accounts — ERP" }] }),
  component: AccountsPage,
});

type COA = {
  id: string; brand_id: string; code: string; name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
  parent_id: string | null; currency: string; opening_balance: number;
  normal_balance: "debit" | "credit"; is_active: boolean; is_archived: boolean;
  description: string | null;
};

const TYPES: Array<COA["account_type"]> = ["asset", "liability", "equity", "income", "expense"];
const TYPE_LABEL: Record<COA["account_type"], string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses",
};
const TYPE_COLOR: Record<COA["account_type"], string> = {
  asset: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  liability: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  equity: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  income: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expense: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function AccountsPage() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<COA | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["erp_chart_accounts", brandId, showArchived],
    enabled: !!brandId,
    queryFn: async () => {
      let qb = supabase.from("erp_chart_accounts").select("*").eq("brand_id", brandId!).order("code");
      if (!showArchived) qb = qb.eq("is_archived", false);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as COA[];
    },
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      const { data, error } = await supabase.rpc("seed_default_coa", { _brand_id: brandId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`Chart of Accounts ready (${count} accounts)`);
      qc.invalidateQueries({ queryKey: ["erp_chart_accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (acc: COA) => {
      // Check usage in journal lines
      const { count } = await supabase.from("erp_journal_lines")
        .select("id", { count: "exact", head: true })
        .eq("account_id", acc.id);
      if ((count ?? 0) > 0) {
        const { error } = await supabase.from("erp_chart_accounts").update({ is_archived: true }).eq("id", acc.id);
        if (error) throw error;
        return "archived" as const;
      }
      const { error } = await supabase.from("erp_chart_accounts").delete().eq("id", acc.id);
      if (error) throw error;
      return "deleted" as const;
    },
    onSuccess: (kind) => {
      toast.success(kind === "archived" ? "Has entries — archived instead" : "Deleted");
      qc.invalidateQueries({ queryKey: ["erp_chart_accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const rows = q.data ?? [];
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) => r.code.toLowerCase().includes(s) || r.name.toLowerCase().includes(s));
  }, [q.data, search]);

  const grouped = useMemo(() => {
    const m: Record<COA["account_type"], COA[]> = { asset: [], liability: [], equity: [], income: [], expense: [] };
    for (const r of filtered) m[r.account_type].push(r);
    return m;
  }, [filtered]);

  if (!brandId) return <div className="p-6 text-muted-foreground">Select a brand.</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">Hierarchical account ledger · {filtered.length} shown</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(q.data ?? []).length === 0 && (
            <Button variant="default" size="sm" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
              <Sparkles className="h-4 w-4 mr-1" />Seed default accounts
            </Button>
          )}
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />New Account</Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Show archived
        </label>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!q.isLoading && (q.data ?? []).length === 0 && (
        <Card><CardContent className="text-center py-12 text-muted-foreground">
          No accounts yet. Click <strong>Seed default accounts</strong> to start with a standard chart of accounts.
        </CardContent></Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {TYPES.map((t) => grouped[t].length > 0 && (
          <Card key={t}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="secondary" className={TYPE_COLOR[t]}>{TYPE_LABEL[t]}</Badge>
                <span className="text-xs text-muted-foreground font-normal">{grouped[t].length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {grouped[t].map((a) => {
                const isParent = !a.parent_id;
                return (
                  <div key={a.id} className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 ${isParent ? "font-semibold" : "pl-6"} ${a.is_archived ? "opacity-50" : ""}`}>
                    <span className="text-xs text-muted-foreground font-mono w-12">{a.code}</span>
                    <span className="flex-1 text-sm truncate">{a.name}</span>
                    {a.opening_balance > 0 && <span className="text-xs text-muted-foreground font-mono">{fmtBdt(a.opening_balance)}</span>}
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(a)} title="Edit">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-600 hover:text-red-700"
                      title="Delete"
                      disabled={deleteMut.isPending}
                      onClick={() => { if (confirm(`Delete "${a.name}"? If it has journal entries, it will be archived instead.`)) deleteMut.mutate(a); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <AccountFormDialog
        open={creating || !!editing}
        editing={editing}
        brandId={brandId}
        accounts={q.data ?? []}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["erp_chart_accounts"] })}
      />
    </div>
  );
}

function AccountFormDialog({ open, editing, brandId, accounts, onClose, onSaved }: {
  open: boolean; editing: COA | null; brandId: string; accounts: COA[];
  onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<COA["account_type"]>("expense");
  const [parentId, setParentId] = useState<string>("");
  const [normal, setNormal] = useState<"debit" | "credit">("debit");
  const [opening, setOpening] = useState("0");
  const [archived, setArchived] = useState(false);

  useMemo(() => {
    if (editing) {
      setCode(editing.code); setName(editing.name); setType(editing.account_type);
      setParentId(editing.parent_id ?? ""); setNormal(editing.normal_balance);
      setOpening(String(editing.opening_balance)); setArchived(editing.is_archived);
    } else {
      setCode(""); setName(""); setType("expense"); setParentId(""); setNormal("debit"); setOpening("0"); setArchived(false);
    }
  }, [editing, open]);

  // auto-set normal balance based on type
  useMemo(() => {
    if (!editing) setNormal(type === "liability" || type === "equity" || type === "income" ? "credit" : "debit");
  }, [type, editing]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!code.trim() || !name.trim()) throw new Error("Code and name required");
      const payload = {
        brand_id: brandId, code: code.trim(), name: name.trim(), account_type: type,
        parent_id: parentId || null, normal_balance: normal,
        opening_balance: Number(opening) || 0, is_archived: archived,
      };
      if (editing) {
        const { error } = await supabase.from("erp_chart_accounts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("erp_chart_accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Updated" : "Created"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const parentOpts = accounts.filter((a) => a.account_type === type && !a.parent_id && a.id !== editing?.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit account" : "New account"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 5900" /></div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as COA["account_type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing Expense" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Parent (optional)</Label>
              <Select value={parentId || "none"} onValueChange={(v) => setParentId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None (root) —</SelectItem>
                  {parentOpts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Normal balance</Label>
              <Select value={normal} onValueChange={(v) => setNormal(v as "debit" | "credit")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Opening balance (BDT)</Label><Input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} /></div>
          {editing && (
            <label className="flex items-center gap-2 text-sm pt-1">
              <Switch checked={archived} onCheckedChange={setArchived} />
              <Archive className="h-4 w-4" /> Archive this account
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}