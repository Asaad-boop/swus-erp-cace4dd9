import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Lock, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listPayrollRuns, createPayrollRun, deletePayrollRun } from "@/lib/erp/hr/payroll.functions";
import { useHrAccess } from "@/lib/erp/hr/role-gate";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { StatusPill, type StatusTone } from "@/components/erp/hr/ui/status-pill";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/hr/payroll/")({
  head: () => ({ meta: [{ title: "Payroll — HR" }] }),
  component: PayrollIndex,
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function PayrollIndex() {
  const qc = useQueryClient();
  const access = useHrAccess();
  const listFn = useServerFn(listPayrollRuns);
  const createFn = useServerFn(createPayrollRun);
  const delFn = useServerFn(deletePayrollRun);

  const { data: runs = [], isLoading } = useQuery({ queryKey: ["payroll-runs"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { year, month, brand_id: null } }),
    onSuccess: () => {
      toast.success("Payroll run created");
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["payroll-runs"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!access.isLoading && !access.canManagePayroll) {
    return <div className="min-h-screen bg-gray-50"><HrSubnav /><div className="p-8 text-sm text-gray-500"><Lock className="h-5 w-5 inline mr-2" />Payroll is restricted to admin and operations roles.</div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Payroll"
          subtitle="Monthly payroll runs and payslips"
          actions={<Button size="sm" onClick={() => setOpen(true)} className="rounded-lg bg-gray-900 hover:bg-gray-800"><Plus className="h-4 w-4 mr-1.5" /> New Run</Button>}
        />

        {isLoading ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">Loading…</div>
        ) : (runs as any[]).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <EmptyState icon={Wallet} title="No payroll runs yet" description="Generate the first monthly payroll run to get started." action={
              <Button size="sm" onClick={() => setOpen(true)} className="rounded-lg bg-gray-900 hover:bg-gray-800"><Plus className="h-4 w-4 mr-1.5" />New Run</Button>
            } />
          </div>
        ) : (
          <div className="grid gap-3">
            {(runs as any[]).map((r) => {
              const tone: StatusTone = r.status === "finalized" ? "finalized" : r.status === "cancelled" ? "inactive" : "draft";
              return (
                <Link key={r.id} to="/erp/hr/payroll/$runId" params={{ runId: r.id }} className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all p-5 flex items-center gap-6">
                  <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 font-bold text-sm shrink-0">
                    {MONTHS[r.month - 1]}
                    <span className="sr-only">{r.year}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold text-gray-900">{MONTHS[r.month - 1]} {r.year}</div>
                      <StatusPill tone={tone} dot>{r.status === "finalized" ? <><Lock className="h-3 w-3" />Finalized</> : r.status}</StatusPill>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{r.total_employees} employees</div>
                  </div>
                  <div className="hidden sm:block text-right">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Gross</div>
                    <div className="text-sm font-semibold text-gray-700 tabular-nums">৳{Number(r.total_gross).toLocaleString("en-BD")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Net</div>
                    <div className="text-base font-bold text-gray-900 tabular-nums">৳{Number(r.total_net).toLocaleString("en-BD")}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {r.status === "draft" && access.isAdmin && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={(ev) => { ev.preventDefault(); if (confirm("Delete this draft run?")) delMut.mutate(r.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Payroll Run</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Month</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Array.from({length:5},(_,i)=>now.getFullYear()-2+i).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Auto-generates draft payslips for every active employee from their salary structure. You can edit each before finalizing.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}