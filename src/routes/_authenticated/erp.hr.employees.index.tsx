import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, UserPlus, Upload, Download, Phone, Mail, Trash2, UserMinus, Building2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrand } from "@/contexts/brand-context";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { EmployeeImportDialog } from "@/components/erp/hr/employee-import-dialog";
import {
  listEmployees, listDepartments, listDesignations, deleteEmployee,
} from "@/lib/erp/hr/hr.functions";
import { bulkUpdateEmployees } from "@/lib/erp/hr/profile.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useHrAccess } from "@/lib/erp/hr/role-gate";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { StatusPill, type StatusTone } from "@/components/erp/hr/ui/status-pill";
import { HrAvatar } from "@/components/erp/hr/ui/avatar";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";

export const Route = createFileRoute("/_authenticated/erp/hr/employees/")({
  head: () => ({ meta: [{ title: "Employees — HR" }] }),
  component: EmployeesList,
});

const PAGE_SIZE = 50;

const STATUS_TONE: Record<string, StatusTone> = {
  active: "active",
  probation: "pending",
  on_leave: "leave",
  suspended: "late",
  terminated: "absent",
  resigned: "inactive",
  retired: "inactive",
};

function EmployeesList() {
  const { brandIds } = useBrand();
  const qc = useQueryClient();
  const access = useHrAccess();
  const listFn = useServerFn(listEmployees);
  const deptsFn = useServerFn(listDepartments);
  const desigsFn = useServerFn(listDesignations);
  const delFn = useServerFn(deleteEmployee);
  const bulkFn = useServerFn(bulkUpdateEmployees);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deptId, setDeptId] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [moveDeptOpen, setMoveDeptOpen] = useState(false);
  const [moveToDept, setMoveToDept] = useState<string>("");

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

  const deactivateMut = useMutation({
    mutationFn: () => bulkFn({ data: { ids: Array.from(selected), patch: { status: "terminated" } } }),
    onSuccess: () => {
      toast.success(`Deactivated ${selected.size}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveDeptMut = useMutation({
    mutationFn: () => bulkFn({ data: { ids: Array.from(selected), patch: { department_id: moveToDept || null } } }),
    onSuccess: () => {
      toast.success(`Moved ${selected.size}`);
      setSelected(new Set()); setMoveDeptOpen(false); setMoveToDept("");
      qc.invalidateQueries({ queryKey: ["hr-employees"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Employees"
          subtitle={`${total} total · directory & profiles`}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="rounded-lg">
                <Upload className="h-4 w-4 mr-2" /> Import
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} className="rounded-lg">
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
              <Link to="/erp/hr/employees/new">
                <Button size="sm" className="rounded-lg bg-gray-900 hover:bg-gray-800"><UserPlus className="h-4 w-4 mr-2" /> Add Employee</Button>
              </Link>
            </>
          }
        />

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input placeholder="Search name, code, email, phone, NID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9 h-9 border-gray-200 bg-gray-50/50 focus:bg-white rounded-lg" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-9 rounded-lg border-gray-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {["active","probation","on_leave","suspended","terminated","resigned","retired"].map((s) => (
                <SelectItem key={s} value={s}>{s.replace("_"," ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deptId} onValueChange={(v) => { setDeptId(v); setPage(1); }}>
            <SelectTrigger className="w-[180px] h-9 rounded-lg border-gray-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {(depts as any[]).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-9 rounded-lg border-gray-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {["full_time","part_time","contract","intern","consultant"].map((t) => (
                <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected.size > 0 && (
          <div className="sticky top-[120px] z-20 bg-gray-900 text-white rounded-xl shadow-lg shadow-gray-900/20 p-3 flex items-center justify-between animate-in slide-in-from-top-2 duration-150">
            <div className="text-sm font-medium">{selected.size} selected</div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={exportCsv} className="text-white hover:bg-white/10">
                <Download className="h-4 w-4 mr-1.5" /> Export
              </Button>
              {access.canManageEmployees && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setMoveDeptOpen(true)} className="text-white hover:bg-white/10">
                    <Building2 className="h-4 w-4 mr-1.5" /> Change dept
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Deactivate ${selected.size} employees?`)) deactivateMut.mutate(); }} className="text-white hover:bg-white/10">
                    <UserMinus className="h-4 w-4 mr-1.5" /> Deactivate
                  </Button>
                </>
              )}
              {access.canDelete && (
                <Button variant="destructive" size="sm" onClick={() => {
                  if (confirm(`Delete ${selected.size} employees? This cannot be undone.`)) delMut.mutate();
                }} disabled={delMut.isPending}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-100 hover:bg-transparent">
                  <TableHead className="w-[40px] bg-gray-50/50"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Employee</TableHead>
                  <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Designation</TableHead>
                  <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Department</TableHead>
                  <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Status</TableHead>
                  <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Joining</TableHead>
                  <TableHead className="bg-gray-50/50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold text-right">Salary</TableHead>
                  <TableHead className="bg-gray-50/50"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-gray-400">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="p-0">
                    <EmptyState icon={Users} title="No employees yet" description="Add your first employee or import from CSV." action={
                      <Link to="/erp/hr/employees/new"><Button size="sm" className="rounded-lg bg-gray-900 hover:bg-gray-800"><UserPlus className="h-4 w-4 mr-2" />Add Employee</Button></Link>
                    } />
                  </TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id} className="group border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => {
                      const n = new Set(selected);
                      if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
                      setSelected(n);
                    }} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <HrAvatar name={r.full_name} src={(r as any).photo_url} size={40} />
                        <div className="min-w-0">
                          <Link to="/erp/hr/employees/$id" params={{ id: r.id }} className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
                            {r.full_name}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                            <span className="font-mono">{r.employee_code}</span>
                            {r.tags.includes("imported") && <Badge variant="outline" className="text-[10px] h-4 px-1 rounded">imported</Badge>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">{desigMap.get(r.designation_id ?? "") ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-700">{deptMap.get(r.department_id ?? "") ?? "—"}</TableCell>
                    <TableCell><StatusPill tone={STATUS_TONE[r.status] ?? "neutral"} dot>{r.status.replace("_"," ")}</StatusPill></TableCell>
                    <TableCell className="text-sm text-gray-600 whitespace-nowrap tabular-nums">{r.joining_date}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium text-gray-900">{r.gross_salary ? `৳${Number(r.gross_salary).toLocaleString("en-BD")}` : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {r.phone && <a href={`tel:${r.phone}`} title="Call" className="text-gray-400 hover:text-indigo-600"><Phone className="h-3.5 w-3.5" /></a>}
                        {r.email && <a href={`mailto:${r.email}`} title="Email" className="text-gray-400 hover:text-indigo-600"><Mail className="h-3.5 w-3.5" /></a>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-500">Page {page} of {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg">Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg">Next</Button>
            </div>
          </div>
        )}

        <EmployeeImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

        <Dialog open={moveDeptOpen} onOpenChange={setMoveDeptOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Change Department</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Move {selected.size} employees to:</div>
              <Select value={moveToDept} onValueChange={setMoveToDept}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No department</SelectItem>
                  {(depts as any[]).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveDeptOpen(false)}>Cancel</Button>
              <Button onClick={() => moveDeptMut.mutate()} disabled={moveDeptMut.isPending}>Move</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}