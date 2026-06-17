import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listImportSuppliers, upsertImportSupplier,
} from "@/lib/erp/imports/imports.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/settings")({
  head: () => ({ meta: [{ title: "Imports Settings — ERP" }] }),
  component: ImportsSettings,
});

function ImportsSettings() {
  const { brandId, effectiveBrand, gate } = useBrandPicker();

  if (gate) return gate;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <SuppliersTab brandId={brandId} />
    </div>
  );
}

/* ----------------------- Cargo Agents ----------------------- */

function AgentsTab({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCargoAgents);
  const upsertFn = useServerFn(upsertCargoAgent);
  const { data: agents = [] } = useQuery({
    queryKey: ["imp-agents", brandId],
    queryFn: () => listFn({ data: { brandId } }),
  });
  const [editing, setEditing] = useState<any | null>(null);
  const [historyFor, setHistoryFor] = useState<any | null>(null);
  const [balanceFor, setBalanceFor] = useState<any | null>(null);

  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cargo Agents</h3>
        <Button onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" />Add Agent</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(agents as any[]).length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground col-span-full">No cargo agents yet.</Card>}
        {(agents as any[]).map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            onEdit={() => setEditing(a)}
            onHistory={() => setHistoryFor(a)}
            onBalance={() => setBalanceFor(a)}
          />
        ))}
      </div>
      {editing && (
        <AgentDialog
          brandId={brandId}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await upsertFn({ data: { ...payload, brandId } });
            qc.invalidateQueries({ queryKey: ["imp-agents", brandId] });
            toast.success("Cargo agent saved");
            setEditing(null);
          }}
        />
      )}
      {historyFor && (
        <RateHistoryDialog agent={historyFor} onClose={() => setHistoryFor(null)} />
      )}
      {balanceFor && (
        <BalanceDialog
          agent={balanceFor}
          onClose={() => setBalanceFor(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["imp-agents", brandId] })}
        />
      )}
    </>
  );
}

