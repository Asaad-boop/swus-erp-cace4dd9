import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, Scale, AlertTriangle, FileText, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtBdt } from "@/lib/erp/finance";

export const Route = createFileRoute("/_authenticated/erp/finance/")({
  head: () => ({ meta: [{ title: "Finance Overview — ERP" }] }),
  component: OverviewPage,
});

type Preset = "today" | "7d" | "30d" | "this_month" | "last_month" | "this_year" | "custom";

function rangeFor(preset: Preset, customFrom?: string, customTo?: string) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = (d: Date) => { d.setHours(0,0,0,0); return d; };
  switch (preset) {
    case "today": return { from: iso(today), to: iso(today) };
    case "7d": { const f = new Date(today); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(today) }; }
    case "30d": { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(today) }; }
    case "this_month": return { from: iso(start(new Date(today.getFullYear(), today.getMonth(), 1))), to: iso(today) };
    case "last_month": {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const t = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: iso(f), to: iso(t) };
    }
    case "this_year": return { from: `${today.getFullYear()}-01-01`, to: iso(today) };
    case "custom": return { from: customFrom || iso(today), to: customTo || iso(today) };
  }
}

function OverviewPage() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  // Cash & bank balances from simple accounts
  const cashQ = useQuery({
    queryKey: ["erp_accounts_overview", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erp_accounts").select("id, name, account_type, current_balance")
        .eq("brand_id", brandId!).eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pl = useQuery({
    queryKey: ["erp_pl_overview", brandId, from, to],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("erp_profit_loss", { _brand_id: brandId!, _from: from, _to: to });
      if (error) throw error;
      return data as { revenue: number; other_income: number; expense_total: number; profit: number; expense_by_category: Record<string, number>; delivered_orders: number };
    },
  });

  const periodLock = useQuery({
    queryKey: ["erp_period_lock", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data } = await supabase.from("erp_period_locks").select("locked_until").eq("brand_id", brandId!).maybeSingle();
      return data;
    },
  });

  const totalCash = (cashQ.data ?? []).filter((a) => ["cash", "mfs"].includes(a.account_type)).reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const totalBank = (cashQ.data ?? []).filter((a) => a.account_type === "bank").reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const revenue = pl.data?.revenue ?? 0;
  const expense = pl.data?.expense_total ?? 0;
  const profit = pl.data?.profit ?? 0;

  const topExpenses = useMemo(() => {
    const obj = pl.data?.expense_by_category ?? {};
    return Object.entries(obj).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 5);
  }, [pl.data]);

  if (!brandId) {
    return <div className="p-6 text-muted-foreground">Select a brand to view finance.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance Overview</h1>
          <p className="text-sm text-muted-foreground">{activeBrand?.name} · {from} → {to}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[160px]">
            <Label className="text-xs">Period</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="this_year">This year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div><Label className="text-xs">From</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
              <div><Label className="text-xs">To</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
            </>
          )}
        </div>
      </header>

      {periodLock.data?.locked_until && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          Books locked until <strong>{periodLock.data.locked_until}</strong>. Entries on or before this date can't be edited.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Cash / MFS" value={fmtBdt(totalCash)} icon={<Wallet className="h-4 w-4" />} accent="text-foreground" />
        <Kpi label="Bank" value={fmtBdt(totalBank)} icon={<Wallet className="h-4 w-4" />} accent="text-foreground" />
        <Kpi label="Revenue" value={fmtBdt(revenue)} sub={`${pl.data?.delivered_orders ?? 0} delivered`} icon={<TrendingUp className="h-4 w-4" />} accent="text-emerald-600" />
        <Kpi label="Expense" value={fmtBdt(expense)} icon={<TrendingDown className="h-4 w-4" />} accent="text-red-600" />
        <Kpi label="Net Profit" value={fmtBdt(profit)} icon={<Scale className="h-4 w-4" />} accent={profit >= 0 ? "text-emerald-600" : "text-red-600"} />
        <Kpi label="Other Income" value={fmtBdt(pl.data?.other_income ?? 0)} icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi label="Margin" value={revenue ? `${((profit / revenue) * 100).toFixed(1)}%` : "—"} icon={<Scale className="h-4 w-4" />} accent={profit >= 0 ? "text-emerald-600" : "text-red-600"} />
        <Kpi label="Active Accounts" value={String((cashQ.data ?? []).length)} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Top expense categories</CardTitle>
            <Button asChild size="sm" variant="ghost"><Link to="/erp/finance/reports">View reports <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </CardHeader>
          <CardContent>
            {topExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No expenses in this period.</p>
            ) : (
              <div className="space-y-2">
                {topExpenses.map(([name, amt]) => {
                  const pct = expense ? (Number(amt) / expense) * 100 : 0;
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-sm">
                        <span className="truncate">{name}</span>
                        <span className="font-mono">{fmtBdt(Number(amt))}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/journal"><FileText className="h-4 w-4 mr-2" />New Journal Entry</Link></Button>
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/simple"><Wallet className="h-4 w-4 mr-2" />Quick Income / Expense</Link></Button>
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/accounts"><BookOpenIcon /> Chart of Accounts</Link></Button>
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/reports"><Scale className="h-4 w-4 mr-2" />Financial Reports</Link></Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Account balances</CardTitle></CardHeader>
        <CardContent>
          {(cashQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No accounts. <Link to="/erp/finance/simple" className="text-primary underline">Create one</Link>.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {(cashQ.data ?? []).map((a) => (
                <div key={a.id} className="flex justify-between items-center border rounded-md px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">{a.account_type}</div>
                  </div>
                  <div className="font-mono font-semibold">{fmtBdt(a.current_balance)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon?: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
          {icon}{label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent ?? ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function BookOpenIcon() {
  return <FileText className="h-4 w-4 mr-2" />;
}