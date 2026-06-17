import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmtBdt } from "@/lib/erp/finance";

export const Route = createFileRoute("/_authenticated/erp/finance/reports")({
  head: () => ({ meta: [{ title: "Financial Reports — ERP" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap justify-between items-end gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-sm text-muted-foreground">{effectiveBrand?.name}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          {picker}
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To / As of</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button variant="outline" size="icon" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
        </div>
      </header>

      <Tabs defaultValue="pl">
        <TabsList className="print:hidden">
          <TabsTrigger value="pl">P&amp;L</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="tb">Trial Balance</TabsTrigger>
          <TabsTrigger value="gl">General Ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="pl" className="mt-3"><PLReport brandId={brandId} from={from} to={to} /></TabsContent>
        <TabsContent value="bs" className="mt-3"><BalanceSheetReport brandId={brandId} asOf={to} /></TabsContent>
        <TabsContent value="tb" className="mt-3"><TrialBalanceReport brandId={brandId} asOf={to} /></TabsContent>
        <TabsContent value="gl" className="mt-3"><GeneralLedgerReport brandId={brandId} from={from} to={to} /></TabsContent>
      </Tabs>
    </div>
  );
}

function PLReport({ brandId, from, to }: { brandId: string; from: string; to: string }) {
  const q = useQuery({
    queryKey: ["pl_v2", brandId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_pl_v2", { _brand_id: brandId, _from: from, _to: to });
      if (error) throw error;
      return data as { income_accounts: Array<{ code: string; name: string; amount: number }>; expense_accounts: Array<{ code: string; name: string; amount: number }>; total_income: number; total_expense: number; net_profit: number };
    },
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Calculating…</p>;
  if (!q.data) return null;
  const d = q.data;
  return (
    <Card>
      <CardHeader><CardTitle>Profit &amp; Loss · {from} → {to}</CardTitle></CardHeader>
      <CardContent>
        <Section title="Income" rows={d.income_accounts} total={d.total_income} totalLabel="Total Income" color="text-emerald-600" />
        <Section title="Expenses" rows={d.expense_accounts} total={d.total_expense} totalLabel="Total Expense" color="text-red-600" />
        <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-foreground">
          <span className="text-lg font-bold">Net Profit</span>
          <span className={`text-2xl font-bold font-mono ${d.net_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBdt(d.net_profit)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, rows, total, totalLabel, color }: { title: string; rows: Array<{ code: string; name: string; amount: number }>; total: number; totalLabel: string; color: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground pl-4">No activity.</p>
      ) : (
        <div className="space-y-1 pl-4">
          {rows.map((r) => (
            <div key={r.code} className="flex justify-between text-sm">
              <span><span className="text-muted-foreground font-mono text-xs mr-2">{r.code}</span>{r.name}</span>
              <span className="font-mono">{fmtBdt(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between pt-2 mt-2 border-t font-semibold">
        <span>{totalLabel}</span>
        <span className={`font-mono ${color}`}>{fmtBdt(total)}</span>
      </div>
    </div>
  );
}

function BalanceSheetReport({ brandId, asOf }: { brandId: string; asOf: string }) {
  const q = useQuery({
    queryKey: ["bs", brandId, asOf],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_balance_sheet", { _brand_id: brandId, _as_of: asOf });
      if (error) throw error;
      return data as { assets: Array<{ code: string; name: string; amount: number }>; liabilities: Array<{ code: string; name: string; amount: number }>; equity: Array<{ code: string; name: string; amount: number }>; total_assets: number; total_liabilities: number; total_equity: number; retained_earnings: number; balanced: boolean };
    },
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Calculating…</p>;
  if (!q.data) return null;
  const d = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Balance Sheet · as of {asOf}
          <Badge variant={d.balanced ? "default" : "destructive"}>{d.balanced ? "Balanced" : "Out of balance"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Section title="Assets" rows={d.assets} total={d.total_assets} totalLabel="Total Assets" color="text-blue-600" />
        </div>
        <div>
          <Section title="Liabilities" rows={d.liabilities} total={d.total_liabilities} totalLabel="Total Liabilities" color="text-orange-600" />
          <Section title="Equity (incl. retained earnings)" rows={d.equity} total={d.total_equity} totalLabel="Total Equity" color="text-purple-600" />
          <div className="flex justify-between pt-2 mt-2 border-t-2 border-foreground font-bold">
            <span>Liabilities + Equity</span>
            <span className="font-mono">{fmtBdt(d.total_liabilities + d.total_equity)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrialBalanceReport({ brandId, asOf }: { brandId: string; asOf: string }) {
  const q = useQuery({
    queryKey: ["tb", brandId, asOf],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_trial_balance", { _brand_id: brandId, _as_of: asOf });
      if (error) throw error;
      return (data ?? []) as Array<{ account_id: string; code: string; name: string; account_type: string; normal_balance: string; total_debit: number; total_credit: number; balance: number }>;
    },
  });
  const rows = q.data ?? [];
  const td = rows.reduce((s, r) => s + Number(r.total_debit || 0), 0);
  const tc = rows.reduce((s, r) => s + Number(r.total_credit || 0), 0);
  return (
    <Card>
      <CardHeader><CardTitle>Trial Balance · as of {asOf}</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead>
              <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!q.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No data</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-xs uppercase tracking-wider text-muted-foreground">{r.account_type}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBdt(r.total_debit)}</TableCell>
                  <TableCell className="text-right font-mono">{fmtBdt(r.total_credit)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{fmtBdt(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end gap-6 mt-3 text-sm">
          <span>Total Debit: <span className="font-mono font-bold">{fmtBdt(td)}</span></span>
          <span>Total Credit: <span className="font-mono font-bold">{fmtBdt(tc)}</span></span>
          <span className={Math.abs(td - tc) < 0.01 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
            {Math.abs(td - tc) < 0.01 ? "✓ Books balanced" : `Diff: ${fmtBdt(Math.abs(td - tc))}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function GeneralLedgerReport({ brandId, from, to }: { brandId: string; from: string; to: string }) {
  const [accountId, setAccountId] = useState<string>("");
  const coaQ = useQuery({
    queryKey: ["coa_simple", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts").select("id, code, name")
        .eq("brand_id", brandId).eq("is_archived", false).order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const glQ = useQuery({
    queryKey: ["gl", brandId, accountId, from, to],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_general_ledger", { _brand_id: brandId, _account_id: accountId, _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as Array<{ entry_date: string; entry_no: string; description: string | null; debit: number; credit: number; running_balance: number }>;
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          <span>General Ledger</span>
          <div className="min-w-[280px]">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Choose account…" /></SelectTrigger>
              <SelectContent>
                {(coaQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!accountId ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Choose an account to view ledger.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Entry No</TableHead><TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {glQ.isLoading && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
                {!glQ.isLoading && (glQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No entries in this range</TableCell></TableRow>}
                {(glQ.data ?? []).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{r.entry_date}</TableCell>
                    <TableCell className="font-mono text-xs">{r.entry_no}</TableCell>
                    <TableCell className="text-sm">{r.description ?? ""}</TableCell>
                    <TableCell className="text-right font-mono">{r.debit ? fmtBdt(r.debit) : ""}</TableCell>
                    <TableCell className="text-right font-mono">{r.credit ? fmtBdt(r.credit) : ""}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtBdt(r.running_balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}