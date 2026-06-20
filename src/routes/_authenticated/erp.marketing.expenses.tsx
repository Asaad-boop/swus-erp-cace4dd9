import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ExternalLink, Download, Search } from "lucide-react";
import { format } from "date-fns";

import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
  listMarketingExpenses,
  listExpenseFormOptions,
  createMarketingExpense,
  deleteMarketingExpense,
} from "@/lib/erp/marketing/expenses.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/expenses")({
  component: ExpensesPage,
});

const CATEGORY_OPTIONS = [
  { value: "influencer", label: "Influencer" },
  { value: "content", label: "UGC / Content" },
  { value: "photoshoot", label: "Photoshoot" },
  { value: "agency", label: "Agency" },
  { value: "boost", label: "Boosted Post" },
  { value: "print_design", label: "Print / Design" },
  { value: "event", label: "Event" },
  { value: "sms_email", label: "SMS / Email" },
  { value: "other", label: "Other" },
] as const;

const NONE = "__none__";

function categoryBadge(c: string) {
  const map: Record<string, string> = {
    influencer: "bg-purple-100 text-purple-800",
    content: "bg-blue-100 text-blue-800",
    photoshoot: "bg-pink-100 text-pink-800",
    agency: "bg-amber-100 text-amber-800",
    boost: "bg-emerald-100 text-emerald-800",
    print_design: "bg-orange-100 text-orange-800",
    event: "bg-fuchsia-100 text-fuchsia-800",
    sms_email: "bg-cyan-100 text-cyan-800",
    other: "bg-slate-100 text-slate-800",
  };
  const label = CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;
  return <Badge className={`${map[c] ?? "bg-slate-100 text-slate-800"} hover:opacity-90`}>{label}</Badge>;
}

