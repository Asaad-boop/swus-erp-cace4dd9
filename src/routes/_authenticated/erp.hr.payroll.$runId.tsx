import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Lock, Download, Printer, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import {
  getPayrollRun, updatePayslip, finalizePayrollRun, markPayslipPaid, getPayslip,
} from "@/lib/erp/hr/payroll.functions";
import { exportToXlsx } from "@/lib/erp/hr/excel";
import { printPayslip } from "@/components/erp/hr/payroll/payslip-print";
import { useHrAccess } from "@/lib/erp/hr/role-gate";

export const Route = createFileRoute("/_authenticated/erp/hr/payroll/$runId")({
  head: () => ({ meta: [{ title: "Payroll Run — HR" }] }),
  component: PayrollRunPage,
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function PayrollRunPage() {
  const { runId } = Route.useParams();
  const qc = useQueryClient();
  const access = useHrAccess();
  const getFn = useServerFn(getPayrollRun);
  const updFn = useServerFn(updatePayslip);
  const finalFn = useServerFn(finalizePayrollRun);
  const payFn = useServerFn(markPayslipPaid);
  const slipFn = useServerFn(getPayslip);

  const { data, isLoading } = useQuery({ queryKey: ["payroll-run", runId], queryFn: () => getFn({ data: { id: runId } }) });

  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");

  const updMut = useMutation({
    mutationFn: (v: any) => updFn({ data: v }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["payroll-run", runId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const finMut = useMutation({
    mutationFn: () => finalFn({ data: { id: runId } }),
    onSuccess: () => { toast.success("Finalized"); qc.invalidateQueries({ queryKey: ["payroll-run", runId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const payMut = useMutation({
    mutationFn: (id: string) => payFn({ data: { id, payment_status: "paid", payment_method: method, payment_ref: ref || null } }),
    onSuccess: () => { toast.success("Marked paid"); setPayOpen(null); setRef(""); qc.invalidateQueries({ queryKey: ["payroll-run", runId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!access.isLoading && !access.canManagePayroll) {
    return <div><HrSubnav /><div className="p-6 text-sm text-muted-foreground"><Lock className="h-5 w-5 inline mr-2" />Restricted.</div></div>;
  }
  if (isLoading || !data) return <div><HrSubnav /><div className="p-6 text-muted-foreground">Loading…</div></div>;
  const { run, payslips, departments, designations } = data;
  const isFinalized = run.status === "finalized";

  const dmap = new Map((departments as any[]).map((d) => [d.id, d.name]));
  const dsmap = new Map((designations as any[]).map((d) => [d.id, d.title]));

  const paidCount = (payslips as any[]).filter((p) => p.payment_status === "paid").length;

  const exportBankSheet = () => {
    const rows = (payslips as any[])
      .filter((p) => Number(p.net_pay) > 0)
      .map((p) => ({
        employee_code: p.hr_employees?.employee_code ?? p.snapshot?.employee_code ?? "",
        name: p.hr_employees?.full_name ?? p.snapshot?.full_name ?? "",
        bank: p.hr_employees?.bank_name ?? p.snapshot?.bank_name ?? "",
        account_no: p.hr_employees?.bank_account_no ?? p.snapshot?.bank_account_no ?? "",
        amount: Number(p.net_pay),
      }));
    exportToXlsx(rows, "BankSheet", `bank-sheet-${run.year}-${String(run.month).padStart(2,"0")}`);
  };

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <Link to="/erp/hr/payroll" className="text-sm text-muted-foreground inline-flex items-center gap-1.5 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <Card>
          <CardContent className="p-5 flex justify-between items-center flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold">{MONTHS[run.month - 1]} {run.year}</h1>
              <div className="text-sm text-muted-foreground">
                {run.total_employees} employees · Gross ৳{Number(run.total_gross).toLocaleString("en-BD")} · Net ৳{Number(run.total_net).toLocaleString("en-BD")} · Paid {paidCount}/{(payslips as any[]).length}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportBankSheet}><Download className="h-4 w-4 mr-1.5" /> Bank Sheet</Button>
              {!isFinalized && access.isAdmin && (
                <Button size="sm" onClick={() => { if (confirm("Finalize this run? You cannot edit after finalizing.")) finMut.mutate(); }}>
                  <Lock className="h-4 w-4 mr-1.5" /> Finalize
                </Button>
              )}
              {isFinalized && <Badge className="bg-emerald-100 text-emerald-800"><Lock className="h-3 w-3 mr-1" />Finalized</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Allowances</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payslips as any[]).map((p) => (
                  <PayslipRow
                    key={p.id}
                    payslip={p}
                    isFinalized={isFinalized}
                    deptName={dmap.get(p.hr_employees?.department_id ?? p.snapshot?.department_id ?? "") ?? ""}
                    desigName={dsmap.get(p.hr_employees?.designation_id ?? p.snapshot?.designation_id ?? "") ?? ""}
                    onSave={(patch: any) => updMut.mutate({ id: p.id, ...patch })}
                    onPrint={async () => {
                      const slip = await slipFn({ data: { id: p.id } });
                      printPayslip({
                        companyName: "Company",
                        payslip: slip.payslip,
                        departments: slip.departments as any,
                        designations: slip.designations as any,
                      });
                    }}
                    onMarkPaid={() => setPayOpen(p.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark as Paid</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="rocket">Rocket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference / Note</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button onClick={() => payOpen && payMut.mutate(payOpen)} disabled={payMut.isPending}>{payMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayslipRow({ payslip: p, isFinalized, deptName, desigName, onSave, onPrint, onMarkPaid }: any) {
  const [basic, setBasic] = useState(Number(p.basic));
  const [allow, setAllow] = useState<Record<string, number>>(p.allowances ?? {});
  const [ded, setDed] = useState<Record<string, number>>(p.deductions ?? {});
  const [dirty, setDirty] = useState(false);

  const allowSum = useMemo(() => Object.values(allow).reduce((a, b) => a + Number(b || 0), 0), [allow]);
  const dedSum = useMemo(() => Object.values(ded).reduce((a, b) => a + Number(b || 0), 0), [ded]);
  const gross = basic + allowSum;
  const net = gross - dedSum;

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium text-sm">{p.hr_employees?.full_name ?? p.snapshot?.full_name ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{p.hr_employees?.employee_code ?? p.snapshot?.employee_code ?? ""} · {desigName} · {deptName}</div>
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" value={basic} disabled={isFinalized} className="w-24 text-right h-7"
          onChange={(e) => { setBasic(Number(e.target.value) || 0); setDirty(true); }} />
      </TableCell>
      <TableCell className="text-right text-xs">
        <div>৳{allowSum.toLocaleString("en-BD")}</div>
        <details>
          <summary className="cursor-pointer text-primary text-[10px]">edit</summary>
          {Object.keys(allow).length === 0 && ["house","transport","medical","other"].map((k) => allow[k] = allow[k] ?? 0)}
          {Object.entries(allow).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 mt-1">
              <span className="w-16 capitalize text-[10px]">{k}</span>
              <Input type="number" value={v} disabled={isFinalized} className="w-20 h-6 text-right"
                onChange={(e) => { setAllow({ ...allow, [k]: Number(e.target.value) || 0 }); setDirty(true); }} />
            </div>
          ))}
        </details>
      </TableCell>
      <TableCell className="text-right text-xs">
        <div>৳{dedSum.toLocaleString("en-BD")}</div>
        <details>
          <summary className="cursor-pointer text-primary text-[10px]">edit</summary>
          {Object.keys(ded).length === 0 && ["pf","tax","loan","other"].map((k) => ded[k] = ded[k] ?? 0)}
          {Object.entries(ded).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 mt-1">
              <span className="w-16 capitalize text-[10px]">{k}</span>
              <Input type="number" value={v} disabled={isFinalized} className="w-20 h-6 text-right"
                onChange={(e) => { setDed({ ...ded, [k]: Number(e.target.value) || 0 }); setDirty(true); }} />
            </div>
          ))}
        </details>
      </TableCell>
      <TableCell className="text-right">৳{gross.toLocaleString("en-BD")}</TableCell>
      <TableCell className="text-right font-semibold">৳{net.toLocaleString("en-BD")}</TableCell>
      <TableCell>
        {p.payment_status === "paid"
          ? <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>
          : <Badge variant="outline">{p.payment_status}</Badge>}
        {p.payment_method && <div className="text-[10px] text-muted-foreground mt-0.5">{p.payment_method}{p.payment_ref ? ` · ${p.payment_ref}` : ""}</div>}
      </TableCell>
      <TableCell>
        <div className="inline-flex gap-1">
          {!isFinalized && dirty && (
            <Button size="sm" variant="outline" onClick={() => { onSave({ basic, allowances: allow, deductions: ded }); setDirty(false); }}>Save</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onPrint}><Printer className="h-3.5 w-3.5" /></Button>
          {isFinalized && p.payment_status !== "paid" && (
            <Button size="sm" variant="outline" onClick={onMarkPaid}>Pay</Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}