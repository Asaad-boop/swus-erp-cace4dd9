import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { fmtBdt } from "@/lib/erp/finance";

export const Route = createFileRoute("/_authenticated/erp/finance/taxes")({
  head: () => ({ meta: [{ title: "Taxes — Finance ERP" }] }),
  component: TaxesPage,
});

type Rate = { id: string; code: string; name: string; rate: number; kind: string; is_active: boolean; output_account_id: string | null; input_account_id: string | null };
type Entry = { id: string; tax_rate_id: string; direction: string; taxable_amount: number; tax_amount: number; entry_date: string; note: string | null };
type COA = { id: string; code: string; name: string; account_type: string };

function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

function TaxesPage() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const ratesQ = useQuery({
    queryKey: ["tax_rates", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_tax_rates" as never)
        .select("*").eq("brand_id", brandId!).order("code");
      if (error) throw error;
      return (data ?? []) as unknown as Rate[];
    },
  });

  const coaQ = useQuery({
    queryKey: ["coa_tax", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts")
        .select("id, code, name, account_type").eq("brand_id", brandId!).eq("is_archived", false).order("code");
      if (error) throw error;
      return (data ?? []) as COA[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["tax_entries", brandId, from, to],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_tax_entries" as never)
        .select("*").eq("brand_id", brandId!).gte("entry_date", from).lte("entry_date", to).order("entry_date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const summaryQ = useQuery({
    queryKey: ["vat_summary", brandId, from, to],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vat_summary" as never, { p_brand: brandId!, p_from: from, p_to: to } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ tax_code: string; tax_name: string; rate: number; output_taxable: number; output_tax: number; input_taxable: number; input_tax: number; net_payable: number }>;
    },
  });

  const totals = useMemo(() => {
    const s = summaryQ.data ?? [];
    return {
      output: s.reduce((a, r) => a + Number(r.output_tax), 0),
      input: s.reduce((a, r) => a + Number(r.input_tax), 0),
      net: s.reduce((a, r) => a + Number(r.net_payable), 0),
    };
  }, [summaryQ.data]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {picker && <div className="flex justify-end -mb-1">{picker}</div>}
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taxes (VAT / TDS)</h1>
          <p className="text-sm text-muted-foreground">Manage tax rates, record output/input tax, view VAT summary.</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPI label="Output VAT (collected)" value={totals.output} tone="emerald" />
        <KPI label="Input VAT (paid)" value={totals.input} tone="amber" />
        <KPI label="Net Payable" value={totals.net} tone={totals.net >= 0 ? "red" : "emerald"} />
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">VAT Summary</TabsTrigger>
          <TabsTrigger value="rates">Tax Rates</TabsTrigger>
          <TabsTrigger value="entries">Tax Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Rate %</TableHead>
                <TableHead className="text-right">Output Taxable</TableHead><TableHead className="text-right">Output Tax</TableHead>
                <TableHead className="text-right">Input Taxable</TableHead><TableHead className="text-right">Input Tax</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(summaryQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No tax rates configured.</TableCell></TableRow>}
                {(summaryQ.data ?? []).map((r) => (
                  <TableRow key={r.tax_code}>
                    <TableCell className="font-mono text-xs">{r.tax_code}</TableCell>
                    <TableCell>{r.tax_name}</TableCell>
                    <TableCell className="text-right font-mono">{Number(r.rate).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtBdt(Number(r.output_taxable))}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{fmtBdt(Number(r.output_tax))}</TableCell>
                    <TableCell className="text-right font-mono">{fmtBdt(Number(r.input_taxable))}</TableCell>
                    <TableCell className="text-right font-mono text-amber-600">{fmtBdt(Number(r.input_tax))}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${Number(r.net_payable) >= 0 ? "text-red-600" : "text-emerald-600"}`}>{fmtBdt(Number(r.net_payable))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="rates" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <RateDialog brandId={brandId} coa={coaQ.data ?? []} onDone={() => qc.invalidateQueries({ queryKey: ["tax_rates"] })} />
          </div>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Kind</TableHead>
                <TableHead className="text-right">Rate %</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(ratesQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No tax rates yet.</TableCell></TableRow>}
                {(ratesQ.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell><span className="text-xs uppercase">{r.kind}</span></TableCell>
                    <TableCell className="text-right font-mono">{Number(r.rate).toFixed(2)}</TableCell>
                    <TableCell>{r.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm("Delete this tax rate?")) return;
                        const { error } = await supabase.from("erp_tax_rates" as never).delete().eq("id", r.id);
                        if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["tax_rates"] });
                      }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="entries" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <EntryDialog brandId={brandId} rates={ratesQ.data ?? []} onDone={() => { qc.invalidateQueries({ queryKey: ["tax_entries"] }); qc.invalidateQueries({ queryKey: ["vat_summary"] }); }} />
          </div>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Rate</TableHead><TableHead>Direction</TableHead>
                <TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Tax</TableHead><TableHead>Note</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(entriesQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No entries in this period.</TableCell></TableRow>}
                {(entriesQ.data ?? []).map((e) => {
                  const rate = (ratesQ.data ?? []).find((r) => r.id === e.tax_rate_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.entry_date}</TableCell>
                      <TableCell className="text-xs">{rate ? `${rate.code} (${Number(rate.rate).toFixed(2)}%)` : "—"}</TableCell>
                      <TableCell><span className={`text-xs uppercase ${e.direction === "output" ? "text-emerald-600" : "text-amber-600"}`}>{e.direction}</span></TableCell>
                      <TableCell className="text-right font-mono">{fmtBdt(Number(e.taxable_amount))}</TableCell>
                      <TableCell className="text-right font-mono">{fmtBdt(Number(e.tax_amount))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.note}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-red-600";
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-1 ${color}`}>{fmtBdt(value)}</div>
    </div>
  );
}

function RateDialog({ brandId, coa, onDone }: { brandId: string; coa: COA[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", rate: "15", kind: "vat", output_account_id: "", input_account_id: "" });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("erp_tax_rates" as never).insert({
        brand_id: brandId, code: form.code, name: form.name, rate: Number(form.rate), kind: form.kind,
        output_account_id: form.output_account_id || null, input_account_id: form.input_account_id || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tax rate saved"); setOpen(false); onDone(); setForm({ code: "", name: "", rate: "15", kind: "vat", output_account_id: "", input_account_id: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Tax Rate</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Tax Rate</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VAT15" /></div>
            <div><Label>Rate %</Label><Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
          </div>
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Standard VAT 15%" /></div>
          <div><Label>Kind</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vat">VAT</SelectItem>
                <SelectItem value="tds">TDS (Tax Deducted)</SelectItem>
                <SelectItem value="vds">VDS (VAT Deducted)</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Output Account (Liability)</Label>
              <Select value={form.output_account_id} onValueChange={(v) => setForm({ ...form, output_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{coa.filter((a) => a.account_type === "liability").map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Input Account (Asset)</Label>
              <Select value={form.input_account_id} onValueChange={(v) => setForm({ ...form, input_account_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{coa.filter((a) => a.account_type === "asset").map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={!form.code || !form.name || save.isPending} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog({ brandId, rates, onDone }: { brandId: string; rates: Rate[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tax_rate_id: "", direction: "output", taxable_amount: "", entry_date: today(), note: "" });
  const rate = rates.find((r) => r.id === form.tax_rate_id);
  const taxAmount = rate ? (Number(form.taxable_amount) || 0) * Number(rate.rate) / 100 : 0;
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("erp_tax_entries" as never).insert({
        brand_id: brandId, tax_rate_id: form.tax_rate_id, direction: form.direction,
        taxable_amount: Number(form.taxable_amount), tax_amount: taxAmount,
        entry_date: form.entry_date, note: form.note || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tax entry recorded"); setOpen(false); onDone(); setForm({ tax_rate_id: "", direction: "output", taxable_amount: "", entry_date: today(), note: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={rates.length === 0}><Plus className="h-4 w-4 mr-1" />Record Entry</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Tax Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Tax Rate</Label>
            <Select value={form.tax_rate_id} onValueChange={(v) => setForm({ ...form, tax_rate_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select rate" /></SelectTrigger>
              <SelectContent>{rates.map((r) => <SelectItem key={r.id} value={r.id}>{r.code} · {r.name} ({Number(r.rate).toFixed(2)}%)</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="output">Output (collected)</SelectItem>
                  <SelectItem value="input">Input (paid)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
          </div>
          <div><Label>Taxable Amount</Label><Input type="number" step="0.01" value={form.taxable_amount} onChange={(e) => setForm({ ...form, taxable_amount: e.target.value })} /></div>
          <div className="text-sm bg-muted/40 rounded p-2">Tax amount: <span className="font-mono font-semibold">{fmtBdt(taxAmount)}</span></div>
          <div><Label>Note</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <Button onClick={() => save.mutate()} disabled={!form.tax_rate_id || !form.taxable_amount || save.isPending} className="w-full">Save Entry</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}