function ExpensesPage() {
  const qc = useQueryClient();
  const { activeBrand, brands, isAllBrands } = useBrand();
  const [pickedBrandId, setPickedBrandId] = useState<string>("");
  const effectiveBrand = activeBrand ?? brands.find((b) => b.id === pickedBrandId) ?? null;
  const brandId = effectiveBrand?.id ?? null;

  const [open, setOpen] = useState(false);
  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("__all__");
  const [filterProduct, setFilterProduct] = useState<string>("__all__");
  const [filterCampaign, setFilterCampaign] = useState<string>("__all__");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listMarketingExpenses);
  const optsFn = useServerFn(listExpenseFormOptions);
  const createFn = useServerFn(createMarketingExpense);
  const deleteFn = useServerFn(deleteMarketingExpense);

  const expensesQ = useQuery({
    queryKey: ["mkt", "expenses", brandId, filterFrom, filterTo],
    queryFn: () => listFn({ data: { brandId: brandId!, from: filterFrom || undefined, to: filterTo || undefined } }),
    enabled: !!brandId,
  });

  const optsQ = useQuery({
    queryKey: ["mkt", "expense-form-opts", brandId],
    queryFn: () => optsFn({ data: { brandId: brandId! } }),
    enabled: !!brandId,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["mkt", "expenses", brandId] });
      qc.invalidateQueries({ queryKey: ["erp_transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allRows = expensesQ.data ?? [];

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (allRows as any[]).filter((r) => {
      if (filterCategory !== "__all__" && r.category !== filterCategory) return false;
      if (filterProduct !== "__all__" && r.product_id !== filterProduct) return false;
      if (filterCampaign !== "__all__" && r.campaign_id !== filterCampaign) return false;
      if (term && !(`${r.vendor ?? ""} ${r.note ?? ""}`.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [allRows, filterCategory, filterProduct, filterCampaign, search]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r: any) => s + Number(r.amount || 0), 0);
    const posted = rows.filter((r: any) => r.transaction_id).length;
    return { total, posted, count: rows.length };
  }, [rows]);

  // Per-subtype monthly totals (current month, scoped to all rows in window)
  const monthSubtotals = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const m = new Map<string, number>();
    for (const r of allRows as any[]) {
      if (!(r.date ?? "").startsWith(ym)) continue;
      m.set(r.category, (m.get(r.category) ?? 0) + Number(r.amount || 0));
    }
    return m;
  }, [allRows]);

  const downloadCsv = () => {
    const header = ["Date", "Category", "Vendor", "Product", "Campaign", "Account", "Amount", "Currency", "Posted", "Note"];
    const lines = [header.join(",")];
    for (const r of rows as any[]) {
      const cells = [
        r.date ?? "",
        r.category ?? "",
        r.vendor ?? "",
        r.products?.name ?? "",
        r.mkt_campaigns?.name ?? "",
        r.erp_accounts?.name ?? "",
        String(r.amount ?? 0),
        r.currency ?? "BDT",
        r.transaction_id ? "Yes" : "No",
        r.note ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketing-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!brandId) {
    if (isAllBrands) {
      return (
        <Card>
          <CardContent className="py-8 space-y-3 max-w-sm">
            <p className="text-sm">All-Brands mode — kon brand er expenses dekhbe?</p>
            <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
              <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Select a brand first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Per-subtype monthly summary */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {CATEGORY_OPTIONS.filter((c) => c.value !== "other" && c.value !== "agency" && c.value !== "photoshoot").map((c) => (
          <Card key={c.value}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{c.label}</CardTitle></CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">
              ৳ {(monthSubtotals.get(c.value) ?? 0).toLocaleString()}
              <div className="text-[10px] text-muted-foreground font-normal">this month</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All categories</SelectItem>
              {CATEGORY_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All products" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All products</SelectItem>
              {(optsQ.data?.products ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCampaign} onValueChange={setFilterCampaign}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All campaigns" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All campaigns</SelectItem>
              {(optsQ.data?.campaigns ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-40" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-40" />
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vendor / note…" className="pl-8 w-56" />
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span><b className="text-foreground">{totals.count}</b> entries</span>
            <span><b className="text-foreground">৳ {totals.total.toLocaleString()}</b> total</span>
            <span><b className="text-foreground">{totals.posted}</b> posted</span>
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!rows.length}>
              <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Manual Marketing Expenses</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Influencer, content, photoshoot, agency etc. Auto-posts to Finance jodi account select koro.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Expense
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {expensesQ.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No expenses yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Finance</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.date ? format(new Date(r.date), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>{categoryBadge(r.category)}</TableCell>
                    <TableCell className="text-sm">{r.vendor || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {r.products?.name ? (
                        <Badge variant="outline" className="font-normal">{r.products.name}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.mkt_campaigns?.name ? (
                        <Badge variant="outline" className="font-normal">{r.mkt_campaigns.name}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{r.erp_accounts?.name || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {r.currency || "BDT"} {Number(r.amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {r.transaction_id ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 gap-1">
                          <ExternalLink className="h-3 w-3" /> Posted
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not posted</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this expense? Linked finance entry o delete hobe.")) {
                            delMut.mutate(r.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExpenseDialog
        open={open}
        onClose={() => setOpen(false)}
        brandId={brandId}
        options={optsQ.data ?? { products: [], campaigns: [], accounts: [] }}
        onCreate={async (payload) => {
          await createFn({ data: { brandId, ...payload } as any });
          toast.success("Expense added");
          qc.invalidateQueries({ queryKey: ["mkt", "expenses", brandId] });
          qc.invalidateQueries({ queryKey: ["erp_transactions"] });
          qc.invalidateQueries({ queryKey: ["erp_accounts"] });
          setOpen(false);
        }}
      />
    </div>
  );
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  brandId: string;
  options: { products: any[]; campaigns: any[]; accounts: any[] };
  onCreate: (p: any) => Promise<void>;
};

function ExpenseDialog({ open, onClose, options, onCreate }: DialogProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<typeof CATEGORY_OPTIONS[number]["value"]>("influencer");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState<string>(NONE);
  const [campaignId, setCampaignId] = useState<string>(NONE);
  const [accountId, setAccountId] = useState<string>(NONE);
  const [postToFinance, setPostToFinance] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setAmount(""); setCategory("influencer"); setVendor(""); setNote("");
    setProductId(NONE); setCampaignId(NONE); setAccountId(NONE);
    setPostToFinance(true);
  };

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Amount > 0 hote hobe"); return; }
    if (postToFinance && accountId === NONE) {
      toast.error("Finance e post korte account select koro, na hole switch off koro");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        date,
        amount: amt,
        category,
        vendor: vendor || null,
        note: note || null,
        productId: productId === NONE ? null : productId,
        campaignId: campaignId === NONE ? null : campaignId,
        accountId: accountId === NONE ? null : accountId,
        postToFinance,
      });
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Marketing Expense</DialogTitle>
          <DialogDescription>
            Influencer / content / agency etc. expense entry. Product ba campaign select korle eta oi product/campaign er cost hisebe count hobe.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (BDT)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor / Person</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Influencer name, agency…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Product (optional)</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {options.products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Campaign (optional)</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {options.campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional details…" />
          </div>

          <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Post to Finance</Label>
                <p className="text-xs text-muted-foreground">erp_transactions e auto expense entry hobe</p>
              </div>
              <Switch checked={postToFinance} onCheckedChange={setPostToFinance} />
            </div>
            {postToFinance && (
              <div className="space-y-1.5">
                <Label className="text-xs">Pay from Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Select —</SelectItem>
                    {options.accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}