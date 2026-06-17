import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { importEmployees } from "@/lib/erp/hr/hr.functions";

type Row = Record<string, any>;

export function EmployeeImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const importFn = useServerFn(importEmployees);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");

  const mut = useMutation({
    mutationFn: async () => importFn({ data: { rows: rows as any } }),
    onSuccess: (r) => {
      toast.success(`Imported ${r.inserted}. Failed: ${r.failed}`);
      if (r.errors.length) console.warn("Import errors:", r.errors);
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      qc.invalidateQueries({ queryKey: ["hr-kpis"] });
      setRows([]); setFileName(""); onClose();
    },
    onError: (e: any) => toast.error(e.message || "Import failed"),
  });

  const onFile = async (file: File) => {
    setFileName(file.name);
    const ext = file.name.toLowerCase().split(".").pop();
    if (["xlsx","xls","xlsm","ods"].includes(ext || "")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(sheet, { raw: false, defval: "" });
      setRows(normalize(json));
    } else {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { toast.error("Empty file"); return; }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const data: Row[] = lines.slice(1).map((l) => {
        const cells = l.split(",");
        const o: Row = {};
        headers.forEach((h, i) => { o[h] = (cells[i] ?? "").trim(); });
        return o;
      });
      setRows(normalize(data));
    }
  };

  function normalize(arr: Row[]): Row[] {
    return arr.map((r) => {
      const o: Row = {};
      for (const k in r) o[k.trim().toLowerCase().replace(/\s+/g, "_")] = r[k];
      return {
        full_name: o.full_name || o.name || "",
        email: o.email || "",
        phone: o.phone || o.mobile || "",
        employee_code: o.employee_code || o.code || "",
        department: o.department || "",
        designation: o.designation || o.title || "",
        joining_date: o.joining_date || o.join_date || "",
        gross_salary: o.gross_salary || o.salary || "",
        gender: o.gender || "",
        status: o.status || "",
        nid: o.nid || "",
        bank_account_no: o.bank_account_no || o.account_no || "",
      };
    }).filter((r) => r.full_name);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Employees</DialogTitle>
          <DialogDescription>
            Upload CSV or Excel. Columns: full_name, email, phone, employee_code, department, designation,
            joining_date, gross_salary, gender, status, nid, bank_account_no.
          </DialogDescription>
        </DialogHeader>

        <label className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-accent/30">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">{fileName || "Click to select CSV / XLSX"}</div>
          <div className="text-xs text-muted-foreground">.csv, .xlsx, .xls, .ods</div>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>

        {rows.length > 0 && (
          <div className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <span className="font-medium">{rows.length}</span> valid rows ready to import.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!rows.length || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Importing…" : `Import ${rows.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}