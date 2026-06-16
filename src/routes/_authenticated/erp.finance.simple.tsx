import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Plus, Wallet, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAccounts, useCategories, useTransactions, useProfitLoss, type TxnFilter,
} from "@/hooks/erp/use-finance-query";
import { exportTransactionsCsv, fmtBdt, TXN_TYPE_LABEL, type TxnType } from "@/lib/erp/finance";
import { downloadCsv } from "@/lib/erp/orders";
import { TransactionForm } from "@/components/erp/finance/transaction-form";
import { AccountForm } from "@/components/erp/finance/account-form";

export const Route = createFileRoute("/_authenticated/erp/finance/simple")({
  head: () => ({ meta: [{ title: "Finance — ERP" }] }),
  component: FinancePage,
});

function FinancePage() {
  const { activeBrand } = useBrand();
  const brandId = activeBrand?.id ?? null;

  const accountsQ = useAccounts(brandId);
  const categoriesQ = useCategories(brandId);

  const [txnOpen, setTxnOpen] = useState<{ open: boolean; type: TxnType }>({ open: false, type: "income" });
  const [acctOpen, setAcctOpen] = useState(false);

  const accounts = accountsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const totalCash = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <p className="text-sm text-muted-foreground">{activeBrand?.name} · Cash on hand: <span className="font-semibold text-foreground">{fmtBdt(totalCash)}</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setTxnOpen({ open: true, type: "income" })}><TrendingUp className="h-4 w-4 mr-1" />Income</Button>
          <Button variant="outline" size="sm" onClick={() => setTxnOpen({ open: true, type: "expense" })}><TrendingDown className="h-4 w-4 mr-1" />Expense</Button>
          <Button variant="outline" size="sm" onClick={() => setTxnOpen({ open: true, type: "transfer" })}><ArrowRightLeft className="h-4 w-4 mr-1" />Transfer</Button>
        </div>
      </header>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="reports">P&amp;L Report</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAcctOpen(true)}><Plus className="h-4 w-4 mr-1" />New Account</Button>
          </div>
          {accountsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!accountsQ.isLoading && accounts.length === 0 && (
            <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">
              No accounts yet. Create your first account (cash, bank, bKash, etc.).
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts.map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2"><Wallet className="h-4 w-4 text-muted-foreground" />{a.name}</span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">{a.account_type}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{fmtBdt(a.current_balance)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Opening: {fmtBdt(a.opening_balance)}</div>
                  <AdjustButton accountId={a.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-3">
          <TransactionsTab brandId={brandId} />
        </TabsContent>

        <TabsContent value="categories" className="mt-3">
          <CategoriesTab brandId={brandId} />
        </TabsContent>

        <TabsContent value="reports" className="mt-3">
          <ReportsTab brandId={brandId} />
        </TabsContent>
      </Tabs>

      <TransactionForm
        open={txnOpen.open}
        onClose={() => setTxnOpen({ ...txnOpen, open: false })}
        brandId={brandId}
        accounts={accounts}
        categories={categories}
        defaultType={txnOpen.type}
      />
      <AccountForm open={acctOpen} onClose={() => setAcctOpen(false)} brandId={brandId} />
    </div>
  );
}

function AdjustButton({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const d = Number(delta);
      if (!d) throw new Error("Delta required");
      if (!reason.trim()) throw new Error("Reason required");
      const { error } = await supabase.rpc("adjust_account_balance", {
        _account_id: accountId, _delta: d, _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Balance adjusted");
      qc.invalidateQueries({ queryKey: ["erp_accounts"] });
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
      setDelta(""); setReason(""); setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => setOpen(true)}>Adjust balance</Button>;
  }
  return (
    <div className="mt-2 space-y-1.5 border-t pt-2">
      <div className="grid grid-cols-3 gap-1.5">
        <Input type="number" placeholder="±delta" value={delta} onChange={(e) => setDelta(e.target.value)} className="col-span-1 h-8 text-xs" />
        <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="col-span-2 h-8 text-xs" />
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs flex-1" onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function TransactionsTab({ brandId }: { brandId: string | null }) {
  const accountsQ = useAccounts(brandId);
  const categoriesQ = useCategories(brandId);
  const [filter, setFilter] = useState<TxnFilter>({
    brandId: null, type: "all", accountId: null, from: null, to: null, search: "", limit: 200,
  });
  const effective = useMemo<TxnFilter>(() => ({ ...filter, brandId }), [filter, brandId]);
  const { data: rows = [], isLoading } = useTransactions(effective);

  const catMap = useMemo(() => new Map((categoriesQ.data ?? []).map((c) => [c.id, c.name])), [categoriesQ.data]);
  const accMap = useMemo(() => new Map((accountsQ.data ?? []).map((a) => [a.id, a.name])), [accountsQ.data]);

  const handleExport = () => {
    const csv = exportTransactionsCsv(rows, catMap, accMap);
    downloadCsv(`transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]"><Label className="text-xs">Search</Label><Input placeholder="Description…" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} /></div>
        <div className="min-w-[120px]">
          <Label className="text-xs">Type</Label>
          <Select value={filter.type} onValueChange={(v: TxnFilter["type"]) => setFilter({ ...filter, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-xs">Account</Label>
          <Select value={filter.accountId ?? "all"} onValueChange={(v) => setFilter({ ...filter, accountId: v === "all" ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(accountsQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={filter.from ?? ""} onChange={(e) => setFilter({ ...filter, from: e.target.value || null })} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={filter.to ?? ""} onChange={(e) => setFilter({ ...filter, to: e.target.value || null })} /></div>
        <Button variant="outline" onClick={handleExport} disabled={!rows.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions</TableCell></TableRow>}
            {rows.map((t) => {
              const meta = TXN_TYPE_LABEL[t.txn_type] ?? { label: t.txn_type, className: "" };
              const sign = t.txn_type === "expense" ? -1 : 1;
              return (
                <TableRow key={t.id}>
                  <TableCell className="text-xs whitespace-nowrap">{t.transaction_date}</TableCell>
                  <TableCell><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span></TableCell>
                  <TableCell className="text-xs">{t.category_id ? catMap.get(t.category_id) ?? "—" : "—"}</TableCell>
                  <TableCell className="text-xs">
                    {t.account_id ? accMap.get(t.account_id) ?? "—" : "—"}
                    {t.to_account_id && <> → {accMap.get(t.to_account_id) ?? "—"}</>}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${sign < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {sign < 0 ? "−" : "+"}{fmtBdt(t.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]">{t.description ?? ""}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CategoriesTab({ brandId }: { brandId: string | null }) {
  const qc = useQueryClient();
  const { data: cats = [], isLoading } = useCategories(brandId);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("expense");

  const add = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("No brand");
      if (!name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("erp_expense_categories").insert({
        brand_id: brandId, name: name.trim(), kind, is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Category added"); setName(""); qc.invalidateQueries({ queryKey: ["erp_categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_expense_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["erp_categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex gap-2 items-end">
        <div className="flex-1"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing" /></div>
        <div className="min-w-[140px]">
          <Label className="text-xs">Kind</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && cats.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No categories</TableCell></TableRow>}
            {cats.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-xs uppercase tracking-wider text-muted-foreground">{c.kind}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(c.id)} disabled={remove.isPending}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ReportsTab({ brandId }: { brandId: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const { data, isLoading } = useProfitLoss(brandId, from, to);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Calculating…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Revenue</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600">{fmtBdt(data.revenue)}</div><div className="text-xs text-muted-foreground">{data.delivered_orders} delivered</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Other Income</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmtBdt(data.other_income)}</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Expense</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{fmtBdt(data.expense_total)}</div></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Profit</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${data.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBdt(data.profit)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Expense breakdown</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(data.expense_by_category ?? {}).length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses in this range.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">% of total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(data.expense_by_category)
                      .sort((a, b) => Number(b[1]) - Number(a[1]))
                      .map(([name, amt]) => (
                        <TableRow key={name}>
                          <TableCell>{name}</TableCell>
                          <TableCell className="text-right font-mono">{fmtBdt(Number(amt))}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {data.expense_total ? ((Number(amt) / data.expense_total) * 100).toFixed(1) : "0"}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}