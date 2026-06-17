import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Pencil, Truck, Users, Loader2, History, TrendingUp, TrendingDown, Minus, CalendarDays, Wallet, ArrowDownCircle, ArrowUpCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listCargoAgents, upsertCargoAgent,
  listImportSuppliers, upsertImportSupplier,
  listCargoAgentRates,
} from "@/lib/erp/imports/imports.functions";
import { getAgentLedger, addAgentLedgerEntry, deleteAgentLedgerEntry } from "@/lib/erp/imports/agent.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/settings")({
  head: () => ({ meta: [{ title: "Imports Settings — ERP" }] }),
  component: ImportsSettings,
});

function ImportsSettings() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const [tab, setTab] = useState<"agents" | "suppliers">("agents");

  if (!brandId) return <div className="p-6 text-sm text-muted-foreground">Select a brand.</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        <button onClick={() => setTab("agents")} className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md ${tab === "agents" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Truck className="h-4 w-4" />Cargo Agents
        </button>
        <button onClick={() => setTab("suppliers")} className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md ${tab === "suppliers" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Users className="h-4 w-4" />Import Suppliers
        </button>
      </div>

      {tab === "agents" ? <AgentsTab brandId={brandId} /> : <SuppliersTab brandId={brandId} />}
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