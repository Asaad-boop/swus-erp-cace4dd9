import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Lock, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listPayrollRuns, createPayrollRun, deletePayrollRun } from "@/lib/erp/hr/payroll.functions";
import { useHrAccess } from "@/lib/erp/hr/role-gate";

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
    return <div><HrSubnav /><div className="p-6 text-sm text-muted-foreground"><Lock className="h-5 w-5 inline mr-2" />Payroll is restricted to admin and operations roles.</div></div>;
  }

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
            <p className="text-sm text-muted-foreground">Monthly payroll runs and payslips</p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Run</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Total Gross</TableHead>
                  <TableHead className="text-right">Total Net</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (runs as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No payroll runs yet.</TableCell></TableRow>
                ) : (runs as any[]).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to="/erp/hr/payroll/$runId" params={{ runId: r.id }} className="font-medium hover:underline">
                        {MONTHS[r.month - 1]} {r.year}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {r.status === "finalized"
                        ? <Badge className="bg-emerald-100 text-emerald-800"><Lock className="h-3 w-3 mr-1" />Finalized</Badge>
                        : r.status === "cancelled"
                          ? <Badge variant="outline">Cancelled</Badge>
                          : <Badge className="bg-amber-100 text-amber-800">Draft</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{r.total_employees}</TableCell>
                    <TableCell className="text-right">৳{Number(r.total_gross).toLocaleString("en-BD")}</TableCell>
                    <TableCell className="text-right font-semibold">৳{Number(r.total_net).toLocaleString("en-BD")}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Link to="/erp/hr/payroll/$runId" params={{ runId: r.id }}>
                          <Button size="sm" variant="ghost"><ArrowRight className="h-4 w-4" /></Button>
                        </Link>
                        {r.status === "draft" && access.isAdmin && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this draft run?")) delMut.mutate(r.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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