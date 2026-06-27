import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Truck, Plus, Receipt, Loader2, Paperclip, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  listCargoAgentsWithBalance, getCargoLedger, listCargoBills,
  createCargoBill, listBrandAccounts,
} from "@/lib/erp/imports/cargo.functions";
import { fmtBdt } from "@/lib/erp/imports/types";
import { useBrand } from "@/contexts/brand-context";
import { AdvanceDepositDialog, ManualAdjustmentDialog } from "./erp.imports.cargo";

export const Route = createFileRoute("/_authenticated/erp/imports/cargo/$agentId")({
  head: () => ({ meta: [{ title: "Cargo Ledger — Imports" }] }),
  component: CargoAgentDetail,
});

const ENTRY_TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  opening:         { label: "Opening",         tone: "bg-slate-100 text-slate-700" },
  advance_deposit: { label: "Advance Deposit", tone: "bg-emerald-100 text-emerald-800" },
  bill_deduction:  { label: "Bill Deduction",  tone: "bg-orange-100 text-orange-800" },
  po_payment:      { label: "PO Payment",      tone: "bg-blue-100 text-blue-800" },
  refund:          { label: "Refund",          tone: "bg-cyan-100 text-cyan-800" },
  adjustment:      { label: "Adjustment",      tone: "bg-amber-100 text-amber-800" },
};

