import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, TrendingUp, TrendingDown, Minus, Phone, MapPin, Truck, CalendarDays, Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { getAgentMe, listMyRates, submitTodayRate, getMyAgentBalance } from "@/lib/erp/imports/agent.functions";

export const Route = createFileRoute("/_agent/agent/profile")({
  head: () => ({ meta: [{ title: "Profile — Cargo Agent" }] }),
  component: AgentProfile,
});

function initials(name?: string | null) {
  const parts = (name ?? "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return d; }
}

function AgentProfile() {
  const qc = useQueryClient();
  const meFn = useServerFn(getAgentMe);
  const ratesFn = useServerFn(listMyRates);
  const submitFn = useServerFn(submitTodayRate);
  const balanceFn = useServerFn(getMyAgentBalance);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent-me"],
    queryFn: () => meFn({ data: undefined as any }),
  });
  const { data: rates = [] } = useQuery({
    queryKey: ["agent-my-rates"],
    queryFn: () => ratesFn({ data: { limit: 60 } }),
  });
  const { data: wallet } = useQuery({
    queryKey: ["agent-my-balance"],
    queryFn: () => balanceFn({ data: undefined as any }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayRow = useMemo(() => (rates as any[]).find((r) => r.rate_date === today) ?? null, [rates, today]);
  const lastRow = useMemo(() => (rates as any[]).find((r) => r.rate_date !== today) ?? null, [rates, today]);

  const [rate, setRate] = useState<string>("");
  const [fx, setFx] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Prefill from today's submission, else last submission, else profile defaults
  useEffect(() => {
    if (!agent) return;
    const src = todayRow ?? lastRow;
    setRate(String(src?.shipping_rate_per_kg_bdt ?? (agent as any).default_shipping_rate_per_kg_bdt ?? ""));
    setFx(String(src?.fx_rate ?? (agent as any).default_fx_rate ?? ""));
    setNote(todayRow?.note ?? "");
  }, [agent, todayRow, lastRow]);

  const submit = useMutation({
    mutationFn: async () => {
      const r = Number(rate);
      const f = Number(fx);
      if (!Number.isFinite(r) || r <= 0) throw new Error("Valid shipping rate din");
      if (!Number.isFinite(f) || f <= 0) throw new Error("Valid FX rate din");
      return submitFn({
        data: {
          shipping_rate_per_kg_bdt: r,
          fx_rate: f,
          currency: (agent as any)?.default_currency ?? "CNY",
          note: note.trim() ? note.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(todayRow ? "Ajker rate update hoyeche" : "Ajker rate submit hoyeche");
      qc.invalidateQueries({ queryKey: ["agent-my-rates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Submit failed"),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!agent) return <div className="p-6">No profile.</div>;

  const a = agent as any;
  const currency = a.default_currency ?? "CNY";

  // delta vs last submission
  const lastRate = lastRow ? Number(lastRow.shipping_rate_per_kg_bdt) : null;
  const currentRate = todayRow ? Number(todayRow.shipping_rate_per_kg_bdt) : null;
  const rateDelta = lastRate != null && currentRate != null ? currentRate - lastRate : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      {/* Identity header */}
      <Card className="p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-xl font-bold shrink-0">
            {initials(a.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold truncate">{a.name}</h1>
              <Badge variant="secondary" className="gap-1"><Truck className="h-3 w-3" />Cargo Agent</Badge>
            </div>
            <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" /><span className="truncate">{a.phone ?? "—"}</span></div>
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{a.address ?? "—"}</span></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Balance / Wallet */}
      <BalanceCard wallet={wallet} />

      {/* Today's rate submission */}
      <Card className="p-5 md:p-6 border-primary/30">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Ajker Rate (Today)</h2>
              {todayRow && <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="h-3 w-3" />Submitted</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {fmtDate(today)} {todayRow ? `• last updated ${new Date(todayRow.updated_at).toLocaleTimeString()}` : "• ekhono submit hoyni"}
            </p>
          </div>
          {rateDelta != null && rateDelta !== 0 && (
            <Badge variant="outline" className={`gap-1 ${rateDelta > 0 ? "text-rose-600 border-rose-500/30" : "text-emerald-600 border-emerald-500/30"}`}>
              {rateDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {rateDelta > 0 ? "+" : ""}{rateDelta.toFixed(2)} BDT/kg
            </Badge>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Shipping Rate (BDT / kg) *</Label>
            <Input type="number" step="0.01" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 950" />
          </div>
          <div>
            <Label>FX Rate ({currency} → BDT) *</Label>
            <Input type="number" step="0.0001" inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} placeholder="e.g. 14.5" />
          </div>
        </div>
        <div className="mt-3">
          <Label>Note (optional)</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kichu bola dorkar hoile likhun…" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          {lastRow ? (
            <div className="text-xs text-muted-foreground">
              Last submitted: <span className="font-medium text-foreground">{Number(lastRow.shipping_rate_per_kg_bdt).toFixed(2)} BDT/kg</span> @ FX <span className="font-medium text-foreground">{Number(lastRow.fx_rate).toFixed(4)}</span> on {fmtDate(lastRow.rate_date)}
            </div>
          ) : <div className="text-xs text-muted-foreground">Eta apnar prothom rate submission.</div>}
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {todayRow ? "Update Today's Rate" : "Submit Today's Rate"}
          </Button>
        </div>
      </Card>

      {/* Default rates from profile */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Default Settings</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <Stat label="Default Rate" value={`${Number(a.default_shipping_rate_per_kg_bdt ?? 0).toFixed(2)} BDT/kg`} />
          <Stat label="Default Currency" value={a.default_currency ?? "—"} />
          <Stat label="Default FX" value={String(a.default_fx_rate ?? "—")} />
        </div>
        <p className="text-xs text-muted-foreground mt-3">Default edit korar jonno importer er sathe jogajog korun.</p>
      </Card>

      {/* History */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Rate History</h2>
        {(rates as any[]).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Kono rate submit kora hoyni.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
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
                      <td className="py-2">
                        <div className="font-medium">{fmtDate(r.rate_date)}</div>
                        {r.rate_date === today && <span className="text-[10px] text-primary">Today</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        <span className="font-medium">{Number(r.shipping_rate_per_kg_bdt).toFixed(2)}</span>
                        {prev && (
                          <span className={`ml-2 inline-flex items-center text-[11px] ${delta > 0 ? "text-rose-600" : delta < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {delta !== 0 ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{Number(r.fx_rate).toFixed(4)}</td>
                      <td className="py-2 pl-3 text-muted-foreground truncate max-w-[280px]">{r.note ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}