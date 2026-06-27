import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Truck, Plus, ArrowRight, Wallet, Sparkles, Loader2, Settings2 } from "lucide-react";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { useBrand } from "@/contexts/brand-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listCargoAgentsWithBalance,
  cargoAdvanceDeposit,
  cargoManualAdjustment,
  listBrandAccounts,
  getCargoDashboardSummary,
} from "@/lib/erp/imports/cargo.functions";
import { fmtBdt } from "@/lib/erp/imports/types";

export const Route = createFileRoute("/_authenticated/erp/imports/cargo")({
  head: () => ({ meta: [{ title: "Cargo Partners — Imports" }] }),
  component: CargoPartnersPage,
});

function statusBadge(balance: number) {
  if (balance > 0) return { label: "Advance Available", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" };
  if (balance < 0) return { label: "Payable to Cargo", tone: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" };
  return { label: "Settled", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };
}

function CargoPartnersPage() {
  const { brandId, picker } = useBrandPicker();
  const { brandIds } = useBrand();
  const listFn = useServerFn(listCargoAgentsWithBalance);
  const summaryFn = useServerFn(getCargoDashboardSummary);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["cargo-partners", brandIds.join(",")],
    queryFn: () => listFn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
  });
  const { data: summary } = useQuery({
    queryKey: ["cargo-summary", brandIds.join(",")],
    queryFn: () => summaryFn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
  });

  const [depositFor, setDepositFor] = useState<any | null>(null);
  const [adjustFor, setAdjustFor] = useState<any | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Cargo Balance Accounts</h2>
        </div>
        <div className="flex items-center gap-2">
          {picker}
          <Link to="/erp/imports/settings"><Button size="sm" variant="outline"><Settings2 className="h-4 w-4 mr-1" />Manage Cargo Agents</Button></Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <SummaryTile label="Advance Available" value={fmtBdt(summary?.total_advance ?? 0)} tone="emerald" />
        <SummaryTile label="Payable to Cargo" value={fmtBdt(summary?.total_payable ?? 0)} tone="orange" />
        <SummaryTile label="Net Position" value={fmtBdt(summary?.net ?? 0)} tone={(summary?.net ?? 0) >= 0 ? "emerald" : "orange"} />
      </div>

      {isLoading && <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>}
      {!isLoading && (agents as any[]).length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No cargo agents yet. <Link to="/erp/imports/settings" className="text-primary hover:underline">Add one</Link>.
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(agents as any[]).map((a) => {
          const bal = Number(a.balance?.current_balance ?? 0);
          const adv = Number(a.balance?.total_advance ?? 0);
          const ded = Number(a.balance?.total_deducted ?? 0);
          const s = statusBadge(bal);
          return (
            <Card key={a.id} className="p-4 hover:border-primary/40 transition group">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.contact_person || "—"}{a.phone ? ` · ${a.phone}` : ""}
                  </div>
                  {a.brand?.name && <Badge variant="outline" className="text-[10px] mt-1">{a.brand.name}</Badge>}
                </div>
                <Badge className={s.tone}>{s.label}</Badge>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current balance</div>
                <div className={`text-2xl font-bold tabular-nums ${bal < 0 ? "text-orange-600" : bal > 0 ? "text-emerald-600" : ""}`}>
                  {fmtBdt(bal)}
                </div>
                <div className="mt-2 grid grid-cols-2 text-xs gap-2">
                  <div><div className="text-muted-foreground">Advance paid</div><div className="font-medium tabular-nums">{fmtBdt(adv)}</div></div>
                  <div><div className="text-muted-foreground">Deducted</div><div className="font-medium tabular-nums">{fmtBdt(ded)}</div></div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => setDepositFor(a)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Send Advance
                </Button>
                <Link to="/erp/imports/cargo/$agentId" params={{ agentId: a.id }} className="flex-1">
                  <Button size="sm" variant="outline" className="w-full">Ledger <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                </Link>
              </div>
              <Button size="sm" variant="ghost" className="w-full mt-1 text-xs h-7" onClick={() => setAdjustFor(a)}>
                <Sparkles className="h-3 w-3 mr-1" />Manual adjustment
              </Button>
            </Card>
          );
        })}
      </div>

      {depositFor && (
        <AdvanceDepositDialog
          agent={depositFor}
          brandId={brandId}
          onClose={() => setDepositFor(null)}
        />
      )}
      {adjustFor && (
        <ManualAdjustmentDialog
          agent={adjustFor}
          brandId={brandId}
          onClose={() => setAdjustFor(null)}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "emerald" | "orange" }) {
  const colors = tone === "emerald"
    ? "from-emerald-500/10 to-emerald-500/0 border-emerald-500/20"
    : "from-orange-500/10 to-orange-500/0 border-orange-500/20";
  return (
    <Card className={`p-4 bg-gradient-to-br ${colors}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
        <Wallet className="h-3.5 w-3.5" />{label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </Card>
  );
}

/* ===================== Advance Deposit Dialog ===================== */

export function AdvanceDepositDialog({ agent, brandId, onClose }: { agent: any; brandId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const accountsFn = useServerFn(listBrandAccounts);
  const depositFn = useServerFn(cargoAdvanceDeposit);
  const targetBrand = agent.brand_id ?? agent.brand?.id ?? brandId;

  const { data: accounts = [] } = useQuery({
    queryKey: ["brand-accounts", targetBrand],
    queryFn: () => accountsFn({ data: { brandId: targetBrand } }),
    enabled: !!targetBrand,
  });

  const [accountId, setAccountId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");

  const acct = (accounts as any[]).find((a) => a.id === accountId);
  const insufficient = acct && amount > Number(acct.current_balance ?? 0);

  const m = useMutation({
    mutationFn: () => depositFn({ data: {
      brandId: targetBrand, cargoAgentId: agent.id, paymentAccountId: accountId,
      amount, paymentDate: date, reference: ref || undefined, note: note || undefined,
    }}),
    onSuccess: (res: any) => {
      toast.success(`Advance sent. New balance: ${fmtBdt(res?.new_balance ?? 0)}`);
      qc.invalidateQueries({ queryKey: ["cargo-partners"] });
      qc.invalidateQueries({ queryKey: ["cargo-summary"] });
      qc.invalidateQueries({ queryKey: ["cargo-ledger"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send Advance to {agent.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>From account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {(accounts as any[]).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {fmtBdt(a.current_balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (BDT) *</Label>
              <Input type="number" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div><Label>Transaction ID / Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <div><Label>Note</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>

          {insufficient && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2 border border-red-200 dark:border-red-900">
              Insufficient balance. Account has {fmtBdt(acct.current_balance)}.
            </div>
          )}
          {amount > 0 && acct && !insufficient && (
            <div className="text-xs bg-muted/50 rounded p-2 border border-border">
              After this: <strong>{acct.name}</strong> → {fmtBdt(Number(acct.current_balance) - amount)} · <strong>{agent.name}</strong> balance → {fmtBdt(Number(agent.balance?.current_balance ?? 0) + amount)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!accountId || amount <= 0 || insufficient || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ===================== Manual Adjustment Dialog ===================== */

export function ManualAdjustmentDialog({ agent, brandId, onClose }: { agent: any; brandId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const adjFn = useServerFn(cargoManualAdjustment);
  const targetBrand = agent.brand_id ?? agent.brand?.id ?? brandId;
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");

  const m = useMutation({
    mutationFn: () => adjFn({ data: {
      brandId: targetBrand, cargoAgentId: agent.id,
      signedAmount: direction === "credit" ? amount : -amount,
      note: note || undefined,
    }}),
    onSuccess: () => {
      toast.success("Adjustment posted");
      qc.invalidateQueries({ queryKey: ["cargo-partners"] });
      qc.invalidateQueries({ queryKey: ["cargo-summary"] });
      qc.invalidateQueries({ queryKey: ["cargo-ledger"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Admin role required or other error"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Manual Adjustment — {agent.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2">
            ⚠️ Admin-only. Use only to correct prior mistakes. Reason required.
          </div>
          <div>
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Add to cargo balance (credit)</SelectItem>
                <SelectItem value="debit">Reduce cargo balance (debit)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (BDT) *</Label>
            <Input type="number" min={0} step="0.01" value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
          </div>
          <div><Label>Reason *</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={amount <= 0 || !note || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Post Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}