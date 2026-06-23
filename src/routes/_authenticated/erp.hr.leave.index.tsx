import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, XCircle, Hourglass, Plus, Check, X, CalendarRange, Settings, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";
import { listLeaveRequests, applyLeave, decideLeave, cancelLeave, listLeaveTypes, getLeaveKpis } from "@/lib/erp/hr/leave.functions";
import { listEmployees } from "@/lib/erp/hr/hr.functions";
import { PageHeader } from "@/components/erp/hr/ui/page-header";
import { StatCard } from "@/components/erp/hr/ui/stat-card";
import { StatusPill, type StatusTone } from "@/components/erp/hr/ui/status-pill";
import { EmptyState } from "@/components/erp/hr/ui/empty-state";

export const Route = createFileRoute("/_authenticated/erp/hr/leave/")({
  head: () => ({ meta: [{ title: "Leave — HR" }] }),
  component: LeavePage,
});

const TONE: Record<string, StatusTone> = {
  pending: "pending", approved: "approved", rejected: "rejected", cancelled: "inactive",
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
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Leave"
          subtitle="Requests, balances, approvals"
          actions={
            <>
              <Link to="/erp/hr/leave/calendar"><Button variant="outline" size="sm" className="rounded-lg"><CalendarRange className="h-4 w-4 mr-2" />Calendar</Button></Link>
              <Link to="/erp/hr/leave/policy"><Button variant="outline" size="sm" className="rounded-lg"><Settings className="h-4 w-4 mr-2" />Policy</Button></Link>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button size="sm" className="rounded-lg bg-[color:var(--hr-accent)] hover:opacity-90"><Plus className="h-4 w-4 mr-2" />Apply leave</Button></DialogTrigger>
                <ApplyDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["leave-list"] }); qc.invalidateQueries({ queryKey: ["leave-kpi"] }); }} />
              </Dialog>
            </>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pending" value={kpi?.pending ?? 0} icon={Hourglass} accent="amber" />
          <StatCard label="Approved this month" value={kpi?.approvedThisMonth ?? 0} icon={CheckCircle2} accent="emerald" />
          <StatCard label="Rejected this month" value={kpi?.rejectedThisMonth ?? 0} icon={XCircle} accent="red" />
          <StatCard label="On leave today" value={kpi?.onLeaveToday ?? 0} icon={CalendarDays} accent="blue" />
        </div>

        <div className="bg-white rounded-xl border border-[color:var(--hr-border)] shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40 h-9 rounded-lg border-[color:var(--hr-border)]"><SelectValue /></SelectTrigger>
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

          <div className="border border-[color:var(--hr-border)] rounded-xl overflow-hidden">
            <Table>
              <TableHeader><TableRow className="border-[color:var(--hr-border)] hover:bg-transparent">
                {["Employee","Type","From","To"].map(h => <TableHead key={h} className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">{h}</TableHead>)}
                <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold text-right">Days</TableHead>
                <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">Reason</TableHead>
                <TableHead className="bg-muted/40 text-[11px] uppercase tracking-wider text-[color:var(--hr-text-muted)] font-semibold">Status</TableHead>
                <TableHead className="bg-muted/40"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-[color:var(--hr-text-muted)]">Loading…</TableCell></TableRow>
                ) : (rows as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="p-0"><EmptyState icon={Inbox} title="No leave requests" description="Nothing to review for this filter." /></TableCell></TableRow>
                ) : (rows as any[]).map((r: any) => (
                  <TableRow key={r.id} className="border-[color:var(--hr-border)] hover:bg-muted/40">
                    <TableCell><div className="font-semibold text-sm text-[color:var(--hr-text-strong)]">{r.employee?.full_name}</div><div className="text-xs text-[color:var(--hr-text-muted)] font-mono">{r.employee?.employee_code}</div></TableCell>
                    <TableCell><Badge variant="secondary" style={{ backgroundColor: `${r.leave_type?.color}22`, color: r.leave_type?.color }}>{r.leave_type?.name}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-[color:var(--hr-text-strong)]">{r.from_date}</TableCell>
                    <TableCell className="font-mono text-xs text-[color:var(--hr-text-strong)]">{r.to_date}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-[color:var(--hr-text-strong)]">{r.days}{r.is_half_day && " ½"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-[color:var(--hr-text-muted)]" title={r.reason ?? ""}>{r.reason ?? "—"}</TableCell>
                    <TableCell><StatusPill tone={TONE[r.status] ?? "neutral"} dot>{r.status}</StatusPill></TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => decideMut.mutate({ id: r.id, decision: "approved" })}><Check className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => decideMut.mutate({ id: r.id, decision: "rejected" })}><X className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 text-[color:var(--hr-text-muted)]" onClick={() => cancelMut.mutate(r.id)}>Cancel</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
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