function CargoAgentDetail() {
  const { agentId } = Route.useParams();
  const { brandIds, activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? brandIds[0] ?? "";

  const listFn = useServerFn(listCargoAgentsWithBalance);
  const ledgerFn = useServerFn(getCargoLedger);
  const billsFn = useServerFn(listCargoBills);

  const { data: agents = [] } = useQuery({
    queryKey: ["cargo-partners", brandIds.join(",")],
    queryFn: () => listFn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
  });
  const agent = (agents as any[]).find((a) => a.id === agentId);

  const { data: ledger = [], isLoading: lLoading } = useQuery({
    queryKey: ["cargo-ledger", agentId],
    queryFn: () => ledgerFn({ data: { agentId } }),
  });
  const { data: bills = [] } = useQuery({
    queryKey: ["cargo-bills", agentId],
    queryFn: () => billsFn({ data: { brandIds, agentId } }),
    enabled: brandIds.length > 0,
  });

  const [depositOpen, setDepositOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  if (!agent) {
    return (
      <div className="p-6">
        <Link to="/erp/imports/cargo"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button></Link>
        <Card className="p-8 text-center text-sm text-muted-foreground mt-4">Cargo partner not found.</Card>
      </div>
    );
  }

  const bal = Number(agent.balance?.current_balance ?? 0);
  const status = bal > 0 ? { label: "Advance Available", tone: "bg-emerald-100 text-emerald-800" }
               : bal < 0 ? { label: "Payable to Cargo", tone: "bg-orange-100 text-orange-800" }
               : { label: "Settled", tone: "bg-slate-100 text-slate-700" };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to="/erp/imports/cargo"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Partners</Button></Link>
          <Truck className="h-5 w-5 text-primary ml-2" />
          <h2 className="text-lg font-semibold">{agent.name}</h2>
          <Badge className={status.tone}>{status.label}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setDepositOpen(true)}><Plus className="h-4 w-4 mr-1" />Send Advance</Button>
          <Button size="sm" variant="outline" onClick={() => setBillOpen(true)}><Receipt className="h-4 w-4 mr-1" />New Bill</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdjustOpen(true)}>Adjust</Button>
        </div>
      </div>

      {/* Balance card */}
      <div className="grid md:grid-cols-4 gap-3">
        <Card className="p-4 md:col-span-2 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Current balance</div>
          <div className={`text-4xl font-bold tabular-nums mt-1 ${bal < 0 ? "text-orange-600" : bal > 0 ? "text-emerald-600" : ""}`}>{fmtBdt(bal)}</div>
          {agent.contact_person && <div className="text-xs text-muted-foreground mt-2">{agent.contact_person}{agent.phone ? ` · ${agent.phone}` : ""}</div>}
        </Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Total Advance Paid</div><div className="text-xl font-semibold tabular-nums mt-1">{fmtBdt(agent.balance?.total_advance ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Total Deducted</div><div className="text-xl font-semibold tabular-nums mt-1">{fmtBdt(agent.balance?.total_deducted ?? 0)}</div></Card>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger ({(ledger as any[]).length})</TabsTrigger>
          <TabsTrigger value="bills">Cargo Bills ({(bills as any[]).length})</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger" className="mt-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 px-3">Date</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Reference</th>
                    <th className="text-left p-2">Account</th>
                    <th className="text-right p-2">Debit</th>
                    <th className="text-right p-2">Credit</th>
                    <th className="text-right p-2 px-3">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {lLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
                  {!lLoading && (ledger as any[]).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No ledger entries yet.</td></tr>}
                  {(ledger as any[]).map((r) => {
                    const t = ENTRY_TYPE_LABEL[r.entry_type] ?? { label: r.entry_type, tone: "" };
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-2 px-3 whitespace-nowrap">{r.entry_date}</td>
                        <td className="p-2"><Badge className={t.tone}>{t.label}</Badge></td>
                        <td className="p-2">
                          <div className="truncate max-w-[200px]">{r.ref_label || "—"}</div>
                          {r.note && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{r.note}</div>}
                        </td>
                        <td className="p-2 text-xs">{r.account?.name || "—"}</td>
                        <td className="p-2 text-right tabular-nums text-orange-700">{Number(r.debit_bdt) > 0 ? fmtBdt(r.debit_bdt) : "—"}</td>
                        <td className="p-2 text-right tabular-nums text-emerald-700">{Number(r.credit_bdt) > 0 ? fmtBdt(r.credit_bdt) : "—"}</td>
                        <td className={`p-2 px-3 text-right tabular-nums font-semibold ${Number(r.running_balance) < 0 ? "text-orange-600" : ""}`}>{fmtBdt(r.running_balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="bills" className="mt-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 px-3">Date</th>
                    <th className="text-left p-2">Bill #</th>
                    <th className="text-left p-2">Shipment / PO</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-right p-2">From Balance</th>
                    <th className="text-right p-2">From Account</th>
                    <th className="text-right p-2 px-3">Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {(bills as any[]).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No cargo bills yet.</td></tr>}
                  {(bills as any[]).map((b) => (
                    <tr key={b.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-2 px-3 whitespace-nowrap">{b.bill_date}</td>
                      <td className="p-2 font-medium">{b.bill_number || "—"}</td>
                      <td className="p-2 text-xs">
                        {b.shipment_ref && <div>{b.shipment_ref}</div>}
                        {b.po?.po_number && <div className="text-muted-foreground">PO {b.po.po_number}</div>}
                      </td>
                      <td className="p-2 text-right tabular-nums font-semibold">{fmtBdt(b.total_bdt)}</td>
                      <td className="p-2 text-right tabular-nums text-emerald-700">{fmtBdt(b.paid_from_balance_bdt)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtBdt(b.paid_from_account_bdt)}</td>
                      <td className={`p-2 px-3 text-right tabular-nums ${Number(b.payable_bdt) > 0 ? "text-orange-600 font-semibold" : ""}`}>{fmtBdt(b.payable_bdt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {depositOpen && <AdvanceDepositDialog agent={agent} brandId={brandId} onClose={() => setDepositOpen(false)} />}
      {adjustOpen && <ManualAdjustmentDialog agent={agent} brandId={brandId} onClose={() => setAdjustOpen(false)} />}
      {billOpen && <CargoBillDialog agent={agent} brandId={brandId} onClose={() => setBillOpen(false)} />}
    </div>
  );
}

/* ===================== Cargo Bill Dialog ===================== */

function CargoBillDialog({ agent, brandId, onClose }: { agent: any; brandId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const accountsFn = useServerFn(listBrandAccounts);
  const billFn = useServerFn(createCargoBill);
  const targetBrand = agent.brand_id ?? agent.brand?.id ?? brandId;

  const { data: accounts = [] } = useQuery({
    queryKey: ["brand-accounts", targetBrand],
    queryFn: () => accountsFn({ data: { brandId: targetBrand } }),
    enabled: !!targetBrand,
  });

  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [shipmentRef, setShipmentRef] = useState("");
  const [weight, setWeight] = useState<number>(0);
  const [shipping, setShipping] = useState<number>(0);
  const [customs, setCustoms] = useState<number>(0);
  const [service, setService] = useState<number>(0);
  const [local, setLocal] = useState<number>(0);
  const [other, setOther] = useState<number>(0);
  const [source, setSource] = useState<"cargo_balance" | "account" | "partial" | "unpaid">("cargo_balance");
  const [fromBal, setFromBal] = useState<number>(0);
  const [fromAcc, setFromAcc] = useState<number>(0);
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");

  const total = shipping + customs + service + local + other;
  const cargoBal = Number(agent.balance?.current_balance ?? 0);

  // Auto-allocate based on source
  const effectiveFromBal = source === "cargo_balance" ? total : source === "partial" ? fromBal : source === "unpaid" ? 0 : 0;
  const effectiveFromAcc = source === "account" ? total : source === "partial" ? fromAcc : 0;
  const payable = Math.max(0, total - effectiveFromBal - effectiveFromAcc);
  const balanceAfter = cargoBal - effectiveFromBal;
  const acct = (accounts as any[]).find((a) => a.id === accountId);
  const accInsufficient = effectiveFromAcc > 0 && acct && effectiveFromAcc > Number(acct.current_balance ?? 0);

  const m = useMutation({
    mutationFn: () => billFn({ data: {
      brandId: targetBrand, cargoAgentId: agent.id,
      billNumber: billNumber || undefined, billDate, shipmentRef: shipmentRef || undefined,
      weightKg: weight,
      shippingCharge: shipping, customsCharge: customs, serviceCharge: service,
      localDeliveryCharge: local, otherCharge: other,
      paymentSource: source,
      amountFromBalance: effectiveFromBal,
      amountFromAccount: effectiveFromAcc,
      paymentAccountId: effectiveFromAcc > 0 ? accountId : undefined,
      note: note || undefined,
    }}),
    onSuccess: (res: any) => {
      toast.success(`Bill created. New cargo balance: ${fmtBdt(res?.new_balance ?? 0)}`);
      qc.invalidateQueries({ queryKey: ["cargo-partners"] });
      qc.invalidateQueries({ queryKey: ["cargo-summary"] });
      qc.invalidateQueries({ queryKey: ["cargo-ledger"] });
      qc.invalidateQueries({ queryKey: ["cargo-bills"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const needsAccount = (source === "account" || source === "partial") && effectiveFromAcc > 0;
  const canSave = total > 0 && !accInsufficient && !m.isPending && (!needsAccount || !!accountId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Cargo Bill — {agent.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Bill number</Label><Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} /></div>
            <div><Label>Bill date</Label><Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
            <div><Label>Weight (kg)</Label><Input type="number" min={0} step="0.01" value={weight || ""} onChange={(e) => setWeight(Number(e.target.value))} /></div>
          </div>
          <div><Label>Shipment / PO reference</Label><Input value={shipmentRef} onChange={(e) => setShipmentRef(e.target.value)} placeholder="Shipment, container or PO ref" /></div>

          <div className="grid grid-cols-3 gap-3">
            <Money label="Shipping" value={shipping} onChange={setShipping} />
            <Money label="Customs" value={customs} onChange={setCustoms} />
            <Money label="Service" value={service} onChange={setService} />
            <Money label="Local delivery" value={local} onChange={setLocal} />
            <Money label="Other" value={other} onChange={setOther} />
            <div>
              <Label>Total</Label>
              <div className="h-9 px-3 flex items-center rounded-md border border-border bg-muted font-semibold tabular-nums">{fmtBdt(total)}</div>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <Label className="mb-2 block">Payment source</Label>
            <RadioGroup value={source} onValueChange={(v) => setSource(v as any)} className="grid grid-cols-2 gap-2">
              <SourceOpt id="cargo_balance" label="Pay from Cargo Balance" hint={`Available: ${fmtBdt(cargoBal)}`} />
              <SourceOpt id="account" label="Pay from Bank / Cash" />
              <SourceOpt id="partial" label="Partial (mix)" />
              <SourceOpt id="unpaid" label="Unpaid (record only)" />
            </RadioGroup>
          </div>

          {source === "partial" && (
            <div className="grid grid-cols-2 gap-3">
              <Money label="From cargo balance" value={fromBal} onChange={setFromBal} />
              <Money label="From account" value={fromAcc} onChange={setFromAcc} />
            </div>
          )}

          {(source === "account" || (source === "partial" && fromAcc > 0)) && (
            <div>
              <Label>Payment account *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {(accounts as any[]).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} · {fmtBdt(a.current_balance)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div><Label>Note</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>

          {accInsufficient && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2 border border-red-200 dark:border-red-900">
              Insufficient account balance. {acct?.name} has {fmtBdt(acct?.current_balance)}.
            </div>
          )}

          {total > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Total bill</span><span className="tabular-nums font-semibold">{fmtBdt(total)}</span></div>
              <div className="flex justify-between"><span>From cargo balance</span><span className="tabular-nums text-emerald-700">−{fmtBdt(effectiveFromBal)}</span></div>
              <div className="flex justify-between"><span>From account</span><span className="tabular-nums">−{fmtBdt(effectiveFromAcc)}</span></div>
              <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Payable to cargo</span><span className={`tabular-nums ${payable > 0 ? "text-orange-600" : ""}`}>{fmtBdt(payable)}</span></div>
              <div className="flex justify-between text-muted-foreground pt-1"><span>Cargo balance after</span><span className={`tabular-nums ${balanceAfter < 0 ? "text-orange-600" : ""}`}>{fmtBdt(balanceAfter)}</span></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={0} step="0.01" value={value || ""} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function SourceOpt({ id, label, hint }: { id: string; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 p-2 rounded border border-border hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
      <RadioGroupItem value={id} className="mt-0.5" />
      <div className="text-sm">
        <div>{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </label>
  );
}