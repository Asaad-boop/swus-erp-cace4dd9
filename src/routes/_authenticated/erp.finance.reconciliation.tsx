import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Link2, Link2Off, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { fmtBdt } from "@/lib/erp/finance";

export const Route = createFileRoute("/_authenticated/erp/finance/reconciliation")({
  head: () => ({ meta: [{ title: "Reconciliation — Finance ERP" }] }),
  component: ReconPage,
});

type COA = { id: string; code: string; name: string; account_type: string };
type Import = { id: string; account_id: string; source: string; period_start: string | null; period_end: string | null; imported_at: string; total_lines: number; matched_lines: number };
type Line = { id: string; txn_date: string; description: string | null; reference_no: string | null; debit: number; credit: number; matched_line_id: string | null; account_id: string };
type JLine = { id: string; debit: number; credit: number; description: string | null; entry_date: string; entry_no: string };

function parseCsv(text: string) {
  // Expected columns (case-insensitive): date, description, reference, debit, credit  OR  date, description, amount (negative=credit)
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const idx = (k: string) => headers.indexOf(k);
  const dateI = idx("date") >= 0 ? idx("date") : idx("txn_date");
  const descI = idx("description") >= 0 ? idx("description") : idx("narration");
  const refI = idx("reference") >= 0 ? idx("reference") : idx("ref");
  const debI = idx("debit");
  const credI = idx("credit");
  const amtI = idx("amount");
  const out: Array<{ txn_date: string; description: string; reference_no: string; debit: number; credit: number }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!cells[dateI]) continue;
    let debit = 0, credit = 0;
    if (debI >= 0 || credI >= 0) {
      debit = Number(cells[debI] || 0) || 0;
      credit = Number(cells[credI] || 0) || 0;
    } else if (amtI >= 0) {
      const a = Number(cells[amtI]) || 0;
      if (a >= 0) debit = a; else credit = -a;
    }
    out.push({
      txn_date: cells[dateI], description: cells[descI] || "",
      reference_no: cells[refI] || "", debit, credit,
    });
  }
  return out;
}

