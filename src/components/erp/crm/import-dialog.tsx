import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { importCrmCustomers } from "@/lib/erp/crm/crm.functions";

type Row = { phone: string; name?: string; email?: string };

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function guessCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

export function CrmImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importCrmCustomers);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [phoneCol, setPhoneCol] = useState<number>(-1);
  const [nameCol, setNameCol] = useState<number>(-1);
  const [emailCol, setEmailCol] = useState<number>(-1);
  const [source, setSource] = useState("csv");

  const reset = () => {
    setFileName(""); setHeaders([]); setRows([]);
    setPhoneCol(-1); setNameCol(-1); setEmailCol(-1);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    setHeaders(headers); setRows(rows);
    setPhoneCol(guessCol(headers, ["phone", "mobile", "number", "phone_number", "mobile_number", "contact"]));
    setNameCol(guessCol(headers, ["name", "customer", "full_name", "customer_name"]));
    setEmailCol(guessCol(headers, ["email", "e-mail", "mail"]));
  };

  const validRows: Row[] = phoneCol >= 0
    ? rows.map((r) => ({
        phone: r[phoneCol] ?? "",
        name: nameCol >= 0 ? r[nameCol] : undefined,
        email: emailCol >= 0 ? r[emailCol] : undefined,
      })).filter((r) => r.phone.replace(/\D/g, "").length >= 6)
    : [];

  const mut = useMutation({
    mutationFn: () => importFn({ data: { rows: validRows, source: source.trim() || "csv" } }),
    onSuccess: (res) => {
      toast.success(`Imported ${res.inserted} customers · ${res.skipped} skipped`);
      qc.invalidateQueries({ queryKey: ["crm-list"] });
      qc.invalidateQueries({ queryKey: ["crm-tags"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed"),
  });

  const colSelect = (value: number, onChange: (v: number) => void) => (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="-1">— None —</SelectItem>
        {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `Column ${i + 1}`}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import customers</DialogTitle>
          <DialogDescription>
            CSV upload korun. Phone column required — auto-tagged with <span className="font-mono bg-muted px-1 rounded">imported</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!headers.length ? (
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-accent/30 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <div className="text-sm font-medium">Click to upload CSV</div>
              <div className="text-xs text-muted-foreground mt-1">First row should be headers (phone, name, email)</div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <>
              <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{fileName}</span>
                  <span className="text-muted-foreground">· {rows.length} rows</span>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Phone *</Label>
                  {colSelect(phoneCol, setPhoneCol)}
                </div>
                <div>
                  <Label className="text-xs">Name</Label>
                  {colSelect(nameCol, setNameCol)}
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  {colSelect(emailCol, setEmailCol)}
                </div>
              </div>

              <div>
                <Label className="text-xs">Source label (optional)</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="csv" className="h-9" />
              </div>

              <div className="rounded-md border overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 text-xs font-medium border-b">
                  Preview · {validRows.length} valid of {rows.length}
                </div>
                <div className="max-h-48 overflow-auto text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/20">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">Phone</th>
                        <th className="text-left px-3 py-1.5 font-medium">Name</th>
                        <th className="text-left px-3 py-1.5 font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 8).map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1 font-mono">{r.phone}</td>
                          <td className="px-3 py-1">{r.name || "—"}</td>
                          <td className="px-3 py-1 text-muted-foreground">{r.email || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button
            disabled={!validRows.length || phoneCol < 0 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Importing…" : `Import ${validRows.length} customers`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}