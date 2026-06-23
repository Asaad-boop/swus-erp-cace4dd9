import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Lock, Download, Printer, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import {
  getPayrollRun, updatePayslip, finalizePayrollRun, markPayslipPaid, getPayslip,
} from "@/lib/erp/hr/payroll.functions";
import { exportToXlsx } from "@/lib/erp/hr/excel";
import { printPayslip } from "@/components/erp/hr/payroll/payslip-print";
import { useHrAccess } from "@/lib/erp/hr/role-gate";
import { StatusPill, type StatusTone } from "@/components/erp/hr/ui/status-pill";

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
    return <div className="min-h-screen bg-background"><HrSubnav /><div className="p-8 text-sm text-[color:var(--hr-text-muted)]"><Lock className="h-5 w-5 inline mr-2" />Restricted.</div></div>;
  }
  if (isLoading || !data) return <div className="min-h-screen bg-background"><HrSubnav /><div className="p-8 text-[color:var(--hr-text-muted)]">Loading…</div></div>;
  const { run, payslips, departments, designations } = data;
  const journalEntry = (data as any).journal_entry as { id: string; entry_no: string; entry_date: string; status: string } | null;
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
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <Link to="/erp/hr/payroll" className="text-sm text-[color:var(--hr-text-muted)] inline-flex items-center gap-1.5 hover:text-[color:var(--hr-text-strong)] transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to payroll
        </Link>

        <div className="bg-white rounded-2xl border border-[color:var(--hr-border)] shadow-sm overflow-hidden">
          <div className="h-16 bg-gradient-to-r from-indigo-600 to-violet-600" />
          <div className="px-6 py-5 flex justify-between items-end flex-wrap gap-4 -mt-8">
            <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-[color:var(--hr-border)]">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-[color:var(--hr-text-strong)]">{MONTHS[run.month - 1]} {run.year}</h1>
                {isFinalized && <StatusPill tone="finalized" dot><Lock className="h-3 w-3" />Finalized</StatusPill>}
                {isFinalized && journalEntry && (
                  <Link
                    to="/erp/finance/journal"
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                    title={journalEntry.entry_no}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Posted to Finance Journal
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                )}
              </div>
              <div className="text-xs text-[color:var(--hr-text-muted)] mt-1">{run.total_employees} employees · Paid {paidCount}/{(payslips as any[]).length}</div>
            </div>
            <div className="flex gap-2 pb-1">
              <Button size="sm" variant="outline" onClick={exportBankSheet} className="rounded-lg"><Download className="h-4 w-4 mr-1.5" /> Bank Sheet</Button>
              {!isFinalized && access.isAdmin && (
                <Button size="sm" className="rounded-lg bg-[color:var(--hr-accent)] hover:opacity-90" onClick={() => { if (confirm("Finalize this run? You cannot edit after finalizing.")) finMut.mutate(); }}>
                  <Lock className="h-4 w-4 mr-1.5" /> Finalize
                </Button>
              )}
            </div>
          </div>
          <div className="px-6 pb-5 grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-gray-50 px-4 py-3"><div className="text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">Gross</div><div className="text-lg font-bold text-[color:var(--hr-text-strong)] tabular-nums mt-1">৳{Number(run.total_gross).toLocaleString("en-BD")}</div></div>
            <div className="rounded-xl bg-gray-50 px-4 py-3"><div className="text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">Net</div><div className="text-lg font-bold text-[color:var(--hr-text-strong)] tabular-nums mt-1">৳{Number(run.total_net).toLocaleString("en-BD")}</div></div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3"><div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Paid</div><div className="text-lg font-bold text-emerald-700 tabular-nums mt-1">{paidCount}/{(payslips as any[]).length}</div></div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm overflow-x-auto">
          <Table>
              <TableHeader>
                <TableRow className="border-[color:var(--hr-border)] hover:bg-transparent">
                  <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">Employee</TableHead>
                  {["Basic","Allowances","OT Earning","Absent Ded.","Late Ded.","Deductions","Gross","Net Pay"].map(h => <TableHead key={h} className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold text-right">{h}</TableHead>)}
                  <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">Payment</TableHead>
                  <TableHead className="bg-muted/40"></TableHead>
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
        </div>
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
  const otEarn = Number(allow.overtime ?? p.overtime_earning ?? 0);
  const absentDed = Number(ded.absent ?? p.absent_deduction ?? 0);
  const lateDed = Number(ded.late ?? p.late_deduction ?? 0);
  const earningsBd = { basic, ...allow };
  const deductionsBd = { ...ded };

  return (
    <TableRow className="border-[color:var(--hr-border)] hover:bg-muted/40">
      <TableCell>
        <div className="font-semibold text-sm text-[color:var(--hr-text-strong)]">{p.hr_employees?.full_name ?? p.snapshot?.full_name ?? "—"}</div>
        <div className="text-xs text-[color:var(--hr-text-muted)]">{p.hr_employees?.employee_code ?? p.snapshot?.employee_code ?? ""} · {desigName} · {deptName}</div>
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" value={basic} disabled={isFinalized} className="w-24 text-right h-8 rounded-md border-[color:var(--hr-border)] tabular-nums"
          onChange={(e) => { setBasic(Number(e.target.value) || 0); setDirty(true); }} />
      </TableCell>
      <TableCell className="text-right text-xs">
        <div className="font-medium tabular-nums text-[color:var(--hr-text-strong)]">৳{allowSum.toLocaleString("en-BD")}</div>
        <details>
          <summary className="cursor-pointer text-[color:var(--hr-accent)] text-[10px] hover:underline">edit</summary>
          {Object.keys(allow).length === 0 && ["house","transport","medical","other"].map((k) => allow[k] = allow[k] ?? 0)}
          {Object.entries(allow).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 mt-1">
              <span className="w-16 capitalize text-[10px] text-[color:var(--hr-text-muted)]">{k}</span>
              <Input type="number" value={v} disabled={isFinalized} className="w-20 h-7 text-right rounded-md border-[color:var(--hr-border)] tabular-nums"
                onChange={(e) => { setAllow({ ...allow, [k]: Number(e.target.value) || 0 }); setDirty(true); }} />
            </div>
          ))}
        </details>
      </TableCell>
      <TableCell className="text-right tabular-nums text-emerald-600 text-xs">{otEarn > 0 ? `৳${otEarn.toLocaleString("en-BD")}` : "—"}</TableCell>
      <TableCell className="text-right tabular-nums text-red-600 text-xs">{absentDed > 0 ? `৳${absentDed.toLocaleString("en-BD")}` : "—"}</TableCell>
      <TableCell className="text-right tabular-nums text-red-600 text-xs">{lateDed > 0 ? `৳${lateDed.toLocaleString("en-BD")}` : "—"}</TableCell>
      <TableCell className="text-right text-xs">
        <div className="font-medium tabular-nums text-[color:var(--hr-text-strong)]">৳{dedSum.toLocaleString("en-BD")}</div>
        <details>
          <summary className="cursor-pointer text-[color:var(--hr-accent)] text-[10px] hover:underline">edit</summary>
          {Object.keys(ded).length === 0 && ["pf","tax","loan","other"].map((k) => ded[k] = ded[k] ?? 0)}
          {Object.entries(ded).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 mt-1">
              <span className="w-16 capitalize text-[10px] text-[color:var(--hr-text-muted)]">{k}</span>
              <Input type="number" value={v} disabled={isFinalized} className="w-20 h-7 text-right rounded-md border-[color:var(--hr-border)] tabular-nums"
                onChange={(e) => { setDed({ ...ded, [k]: Number(e.target.value) || 0 }); setDirty(true); }} />
            </div>
          ))}
        </details>
      </TableCell>
      <TableCell className="text-right tabular-nums text-[color:var(--hr-text-strong)]">৳{gross.toLocaleString("en-BD")}</TableCell>
      <TableCell className="text-right">
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-bold tabular-nums text-[color:var(--hr-text-strong)] cursor-help underline decoration-dotted decoration-gray-300">৳{net.toLocaleString("en-BD")}</span>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-xs">
              <div className="font-semibold mb-1">Earnings</div>
              {Object.entries(earningsBd).filter(([,v]) => Number(v) > 0).map(([k,v]) => (
                <div key={k} className="flex justify-between gap-3"><span className="capitalize text-gray-300">{k}</span><span className="tabular-nums">৳{Number(v).toLocaleString("en-BD")}</span></div>
              ))}
              <div className="font-semibold mt-2 mb-1">Deductions</div>
              {Object.entries(deductionsBd).filter(([,v]) => Number(v) > 0).length === 0 ? <div className="text-[color:var(--hr-text-muted)]">None</div> :
                Object.entries(deductionsBd).filter(([,v]) => Number(v) > 0).map(([k,v]) => (
                  <div key={k} className="flex justify-between gap-3"><span className="capitalize text-gray-300">{k}</span><span className="tabular-nums">৳{Number(v).toLocaleString("en-BD")}</span></div>
                ))
              }
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell>
        <StatusPill tone={(p.payment_status === "paid" ? "paid" : "pending") as StatusTone} dot>{p.payment_status}</StatusPill>
        {p.payment_method && <div className="text-[10px] text-[color:var(--hr-text-muted)] mt-1">{p.payment_method}{p.payment_ref ? ` · ${p.payment_ref}` : ""}</div>}
      </TableCell>
      <TableCell>
        <div className="inline-flex gap-1">
          {!isFinalized && dirty && (
            <Button size="sm" className="rounded-md h-7 bg-[color:var(--hr-accent)] hover:opacity-90" onClick={() => { onSave({ basic, allowances: allow, deductions: ded }); setDirty(false); }}>Save</Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onPrint}><Printer className="h-3.5 w-3.5" /></Button>
          {isFinalized && p.payment_status !== "paid" && (
            <Button size="sm" variant="outline" className="rounded-md h-7" onClick={onMarkPaid}>Pay</Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}