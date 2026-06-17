import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, UserPlus, Upload, Download, Phone, Mail, Trash2, Filter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrand } from "@/contexts/brand-context";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { EmployeeImportDialog } from "@/components/erp/hr/employee-import-dialog";
import {
  listEmployees, listDepartments, listDesignations, deleteEmployee,
} from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/employees/")({
  head: () => ({ meta: [{ title: "Employees — HR" }] }),
  component: EmployeesList,
});

const PAGE_SIZE = 50;

const STATUS_TONES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  probation: "bg-amber-100 text-amber-800",
  on_leave: "bg-blue-100 text-blue-800",
  suspended: "bg-orange-100 text-orange-800",
  terminated: "bg-red-100 text-red-800",
  resigned: "bg-slate-100 text-slate-800",
  retired: "bg-slate-100 text-slate-800",
};

function EmployeesList() {
  const { brandIds } = useBrand();
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployees);
  const deptsFn = useServerFn(listDepartments);
  const desigsFn = useServerFn(listDesignations);
  const delFn = useServerFn(deleteEmployee);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deptId, setDeptId] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const { data: depts = [] } = useQuery({ queryKey: ["hr-depts"], queryFn: () => deptsFn() });
  const { data: desigs = [] } = useQuery({ queryKey: ["hr-desigs"], queryFn: () => desigsFn() });

  const { data, isLoading } = useQuery({
    queryKey: ["hr-employees", { search, status, deptId, type, page, brandIds }],
    queryFn: () => listFn({ data: { search, status, departmentId: deptId, employmentType: type, brandIds, page, pageSize: PAGE_SIZE } }),
  });

  const deptMap = useMemo(() => new Map((depts as any[]).map((d) => [d.id, d.name])), [depts]);
  const desigMap = useMemo(() => new Map((desigs as any[]).map((d) => [d.id, d.title])), [desigs]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const exportCsv = () => {
    const headers = ["employee_code","full_name","email","phone","status","department","designation","joining_date","gross_salary"];
    const lines = [headers.join(",")];
    rows.forEach((r) => {
      lines.push([
        r.employee_code, csv(r.full_name), csv(r.email), csv(r.phone), r.status,
        csv(deptMap.get(r.department_id ?? "") ?? ""), csv(desigMap.get(r.designation_id ?? "") ?? ""),
        r.joining_date, r.gross_salary ?? "",
      ].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `employees_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const csv = (s: any) => `"${String(s ?? "").replace(/"/g,'""')}"`;

  const delMut = useMutation({
    mutationFn: async () => {
      for (const id of selected) await delFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success(`Deleted ${selected.size} employees`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
      qc.invalidateQueries({ queryKey: ["hr-kpis"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
            <p className="text-sm text-muted-foreground">{total} total</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
            <Link to="/erp/hr/employees/new">
              <Button size="sm"><UserPlus className="h-4 w-4 mr-2" /> Add Employee</Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, code, email, phone, NID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {["active","probation","on_leave","suspended","terminated","resigned","retired"].map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={deptId} onValueChange={(v) => { setDeptId(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {(depts as any[]).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {["full_time","part_time","contract","intern","consultant"].map((t) => (
                  <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selected.size > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="text-sm font-medium">{selected.size} selected</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="h-4 w-4 mr-1.5" /> Export selected
                </Button>
                <Button variant="destructive" size="sm" onClick={() => {
                  if (confirm(`Delete ${selected.size} employees? This cannot be undone.`)) delMut.mutate();
                }} disabled={delMut.isPending}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-[40px]"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joining</TableHead>
                    <TableHead className="text-right">Salary</TableHead>
                    <TableHead>Contact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No employees yet.</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id} className="group">
                      <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => {
                        const n = new Set(selected);
                        if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
                        setSelected(n);
                      }} /></TableCell>
                      <TableCell className="font-mono text-xs">{r.employee_code}</TableCell>
                      <TableCell>
                        <Link to="/erp/hr/employees/$id" params={{ id: r.id }} className="font-medium hover:underline">
                          {r.full_name}
                        </Link>
                        {r.tags.includes("imported") && <Badge variant="outline" className="ml-2 text-[10px]">imported</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{desigMap.get(r.designation_id ?? "") ?? "—"}</TableCell>
                      <TableCell className="text-sm">{deptMap.get(r.department_id ?? "") ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_TONES[r.status] || ""}>{r.status.replace("_"," ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{r.joining_date}</TableCell>
                      <TableCell className="text-right text-sm">{r.gross_salary ? `৳${Number(r.gross_salary).toLocaleString("en-BD")}` : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                          {r.phone && <a href={`tel:${r.phone}`} title="Call"><Phone className="h-3.5 w-3.5" /></a>}
                          {r.email && <a href={`mailto:${r.email}`} title="Email"><Mail className="h-3.5 w-3.5" /></a>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Page {page} of {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}

        <EmployeeImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      </div>
    </div>
  );
}