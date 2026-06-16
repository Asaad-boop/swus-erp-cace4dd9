import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, Scale, AlertTriangle, FileText, ArrowRight, Banknote, Smartphone, Truck, Users, RotateCcw, Receipt, PiggyBank, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
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

type DashboardData = {
  today_sales: number; today_orders: number;
  range_sales: number; range_orders: number;
  cash: number; bank: number; mfs: number;
  courier_cod_receivable: number; ar_due: number;
  supplier_payable: number;
  expense_total: number; other_income: number;
  net_profit: number; refund_loss: number;
  expense_by_category: Record<string, number>;
  monthly_series: { month: string; revenue: number; expense: number }[];
  accounts: { id: string; name: string; type: string; balance: number }[];
  recent_transactions: { id: string; date: string; type: string; amount: number; description: string | null; account: string | null; category: string | null }[];
};

const DONUT_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16", "#f97316", "#14b8a6"];

function OverviewPage() {
  const { activeBrand, brands } = useBrand();
  const [scope, setScope] = useState<"active" | "all">("active");
  const brandId = scope === "all" ? null : (activeBrand?.id ?? null);
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const dashQ = useQuery({
    queryKey: ["finance_dashboard", brandId, from, to],
    enabled: scope === "all" || !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_finance_dashboard" as never, { _brand_id: brandId, _from: from, _to: to } as never);
      if (error) throw error;
      return data as unknown as DashboardData;
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

  const d = dashQ.data;
  const expense = d?.expense_total ?? 0;
  const profit = d?.net_profit ?? 0;

  const topExpenses = useMemo(() => {
    const obj = d?.expense_by_category ?? {};
    return Object.entries(obj).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 10);
  }, [d]);

  const monthly = useMemo(() => (d?.monthly_series ?? []).map((m) => ({
    month: m.month.slice(5),
    Revenue: Number(m.revenue),
    Expense: Number(m.expense),
  })), [d]);

  const donutData = topExpenses.slice(0, 6).map(([name, value]) => ({ name, value: Number(value) }));

  if (scope === "active" && !brandId) {
    return <div className="p-6 text-muted-foreground">Select a brand to view finance.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground">{scope === "all" ? `All brands (${brands.length})` : activeBrand?.name} · {from} → {to}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[140px]">
            <Label className="text-xs">Brand</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "active" | "all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{activeBrand?.name ?? "Active brand"}</SelectItem>
                <SelectItem value="all">All brands</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Today Sales" value={fmtBdt(d?.today_sales ?? 0)} sub={`${d?.today_orders ?? 0} orders`} icon={<TrendingUp className="h-4 w-4" />} accent="text-emerald-600" />
        <Kpi label="Net Profit" value={fmtBdt(profit)} sub={d?.range_sales ? `${((profit / d.range_sales) * 100).toFixed(1)}% margin` : "—"} icon={<Scale className="h-4 w-4" />} accent={profit >= 0 ? "text-emerald-600" : "text-red-600"} />
        <Kpi label="Range Revenue" value={fmtBdt(d?.range_sales ?? 0)} sub={`${d?.range_orders ?? 0} delivered`} icon={<Receipt className="h-4 w-4" />} />
        <Kpi label="Total Expense" value={fmtBdt(expense)} icon={<TrendingDown className="h-4 w-4" />} accent="text-red-600" />
        <Kpi label="Refund / Loss" value={fmtBdt(d?.refund_loss ?? 0)} icon={<RotateCcw className="h-4 w-4" />} accent="text-amber-600" />
      </div>

      {/* Wallet KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Cash in Hand" value={fmtBdt(d?.cash ?? 0)} icon={<Banknote className="h-4 w-4" />} />
        <Kpi label="Bank Balance" value={fmtBdt(d?.bank ?? 0)} icon={<PiggyBank className="h-4 w-4" />} />
        <Kpi label="bKash / Nagad" value={fmtBdt(d?.mfs ?? 0)} icon={<Smartphone className="h-4 w-4" />} />
        <Kpi label="Courier COD Due" value={fmtBdt(d?.courier_cod_receivable ?? 0)} icon={<Truck className="h-4 w-4" />} accent="text-blue-600" />
        <Kpi label="Supplier Payable" value={fmtBdt(d?.supplier_payable ?? 0)} icon={<Users className="h-4 w-4" />} accent="text-orange-600" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Revenue vs Expense — last 12 months</CardTitle></CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No data.</p>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmtBdt(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Expense breakdown</CardTitle></CardHeader>
          <CardContent>
            {donutData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No expenses.</p>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                      {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtBdt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail row */}
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
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/accounts"><FileText className="h-4 w-4 mr-2" />Chart of Accounts</Link></Button>
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/payables"><Users className="h-4 w-4 mr-2" />Supplier Payables</Link></Button>
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/reconciliation"><Activity className="h-4 w-4 mr-2" />Bank Reconciliation</Link></Button>
            <Button asChild className="w-full justify-start" variant="outline"><Link to="/erp/finance/reports"><Scale className="h-4 w-4 mr-2" />Financial Reports</Link></Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Account balances</CardTitle></CardHeader>
          <CardContent>
            {(d?.accounts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts. <Link to="/erp/finance/simple" className="text-primary underline">Create one</Link>.</p>
            ) : (
              <div className="space-y-1.5">
                {(d?.accounts ?? []).slice(0, 8).map((a) => (
                  <div key={a.id} className="flex justify-between items-center border rounded-md px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">{a.type}</div>
                    </div>
                    <div className="font-mono font-semibold">{fmtBdt(a.balance)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent transactions</CardTitle></CardHeader>
          <CardContent>
            {(d?.recent_transactions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No transactions yet.</p>
            ) : (
              <div className="space-y-1.5">
                {(d?.recent_transactions ?? []).map((t) => (
                  <div key={t.id} className="flex justify-between items-center border rounded-md px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.description || t.category || t.type}</div>
                      <div className="text-xs text-muted-foreground">{t.date} · {t.account ?? "—"}</div>
                    </div>
                    <div className={`font-mono text-sm font-semibold ${t.type === "income" ? "text-emerald-600" : t.type === "expense" ? "text-red-600" : ""}`}>
                      {t.type === "expense" ? "−" : t.type === "income" ? "+" : ""}{fmtBdt(t.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
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
        <div className={`text-xl font-bold ${accent ?? ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}