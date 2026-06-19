import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Wallet, Package, TrendingUp, TrendingDown, Banknote, Smartphone, Truck, Users,
  Receipt, AlertTriangle, FileText, ArrowRight, RotateCcw, Calendar, Building2,
  PiggyBank, Activity, ArrowDownRight, ArrowUpRight,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend, Line, ComposedChart,
} from "recharts";
import { useBrand } from "@/contexts/brand-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtBdt } from "@/lib/erp/finance";
import { getFinanceOverview, type FinanceOverview } from "@/lib/erp/finance-overview.functions";
import { FinanceDrilldownSheet } from "@/components/erp/finance/finance-drilldown-sheet";

export const Route = createFileRoute("/_authenticated/erp/finance/")({
  head: () => ({ meta: [{ title: "Finance Dashboard — ERP" }] }),
  component: OverviewPage,
});

type Preset = "today" | "7d" | "30d" | "this_month" | "last_month" | "this_year" | "custom";

function rangeFor(preset: Preset, customFrom?: string, customTo?: string) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = (d: Date) => { d.setHours(0, 0, 0, 0); return d; };
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

const PROVIDER_LABEL: Record<string, string> = {
  pathao: "Pathao", steadfast: "SteadFast", redx: "RedX",
  paperfly: "Paperfly", ecourier: "eCourier", no_shipment: "No shipment", unknown: "Other",
};

const DONUT_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16"];

function OverviewPage() {
  const { activeBrand, brands, brandIds, isAllBrands } = useBrand();
  const [preset, setPreset] = useState<Preset>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { from, to } = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const fetchOverview = useServerFn(getFinanceOverview);

  const q = useQuery({
    queryKey: ["finance_overview", brandIds.join(","), from, to],
    enabled: brandIds.length > 0,
    queryFn: () => fetchOverview({ data: { brandIds, from, to } }),
  });

  const [drill, setDrill] = useState<null | {
    title: string;
    subtitle?: string;
    type?: "revenue" | "expense" | "income" | "all";
    accountIds?: string[];
  }>(null);

  if (brandIds.length === 0) {
    return <div className="p-6 text-muted-foreground">Loading brands…</div>;
  }

  const d = q.data;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance & Accounting</h1>
          <p className="text-sm text-muted-foreground">
            {isAllBrands ? `All brands (${brands.length})` : activeBrand?.name} · {from} → {to}
          </p>
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

      {q.isLoading && <div className="text-sm text-muted-foreground">Loading dashboard…</div>}
      {q.error && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}

      {d && (
        <>
          <CapitalStrip data={d} onDrill={setDrill} />
          <PnlStrip data={d} onDrill={setDrill} />
          <MoneyMap data={d} />
          <TrendsRow data={d} />
          <QuickLinks />
          <RecentTxns data={d} />
        </>
      )}
      <FinanceDrilldownSheet
        open={!!drill}
        onOpenChange={(o) => { if (!o) setDrill(null); }}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        brandIds={brandIds}
        from={from}
        to={to}
        type={drill?.type}
        accountIds={drill?.accountIds}
      />
    </div>
  );
}

/* ---------------- Zone 1: Capital ---------------- */
function CapitalStrip({ data, onDrill }: {
  data: FinanceOverview;
  onDrill: (d: { title: string; subtitle?: string; type?: "revenue" | "expense" | "income" | "all"; accountIds?: string[] }) => void;
}) {
  const { capital } = data;
  const cashAccountIds = data.accounts
    .filter((a) => ["cash", "bank", "bkash", "nagad", "rocket", "mfs"].includes(a.type))
    .map((a) => a.id);
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <HeroKpi
        icon={<PiggyBank className="size-5" />}
        label="Total Capital"
        value={capital.total}
        tone="primary"
        hint="Liquid + Inventory + Receivables − Payables"
        onClick={() => onDrill({ title: "All transactions", type: "all" })}
      />
      <HeroKpi
        icon={<Wallet className="size-5" />}
        label="Liquid Cash"
        value={capital.liquid}
        tone="emerald"
        hint={`Cash ${fmtBdt(capital.breakdown.cash)} · Bank ${fmtBdt(capital.breakdown.bank)} · MFS ${fmtBdt(capital.breakdown.mfs)}`}
        onClick={() => onDrill({ title: "Liquid cash movements", subtitle: "Cash + Bank + MFS accounts", type: "all", accountIds: cashAccountIds })}
      />
      <HeroKpi
        icon={<Package className="size-5" />}
        label="Inventory Value"
        value={capital.inventory}
        tone="amber"
        hint={capital.productsMissingCost > 0 ? `${capital.productsMissingCost} product(s) missing cost` : "All stock costed"}
        warn={capital.productsMissingCost > 0}
      />
      <HeroKpi
        icon={capital.receivableNet >= 0 ? <ArrowDownRight className="size-5" /> : <ArrowUpRight className="size-5" />}
        label={capital.receivableNet >= 0 ? "Net Receivable" : "Net Payable"}
        value={Math.abs(capital.receivableNet)}
        tone={capital.receivableNet >= 0 ? "sky" : "rose"}
        hint={`COD ${fmtBdt(capital.breakdown.codReceivable)} + AR ${fmtBdt(capital.breakdown.arDue)} + Adv ${fmtBdt(capital.breakdown.importsAdvance)} − Pay ${fmtBdt(capital.breakdown.supplierPayable + capital.breakdown.importsDue)}`}
      />
    </section>
  );
}