function AgentCard({ agent: a, onEdit, onHistory, onBalance }: { agent: any; onEdit: () => void; onHistory: () => void; onBalance: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const latest = a.latest_rate as any | null;
  const isToday = latest?.rate_date === today;
  const balance = Number(a.balance_bdt ?? 0);
  const balTone = balance > 0 ? "text-emerald-600" : balance < 0 ? "text-rose-600" : "text-muted-foreground";
  return (
    <Card className="p-4 hover:border-primary/40 transition">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-semibold truncate">{a.name}</div>
          <div className="text-xs text-muted-foreground">{a.phone ?? "No phone"}</div>
        </div>
        <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Active" : "Inactive"}</Badge>
      </div>

      {/* Balance band */}
      <button
        type="button"
        onClick={onBalance}
        className="mt-3 w-full rounded-md border border-primary/20 bg-primary/5 hover:bg-primary/10 transition px-3 py-2 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
            <Wallet className="h-3 w-3" />Agent Balance
          </div>
          <span className="text-[10px] text-primary">Manage →</span>
        </div>
        <div className={`mt-1 text-lg font-bold tabular-nums ${balTone}`}>৳ {fmtBdt(balance)}</div>
      </button>

      {/* Today's rate band */}
      <div className={`mt-3 rounded-md border px-3 py-2 ${isToday ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            {isToday ? "Today's Rate" : latest ? "Last Submitted" : "No rate submitted"}
          </div>
          {latest && (
            <span className="text-[10px] text-muted-foreground">{latest.rate_date}</span>
          )}
        </div>
        {latest ? (
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <div>
              <span className="text-lg font-bold tabular-nums">{Number(latest.shipping_rate_per_kg_bdt).toFixed(2)}</span>
              <span className="text-xs text-muted-foreground ml-1">BDT/kg</span>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">FX {Number(latest.fx_rate).toFixed(2)}</div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mt-1">Agent ekhono kono rate diy ni</div>
        )}
      </div>

      <div className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Default Rate</span><span className="font-medium tabular-nums">{fmtBdt(a.default_shipping_rate_per_kg_bdt)}/kg</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Default FX</span><span className="font-medium tabular-nums">{a.default_fx_rate} {a.default_currency ?? "CNY"}/BDT</span></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={onHistory}><History className="h-3.5 w-3.5 mr-1" />History</Button>
        <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
      </div>
    </Card>
  );
}

function RateHistoryDialog({ agent, onClose }: { agent: any; onClose: () => void }) {
  const fn = useServerFn(listCargoAgentRates);
  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["imp-agent-rates", agent.id],
    queryFn: () => fn({ data: { agentId: agent.id, limit: 90 } }),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{agent.name} — Rate History</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (rates as any[]).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Kono rate submit hoyni.</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border sticky top-0 bg-background">
                <tr>
                  <th className="text-left py-2 font-medium">Date</th>
                  <th className="text-right py-2 font-medium">Shipping (BDT/kg)</th>
                  <th className="text-right py-2 font-medium">FX</th>
                  <th className="text-left py-2 font-medium pl-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {(rates as any[]).map((r, idx, arr) => {
                  const prev = arr[idx + 1];
                  const delta = prev ? Number(r.shipping_rate_per_kg_bdt) - Number(prev.shipping_rate_per_kg_bdt) : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 font-medium">{r.rate_date}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span className="font-medium">{Number(r.shipping_rate_per_kg_bdt).toFixed(2)}</span>
                        {prev && delta !== 0 && (
                          <span className={`ml-2 inline-flex items-center text-[11px] ${delta > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                          </span>
                        )}
                        {prev && delta === 0 && <Minus className="inline h-3 w-3 ml-2 text-muted-foreground" />}
                      </td>
                      <td className="py-2 text-right tabular-nums">{Number(r.fx_rate).toFixed(4)}</td>
                      <td className="py-2 pl-3 text-muted-foreground truncate max-w-[240px]">{r.note ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AgentDialog({ brandId, initial, onClose, onSave }: { brandId: string; initial: any; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [rate, setRate] = useState<number>(Number(initial?.default_shipping_rate_per_kg_bdt ?? 0));
  const [currency, setCurrency] = useState(initial?.default_currency ?? "CNY");
  const [fx, setFx] = useState<number>(Number(initial?.default_fx_rate ?? 14));
  const [active, setActive] = useState<boolean>(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial?.id ? "Edit" : "New"} Cargo Agent</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><Label>Default Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={8} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Shipping Rate (BDT/kg)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
            <div><Label>Default FX Rate</Label><Input type="number" step="0.0001" value={fx} onChange={(e) => setFx(Number(e.target.value))} /></div>
          </div>
          <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />Active</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name || busy} onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                id: initial?.id,
                name, phone, address,
                default_shipping_rate_per_kg_bdt: rate,
                default_currency: currency,
                default_fx_rate: fx,
                is_active: active,
              });
            } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            finally { setBusy(false); }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------- Import Suppliers ----------------------- */

/* ----------------------- Agent Balance Dialog ----------------------- */

function BalanceDialog({ agent, onClose, onChanged }: { agent: any; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const ledgerFn = useServerFn(getAgentLedger);
  const addFn = useServerFn(addAgentLedgerEntry);
  const delFn = useServerFn(deleteAgentLedgerEntry);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["imp-agent-ledger", agent.id],
    queryFn: () => ledgerFn({ data: { agentId: agent.id, limit: 200 } }),
  });

  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const balance = Number(data?.balance_bdt ?? 0);
  const entries = (data?.entries ?? []) as any[];

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Valid amount din"); return; }
    setBusy(true);
    try {
      await addFn({
        data: {
          agentId: agent.id,
          direction,
          amount_bdt: amt,
          entry_date: date,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      toast.success(direction === "credit" ? "Deposit add hoyeche" : "Payment add hoyeche");
      setAmount(""); setReference(""); setNote("");
      await refetch();
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Eta delete korte chan?")) return;
    try {
      await delFn({ data: { id } });
      toast.success("Entry deleted");
      await refetch();
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  const balTone = balance > 0 ? "text-emerald-600" : balance < 0 ? "text-rose-600" : "text-muted-foreground";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" />{agent.name} — Balance</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Current Balance</div>
          <div className={`text-3xl font-bold tabular-nums ${balTone}`}>৳ {fmtBdt(balance)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {balance > 0 ? "Agent er kache amader taka ache" : balance < 0 ? "Agent ke amra taka pao" : "Settled"}
          </div>
        </div>

        {/* Add entry */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="text-sm font-semibold">Add Entry</div>
          <div className="inline-flex rounded-md border border-border p-0.5 bg-card">
            <button
              type="button"
              onClick={() => setDirection("credit")}
              className={`px-3 py-1.5 text-sm font-medium rounded inline-flex items-center gap-1.5 ${direction === "credit" ? "bg-emerald-500 text-white" : "text-muted-foreground"}`}
            >
              <ArrowDownCircle className="h-3.5 w-3.5" />Deposit (Add Money)
            </button>
            <button
              type="button"
              onClick={() => setDirection("debit")}
              className={`px-3 py-1.5 text-sm font-medium rounded inline-flex items-center gap-1.5 ${direction === "debit" ? "bg-rose-500 text-white" : "text-muted-foreground"}`}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />Payment (Use Balance)
            </button>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>Amount (BDT) *</Label>
              <Input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100000" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="bKash trxId / receipt #" />
            </div>
          </div>
          <div>
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kichu likhte chaile…" />
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {direction === "credit" ? "Add Deposit" : "Add Payment"}
            </Button>
          </div>
        </div>

        {/* History */}
        <div className="rounded-lg border border-border">
          <div className="px-4 py-2 border-b border-border text-sm font-semibold flex items-center justify-between">
            <span>History</span>
            <span className="text-xs text-muted-foreground">{entries.length} entries</span>
          </div>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Kono entry nei.</div>
          ) : (
            <div className="max-h-[40vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border sticky top-0 bg-background">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Type</th>
                    <th className="text-right py-2 px-3 font-medium">Amount</th>
                    <th className="text-left py-2 px-3 font-medium">Note</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 px-3 whitespace-nowrap">{e.entry_date}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1 text-xs">
                          {e.direction === "credit"
                            ? <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" />
                            : <ArrowUpCircle className="h-3.5 w-3.5 text-rose-600" />}
                          <span className="capitalize">{e.entry_type ?? (e.direction === "credit" ? "deposit" : "payment")}</span>
                        </span>
                      </td>
                      <td className={`py-2 px-3 text-right font-semibold tabular-nums ${e.direction === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                        {e.direction === "credit" ? "+" : "−"} ৳ {fmtBdt(e.amount_bdt)}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground truncate max-w-[260px]">
                        {e.reference ? <span className="font-medium text-foreground mr-1">{e.reference}</span> : null}
                        {e.note ?? ""}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(e.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------- Import Suppliers (continued) ----------------------- */

function SuppliersTab({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listImportSuppliers);
  const upsertFn = useServerFn(upsertImportSupplier);
  const { data: suppliers = [] } = useQuery({
    queryKey: ["imp-suppliers", brandId],
    queryFn: () => listFn({ data: { brandId } }),
  });
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <>
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Import Suppliers</h3>
        <Button onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" />Add Supplier</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(suppliers as any[]).length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground col-span-full">No import suppliers yet.</Card>}
        {(suppliers as any[]).map((s) => (
          <Card key={s.id} className="p-4 hover:border-primary/40 transition">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="font-semibold truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.country ?? "CN"} · {s.currency ?? "CNY"}</div>
              </div>
              <Badge variant="outline">{s.supplier_type}</Badge>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Current Due</span><span className={`font-medium tabular-nums ${Number(s.current_due) > 0 ? "text-orange-600" : ""}`}>{fmtBdt(s.current_due)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Credit Limit</span><span className="font-medium tabular-nums">{fmtBdt(s.credit_limit_bdt)}</span></div>
              {s.source_link && <div className="truncate"><a href={s.source_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">Source link →</a></div>}
            </div>
            <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setEditing(s)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
          </Card>
        ))}
      </div>
      {editing && (
        <SupplierDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            await upsertFn({ data: { ...payload, brandId } });
            qc.invalidateQueries({ queryKey: ["imp-suppliers", brandId] });
            toast.success("Supplier saved");
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function SupplierDialog({ initial, onClose, onSave }: { initial: any; onClose: () => void; onSave: (p: any) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [sourceLink, setSourceLink] = useState(initial?.source_link ?? "");
  const [country, setCountry] = useState(initial?.country ?? "CN");
  const [currency, setCurrency] = useState(initial?.currency ?? "CNY");
  const [terms, setTerms] = useState<number>(Number(initial?.payment_terms_days ?? 0));
  const [credit, setCredit] = useState<number>(Number(initial?.credit_limit_bdt ?? 0));
  const [type, setType] = useState<"import" | "local" | "both">(initial?.supplier_type ?? "import");
  const [active, setActive] = useState<boolean>(initial?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial?.id ? "Edit" : "New"} Import Supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone / WeChat</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="import">Import only</SelectItem>
                  <SelectItem value="local">Local only</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Source Link</Label><Input value={sourceLink} onChange={(e) => setSourceLink(e.target.value)} placeholder="1688 / Alibaba URL" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Country</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={8} /></div>
            <div><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={8} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Payment Terms (days)</Label><Input type="number" min={0} value={terms} onChange={(e) => setTerms(Number(e.target.value))} /></div>
            <div><Label>Credit Limit (BDT)</Label><Input type="number" step="0.01" value={credit} onChange={(e) => setCredit(Number(e.target.value))} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />Active</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name || busy} onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                id: initial?.id,
                name, phone, source_link: sourceLink, country, currency,
                payment_terms_days: terms, credit_limit_bdt: credit,
                supplier_type: type, is_active: active,
              });
            } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            finally { setBusy(false); }
          }}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}