function ReconPage() {
  const { brandId, effectiveBrand, gate } = useBrandPicker();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);

  const coaQ = useQuery({
    queryKey: ["coa_recon", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_chart_accounts")
        .select("id, code, name, account_type").eq("brand_id", brandId!)
        .eq("is_archived", false).eq("account_type", "asset").order("code");
      if (error) throw error;
      return (data ?? []) as COA[];
    },
  });

  const importsQ = useQuery({
    queryKey: ["statement_imports", brandId, accountId],
    enabled: !!brandId,
    queryFn: async () => {
      let qb = supabase.from("erp_statement_imports" as never)
        .select("id, account_id, source, period_start, period_end, imported_at, total_lines, matched_lines")
        .eq("brand_id", brandId!).order("imported_at", { ascending: false }).limit(50);
      if (accountId) qb = qb.eq("account_id", accountId);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as unknown as Import[];
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bank / MFS Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Import statement CSV, match against journal lines.</p>
        </div>
        <Button onClick={() => setImportOpen(true)} disabled={!coaQ.data?.length}>
          <Upload className="h-4 w-4 mr-1" />Import Statement
        </Button>
      </header>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="min-w-[240px]">
          <Label className="text-xs">Filter by account</Label>
          <Select value={accountId || "all"} onValueChange={(v) => setAccountId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(coaQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Imported</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Matched</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {importsQ.isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!importsQ.isLoading && (importsQ.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No imports yet.</TableCell></TableRow>
            )}
            {(importsQ.data ?? []).map((imp) => {
              const acct = (coaQ.data ?? []).find((a) => a.id === imp.account_id);
              const pct = imp.total_lines ? Math.round((imp.matched_lines / imp.total_lines) * 100) : 0;
              return (
                <TableRow key={imp.id}>
                  <TableCell className="text-xs">{new Date(imp.imported_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{acct ? `${acct.code} · ${acct.name}` : "—"}</TableCell>
                  <TableCell className="text-sm">{imp.source}</TableCell>
                  <TableCell className="text-xs">{imp.period_start ?? "—"} → {imp.period_end ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{imp.total_lines}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={pct === 100 ? "default" : pct > 0 ? "secondary" : "outline"} className="text-xs">{imp.matched_lines}/{imp.total_lines} · {pct}%</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setSelectedImport(imp.id)}>
                      <FileText className="h-3.5 w-3.5 mr-1" />Open
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {importOpen && <ImportDialog brandId={brandId} accounts={coaQ.data ?? []} onClose={() => setImportOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["statement_imports"] })} />}
      {selectedImport && <MatchPanel importId={selectedImport} brandId={brandId} onClose={() => setSelectedImport(null)} />}
    </div>
  );
}

function ImportDialog({ brandId, accounts, onClose, onSaved }: { brandId: string; accounts: COA[]; onClose: () => void; onSaved: () => void; }) {
  const [accountId, setAccountId] = useState("");
  const [source, setSource] = useState("bKash");
  const [csv, setCsv] = useState("");
  const parsed = useMemo(() => csv ? parseCsv(csv) : [], [csv]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("Pick an account");
      if (!parsed.length) throw new Error("CSV has no rows");
      const periodStart = parsed.reduce((a, b) => a < b.txn_date ? a : b.txn_date, parsed[0].txn_date);
      const periodEnd = parsed.reduce((a, b) => a > b.txn_date ? a : b.txn_date, parsed[0].txn_date);
      const { data: imp, error: e1 } = await supabase.from("erp_statement_imports" as never).insert({
        brand_id: brandId, account_id: accountId, source,
        period_start: periodStart, period_end: periodEnd, total_lines: parsed.length,
      } as never).select("id").single();
      if (e1) throw e1;
      const impId = (imp as { id: string }).id;
      const rows = parsed.map((p) => ({ ...p, brand_id: brandId, account_id: accountId, import_id: impId }));
      const { error: e2 } = await supabase.from("erp_statement_lines" as never).insert(rows as never);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success(`Imported ${parsed.length} lines`); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Import Statement CSV</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Source</Label><Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="bKash / Nagad / Bank" /></div>
          </div>
          <div>
            <Label className="text-xs">CSV (headers: date, description, reference, debit, credit — or date, description, amount)</Label>
            <Textarea rows={10} className="font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)}
              placeholder="date,description,reference,debit,credit&#10;2026-06-01,Payment from customer,TXN123,5000,0" />
          </div>
          {parsed.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Parsed <span className="font-semibold text-foreground">{parsed.length}</span> rows · Total debit {fmtBdt(parsed.reduce((s, p) => s + p.debit, 0))} · Total credit {fmtBdt(parsed.reduce((s, p) => s + p.credit, 0))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !parsed.length}>{mut.isPending ? "Importing…" : `Import ${parsed.length}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatchPanel({ importId, brandId, onClose }: { importId: string; brandId: string; onClose: () => void; }) {
  const qc = useQueryClient();
  const linesQ = useQuery({
    queryKey: ["statement_lines", importId],
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_statement_lines" as never)
        .select("id, txn_date, description, reference_no, debit, credit, matched_line_id, account_id")
        .eq("import_id", importId).order("txn_date");
      if (error) throw error;
      return (data ?? []) as unknown as Line[];
    },
  });

  const [target, setTarget] = useState<Line | null>(null);

  const unmatchMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("unmatch_statement_line", { _line_id: id } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["statement_lines"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>Statement Lines</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(linesQ.data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{l.txn_date}</TableCell>
                  <TableCell className="text-sm">{l.description}</TableCell>
                  <TableCell className="text-xs font-mono">{l.reference_no}</TableCell>
                  <TableCell className="text-right font-mono">{l.debit ? fmtBdt(l.debit) : ""}</TableCell>
                  <TableCell className="text-right font-mono">{l.credit ? fmtBdt(l.credit) : ""}</TableCell>
                  <TableCell>
                    <Badge variant={l.matched_line_id ? "default" : "outline"} className="text-xs">{l.matched_line_id ? "Matched" : "Unmatched"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {l.matched_line_id ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => unmatchMut.mutate(l.id)}>
                        <Link2Off className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setTarget(l)}>
                        <Link2 className="h-3.5 w-3.5 mr-1" />Match
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
      {target && <MatchPickerDialog brandId={brandId} line={target} onClose={() => setTarget(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["statement_lines"] })} />}
    </Dialog>
  );
}

function MatchPickerDialog({ brandId, line, onClose, onSaved }: { brandId: string; line: Line; onClose: () => void; onSaved: () => void; }) {
  const amount = line.debit || line.credit;
  const jlinesQ = useQuery({
    queryKey: ["match_candidates", brandId, line.id],
    queryFn: async () => {
      // candidates: same account, unmatched, amount within ±0.01, date within ±7d
      const start = new Date(line.txn_date); start.setDate(start.getDate() - 7);
      const end = new Date(line.txn_date); end.setDate(end.getDate() + 7);
      const dStart = start.toISOString().slice(0, 10);
      const dEnd = end.toISOString().slice(0, 10);
      const { data, error } = await supabase.from("erp_journal_lines")
        .select("id, debit, credit, description, erp_journal_entries!inner(entry_date, entry_no, status, brand_id)")
        .eq("account_id", line.account_id)
        .eq("brand_id", brandId)
        .gte("erp_journal_entries.entry_date", dStart)
        .lte("erp_journal_entries.entry_date", dEnd)
        .eq("erp_journal_entries.status", "posted")
        .limit(200);
      if (error) throw error;
      type Row = { id: string; debit: number; credit: number; description: string | null; erp_journal_entries: { entry_date: string; entry_no: string } };
      return ((data ?? []) as unknown as Row[])
        .filter((j) => {
          // bank statement debit = money in, should match journal line debit on this account; same for credit
          if (line.debit > 0) return Math.abs(Number(j.debit) - line.debit) < 0.01;
          return Math.abs(Number(j.credit) - line.credit) < 0.01;
        })
        .map((j) => ({
          id: j.id, debit: Number(j.debit), credit: Number(j.credit),
          description: j.description, entry_date: j.erp_journal_entries.entry_date, entry_no: j.erp_journal_entries.entry_no,
        }) as JLine);
    },
  });

  const mut = useMutation({
    mutationFn: async (jid: string) => {
      const { error } = await supabase.rpc("match_statement_line", { _line_id: line.id, _journal_line_id: jid } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Matched"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Match — {fmtBdt(amount)} on {line.txn_date}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{line.description}</div>
          {jlinesQ.isLoading && <div className="py-6 text-center text-muted-foreground">Searching…</div>}
          {!jlinesQ.isLoading && (jlinesQ.data ?? []).length === 0 && (
            <div className="py-6 text-center text-muted-foreground text-sm">No matching journal lines (same account, ±7d, ±0.01).</div>
          )}
          {(jlinesQ.data ?? []).map((j) => (
            <div key={j.id} className="flex justify-between items-center rounded-md border p-3 hover:bg-muted/40">
              <div>
                <div className="font-mono text-xs">{j.entry_no} · {j.entry_date}</div>
                <div className="text-sm">{j.description}</div>
              </div>
              <Button size="sm" onClick={() => mut.mutate(j.id)} disabled={mut.isPending}>
                <Link2 className="h-3.5 w-3.5 mr-1" />Match
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}