function HeroKpi({ icon, label, value, hint, tone, warn, onClick }: {
  icon: React.ReactNode; label: string; value: number; hint?: string;
  tone: "primary" | "emerald" | "amber" | "sky" | "rose"; warn?: boolean; onClick?: () => void;
}) {
  const toneClass = {
    primary: "from-primary/15 to-primary/5 text-primary",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    amber: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
    sky: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400",
    rose: "from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <Card className={`bg-gradient-to-br ${toneClass} border-border/60 ${onClick ? "cursor-pointer hover:ring-1 hover:ring-primary/40 transition" : ""}`}>
      <CardContent className="p-4" onClick={onClick} role={onClick ? "button" : undefined}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <span className={`rounded-md p-1.5 bg-background/60`}>{icon}</span>
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">{fmtBdt(value)}</div>
        {hint && (
          <div className={`mt-1 text-[11px] ${warn ? "text-amber-600 dark:text-amber-400 flex items-center gap-1" : "text-muted-foreground"} truncate`} title={hint}>
            {warn && <AlertTriangle className="size-3" />}{hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Zone 2: P&L ---------------- */
function PnlStrip({ data, onDrill }: {
  data: FinanceOverview;
  onDrill: (d: { title: string; subtitle?: string; type?: "revenue" | "expense" | "income" | "all"; accountIds?: string[] }) => void;
}) {
  const { pnl } = data;
  const items: Array<{
    label: string; value: number; color: string; icon: React.ReactNode;
    drill?: { title: string; type?: "revenue" | "expense" | "income" | "all" };
  }> = [
    { label: "Revenue", value: pnl.revenue, color: "text-foreground", icon: <Banknote className="size-4" />, drill: { title: "Revenue (orders & income)", type: "income" } },
    { label: "COGS", value: pnl.cogs, color: "text-muted-foreground", icon: <Package className="size-4" /> },
    { label: "Gross", value: pnl.gross, color: "text-foreground", icon: <TrendingUp className="size-4" /> },
    { label: "Operating Exp.", value: pnl.expense, color: "text-rose-600 dark:text-rose-400", icon: <Receipt className="size-4" />, drill: { title: "Operating expenses", type: "expense" } },
    { label: "Refund Loss", value: pnl.refundLoss, color: "text-amber-600 dark:text-amber-400", icon: <RotateCcw className="size-4" /> },
  ];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div
            className="md:col-span-4 p-5 bg-gradient-to-br from-primary/10 to-transparent border-r border-border/60 cursor-pointer hover:bg-primary/5 transition"
            onClick={() => onDrill({ title: "Net profit — all transactions", type: "all" })}
            role="button"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="size-4" /> Net Profit ({data.range.from} → {data.range.to})
            </div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${pnl.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {pnl.net >= 0 ? "+" : ""}{fmtBdt(pnl.net)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Margin {pnl.margin.toFixed(1)}% · Other income {fmtBdt(pnl.otherIncome)}
            </div>
            <div className="mt-3 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnl.dailySeries.map(d => ({ ...d, net: d.net }))}>
                  <defs>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5}/>
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" fill="url(#netGrad)" strokeWidth={1.5} />
                  <Tooltip formatter={(v: number) => fmtBdt(v)} labelFormatter={(l) => `Day ${l}`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-5 divide-x divide-border/60">
            {items.map((it) => (
              <div
                key={it.label}
                className={`p-4 ${it.drill ? "cursor-pointer hover:bg-muted/40 transition" : ""}`}
                onClick={it.drill ? () => onDrill(it.drill!) : undefined}
                role={it.drill ? "button" : undefined}
              >
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{it.icon}{it.label}</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums ${it.color}`}>{fmtBdt(it.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Zone 3: Money Map ---------------- */
function MoneyMap({ data }: { data: FinanceOverview }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <WhereMoneyIs data={data} />
      <MoneyComingIn data={data} />
      <MoneyGoingOut data={data} />
    </section>
  );
}

function WhereMoneyIs({ data }: { data: FinanceOverview }) {
  const grouped = useMemo(() => {
    const groups: Record<string, { name: string; balance: number; icon: React.ReactNode; items: typeof data.accounts }> = {
      cash: { name: "Cash", balance: 0, icon: <Banknote className="size-4" />, items: [] },
      bank: { name: "Bank", balance: 0, icon: <Building2 className="size-4" />, items: [] },
      mfs: { name: "Mobile Wallet", balance: 0, icon: <Smartphone className="size-4" />, items: [] },
      other: { name: "Other", balance: 0, icon: <Wallet className="size-4" />, items: [] },
    };
    for (const a of data.accounts) {
      const key = a.type === "cash" ? "cash" : a.type === "bank" ? "bank" : ["bkash","nagad","rocket","mfs"].includes(a.type) ? "mfs" : "other";
      groups[key].balance += a.balance;
      groups[key].items.push(a);
    }
    return groups;
  }, [data.accounts]);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wallet className="size-4" /> Where my money is</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(grouped).filter(([,g]) => g.items.length > 0).map(([k, g]) => (
          <div key={k}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium">{g.icon}{g.name}</span>
              <span className="tabular-nums font-semibold">{fmtBdt(g.balance)}</span>
            </div>
            <div className="mt-1 space-y-0.5 pl-5">
              {g.items.slice(0, 5).map(a => (
                <div key={a.id} className="flex justify-between text-xs text-muted-foreground">
                  <span className="truncate">{a.name}</span>
                  <span className="tabular-nums">{fmtBdt(a.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {data.inventoryByBrand.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <div className="text-sm font-medium flex items-center gap-1.5 mb-1"><Package className="size-4" /> Inventory by brand</div>
            {data.inventoryByBrand.slice(0, 6).map(b => (
              <div key={b.brand_id} className="flex justify-between text-xs">
                <span className="truncate text-muted-foreground">{b.brand} · {b.units} units</span>
                <span className="tabular-nums">{fmtBdt(b.value)}</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/erp/finance/accounts" className="text-xs text-primary inline-flex items-center gap-1 pt-1">View all accounts <ArrowRight className="size-3" /></Link>
      </CardContent>
    </Card>
  );
}

function MoneyComingIn({ data }: { data: FinanceOverview }) {
  const { receivables, capital, pnl } = data;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><ArrowDownRight className="size-4" /> Money coming in</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Section title="COD from courier" total={capital.breakdown.codReceivable} icon={<Truck className="size-4" />}>
          {receivables.codByCourier.length === 0
            ? <Empty>No shipped orders</Empty>
            : receivables.codByCourier.map(c => (
              <Row key={c.provider} label={`${PROVIDER_LABEL[c.provider] ?? c.provider} · ${c.orders}`} value={c.amount} />
            ))}
        </Section>
        {receivables.arTop.length > 0 && (
          <Section title="AR — top customers" total={capital.breakdown.arDue} icon={<Users className="size-4" />}>
            {receivables.arTop.map(c => (
              <Row key={c.phone ?? c.name} label={`${c.name} · ${c.orders}`} value={c.amount} sub={c.phone ?? undefined} />
            ))}
          </Section>
        )}
        {receivables.importsAdvanceTop.length > 0 && (
          <Section title="Imports advance" total={capital.breakdown.importsAdvance} icon={<Package className="size-4" />}>
            {receivables.importsAdvanceTop.map(p => (
              <Row key={p.po} label={`${p.po} · ${p.supplier}`} value={p.amount} />
            ))}
          </Section>
        )}
        {pnl.otherIncome > 0 && (
          <div className="flex justify-between text-sm pt-2 border-t border-border/60">
            <span className="text-muted-foreground">Other income (range)</span>
            <span className="tabular-nums font-medium">{fmtBdt(pnl.otherIncome)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoneyGoingOut({ data }: { data: FinanceOverview }) {
  const { payables, capital } = data;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2 text-rose-600 dark:text-rose-400"><ArrowUpRight className="size-4" /> Money going out</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Section title="Supplier payable" total={capital.breakdown.supplierPayable} icon={<Receipt className="size-4" />}
          rightBadge={payables.overdueBills > 0 ? <Badge variant="destructive" className="text-[10px]">{fmtBdt(payables.overdueBills)} overdue</Badge> : undefined}>
          {payables.supplierTop.length === 0
            ? <Empty>No open bills</Empty>
            : payables.supplierTop.map(s => <Row key={s.name} label={s.name} value={s.due} />)}
        </Section>
        {payables.importsDueTop.length > 0 && (
          <Section title="Imports due" total={capital.breakdown.importsDue} icon={<Package className="size-4" />}>
            {payables.importsDueTop.map(p => (
              <Row key={p.po} label={`${p.po} · ${p.supplier}`} value={p.due} sub={p.status} />
            ))}
          </Section>
        )}
        {payables.upcomingRecurring.length > 0 && (
          <Section title="Upcoming recurring (30d)" total={payables.upcomingRecurring.reduce((s, r) => s + r.amount, 0)} icon={<Calendar className="size-4" />}>
            {payables.upcomingRecurring.slice(0, 6).map(r => (
              <Row key={r.id} label={r.name} value={r.amount} sub={new Date(r.next_run).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} />
            ))}
          </Section>
        )}
        {payables.topExpenseCats.length > 0 && (
          <Section title="Top expense categories" icon={<Activity className="size-4" />}>
            {payables.topExpenseCats.map(c => <Row key={c.name} label={c.name} value={c.amount} />)}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, total, icon, children, rightBadge }: {
  title: string; total?: number; icon?: React.ReactNode; children: React.ReactNode; rightBadge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">{icon}{title}</span>
        <span className="flex items-center gap-2">
          {rightBadge}
          {total != null && <span className="tabular-nums">{fmtBdt(total)}</span>}
        </span>
      </div>
      <div className="mt-1 space-y-0.5 pl-5">{children}</div>
    </div>
  );
}
function Row({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="flex justify-between text-xs gap-2">
      <span className="truncate text-muted-foreground">
        {label}{sub && <span className="opacity-70"> · {sub}</span>}
      </span>
      <span className="tabular-nums shrink-0">{fmtBdt(value)}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground italic">{children}</div>;
}

/* ---------------- Zone 4: Trends ---------------- */
function TrendsRow({ data }: { data: FinanceOverview }) {
  const monthly = data.monthlySeries.map(m => ({
    month: m.month.slice(5),
    Revenue: m.revenue, Expense: m.expense, Net: m.net,
  }));
  const donut = data.payables.topExpenseCats.map(c => ({ name: c.name, value: c.amount }));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-base">12 months · Revenue vs Expense vs Net</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`} />
              <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Revenue" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
              <Bar dataKey="Expense" fill="hsl(var(--destructive))" radius={[4,4,0,0]} />
              <Line type="monotone" dataKey="Net" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Expense breakdown</CardTitle></CardHeader>
        <CardContent className="h-72">
          {donut.length === 0 ? <div className="text-sm text-muted-foreground text-center pt-12">No expenses in range</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                  {donut.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtBdt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/* ---------------- Quick Links ---------------- */
function QuickLinks() {
  const links: { to: string; label: string; icon: React.ReactNode }[] = [
    { to: "/erp/finance/accounts", label: "Accounts", icon: <Wallet className="size-4" /> },
    { to: "/erp/finance/receivables", label: "Receivables", icon: <ArrowDownRight className="size-4" /> },
    { to: "/erp/finance/payables", label: "Payables", icon: <ArrowUpRight className="size-4" /> },
    { to: "/erp/finance/recurring", label: "Recurring", icon: <Calendar className="size-4" /> },
    { to: "/erp/finance/reconciliation", label: "Reconciliation", icon: <FileText className="size-4" /> },
    { to: "/erp/finance/journal", label: "Journal", icon: <FileText className="size-4" /> },
    { to: "/erp/finance/reports", label: "Reports", icon: <Activity className="size-4" /> },
    { to: "/erp/finance/budgets", label: "Budgets", icon: <TrendingUp className="size-4" /> },
    { to: "/erp/finance/fx", label: "FX rates", icon: <TrendingDown className="size-4" /> },
  ];
  return (
    <section className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
      {links.map(l => (
        <Link key={l.to} to={l.to} className="rounded-md border border-border/60 bg-card hover:bg-muted/50 transition px-3 py-2 text-xs flex items-center gap-1.5">
          {l.icon}{l.label}
        </Link>
      ))}
    </section>
  );
}

/* ---------------- Recent Transactions ---------------- */
function RecentTxns({ data }: { data: FinanceOverview }) {
  if (data.recentTxns.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent transactions</CardTitle>
        <Link to="/erp/finance/journal" className="text-xs text-primary inline-flex items-center gap-1">View journal <ArrowRight className="size-3" /></Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/60">
          {data.recentTxns.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <Badge variant={t.type === "income" ? "default" : t.type === "expense" ? "destructive" : "secondary"} className="text-[10px] capitalize">{t.type}</Badge>
              <div className="flex-1 min-w-0">
                <div className="truncate">{t.description || <span className="text-muted-foreground">—</span>}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t.date}{t.account && ` · ${t.account}`}{t.category && ` · ${t.category}`}
                </div>
              </div>
              <div className={`tabular-nums font-medium ${t.type === "income" ? "text-emerald-600 dark:text-emerald-400" : t.type === "expense" ? "text-rose-600 dark:text-rose-400" : ""}`}>
                {t.type === "expense" ? "-" : t.type === "income" ? "+" : ""}{fmtBdt(t.amount)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
