import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, XCircle, Hourglass, Plus, Check, X, CalendarRange, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listLeaveRequests, applyLeave, decideLeave, cancelLeave, listLeaveTypes, getLeaveKpis } from "@/lib/erp/hr/leave.functions";
import { listEmployees } from "@/lib/erp/hr/hr.functions";

export const Route = createFileRoute("/_authenticated/erp/hr/leave/")({
  head: () => ({ meta: [{ title: "Leave — HR" }] }),
  component: LeavePage,
});

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-slate-100 text-slate-700",
};

function LeavePage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [open, setOpen] = useState(false);

  const listFn = useServerFn(listLeaveRequests);
  const kpiFn = useServerFn(getLeaveKpis);
  const decideFn = useServerFn(decideLeave);
  const cancelFn = useServerFn(cancelLeave);

  const { data: rows = [], isLoading } = useQuery({ queryKey: ["leave-list", status], queryFn: () => listFn({ data: { status } }) });
  const { data: kpi } = useQuery({ queryKey: ["leave-kpi"], queryFn: () => kpiFn() });

  const decideMut = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "rejected"; note?: string }) => decideFn({ data: { id: vars.id, decision: vars.decision, decision_note: vars.note ?? null } }),
    onSuccess: () => { toast.success("Done"); qc.invalidateQueries({ queryKey: ["leave-list"] }); qc.invalidateQueries({ queryKey: ["leave-kpi"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["leave-list"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div>
      <HrSubnav />
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leave</h1>
            <p className="text-sm text-muted-foreground">Requests, balances, approvals</p>
          </div>
          <div className="flex gap-2">
            <Link to="/erp/hr/leave/calendar" className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"><CalendarRange className="h-4 w-4" />Calendar</Link>
            <Link to="/erp/hr/leave/policy" className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent"><Settings className="h-4 w-4" />Policy</Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Apply leave</Button></DialogTrigger>
              <ApplyDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["leave-list"] }); qc.invalidateQueries({ queryKey: ["leave-kpi"] }); }} />
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Hourglass} label="Pending" value={kpi?.pending ?? 0} tone="text-amber-600" />
          <KpiCard icon={CheckCircle2} label="Approved (this month)" value={kpi?.approvedThisMonth ?? 0} tone="text-emerald-600" />
          <KpiCard icon={XCircle} label="Rejected (this month)" value={kpi?.rejectedThisMonth ?? 0} tone="text-red-600" />
          <KpiCard icon={CalendarDays} label="On leave today" value={kpi?.onLeaveToday ?? 0} tone="text-blue-600" />
        </div>

        <Card><CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead>
                <TableHead>To</TableHead><TableHead className="text-right">Days</TableHead>
                <TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : (rows as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No leave requests</TableCell></TableRow>
                ) : (rows as any[]).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell><div className="font-medium text-sm">{r.employee?.full_name}</div><div className="text-xs text-muted-foreground">{r.employee?.employee_code}</div></TableCell>
                    <TableCell><Badge variant="secondary" style={{ backgroundColor: `${r.leave_type?.color}22`, color: r.leave_type?.color }}>{r.leave_type?.name}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.from_date}</TableCell>
                    <TableCell className="font-mono text-xs">{r.to_date}</TableCell>
                    <TableCell className="text-right font-medium">{r.days}{r.is_half_day && " ½"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm" title={r.reason ?? ""}>{r.reason ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary" className={STATUS_TONE[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => decideMut.mutate({ id: r.id, decision: "approved" })}><Check className="h-4 w-4 text-emerald-600" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => decideMut.mutate({ id: r.id, decision: "rejected" })}><X className="h-4 w-4 text-red-600" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate(r.id)}>Cancel</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5"><Icon className={`h-3.5 w-3.5 ${tone ?? ""}`} />{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}

function ApplyDialog({ onDone }: { onDone: () => void }) {
  const empsFn = useServerFn(listEmployees);
  const typesFn = useServerFn(listLeaveTypes);
  const applyFn = useServerFn(applyLeave);
  const { data: emps } = useQuery({ queryKey: ["hr-emp-mini"], queryFn: () => empsFn({ data: { pageSize: 500 } }) });
  const { data: types = [] } = useQuery({ queryKey: ["leave-types"], queryFn: () => typesFn() });

  const [form, setForm] = useState<any>({
    employee_id: "", leave_type_id: "",
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    is_half_day: false, reason: "",
  });

  const mut = useMutation({
    mutationFn: () => applyFn({ data: form }),
    onSuccess: () => { toast.success("Submitted"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Apply leave</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>Employee</Label>
          <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>{(emps?.rows ?? []).map((e: any) => (<SelectItem key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</SelectItem>))}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Leave type</Label>
          <Select value={form.leave_type_id} onValueChange={(v) => setForm({ ...form, leave_type_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>{(types as any[]).map((t: any) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>From</Label><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
          <div><Label>To</Label><Input type="date" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_half_day} onChange={(e) => setForm({ ...form, is_half_day: e.target.checked })} />Half day</label>
        <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} /></div>
      </div>
      <DialogFooter><Button disabled={!form.employee_id || !form.leave_type_id || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Submitting…" : "Submit"}</Button></DialogFooter>
    </DialogContent>
  );
}