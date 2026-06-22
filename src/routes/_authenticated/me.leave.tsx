import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Plane, Calendar, AlertCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getMyLeaveData, applyMyLeave, cancelMyLeave } from "@/lib/erp/hr/me.functions";

export const Route = createFileRoute("/_authenticated/me/leave")({
  head: () => ({ meta: [{ title: "My Leave" }] }),
  component: LeavePage,
});

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-200",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-500/10 text-rose-700 border-rose-200",
  cancelled: "bg-muted text-muted-foreground",
};

function LeavePage() {
  const qc = useQueryClient();
  const fn = useServerFn(getMyLeaveData);
  const apply = useServerFn(applyMyLeave);
  const cancel = useServerFn(cancelMyLeave);
  const { data } = useQuery({ queryKey: ["me", "leave"], queryFn: () => fn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    leave_type_id: "",
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    is_half_day: false,
    half_day_part: "first" as "first" | "second",
    reason: "",
    contact_during_leave: "",
  });

  const applyMut = useMutation({
    mutationFn: () => apply({
      data: {
        leave_type_id: form.leave_type_id,
        from_date: form.from_date,
        to_date: form.is_half_day ? form.from_date : form.to_date,
        is_half_day: form.is_half_day,
        half_day_part: form.is_half_day ? form.half_day_part : null,
        reason: form.reason || null,
        contact_during_leave: form.contact_during_leave || null,
      },
    }),
    onSuccess: () => {
      toast.success("Leave request submitted");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["me", "leave"] });
      qc.invalidateQueries({ queryKey: ["me", "stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: () => {
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["me", "leave"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const balances = data?.balances ?? [];
  const requests = data?.requests ?? [];
  const leaveTypes = data?.leaveTypes ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><Plane className="h-5 w-5 text-violet-600" /> Leave</h1>
        <Button
          onClick={() => {
            setForm((f) => ({ ...f, leave_type_id: leaveTypes[0]?.id ?? "" }));
            setOpen(true);
          }}
          disabled={!leaveTypes.length}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Apply
        </Button>
      </div>

      {/* Balances */}
      {balances.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {balances.map((b: any) => {
            const total = Number(b.allocated || 0) + Number(b.carried || 0);
            const remaining = Math.max(0, total - Number(b.used || 0));
            const pct = total > 0 ? (Number(b.used || 0) / total) * 100 : 0;
            return (
              <Card key={b.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: b.hr_leave_types?.color || "#8b5cf6" }} />
                  <div className="font-medium text-sm truncate">{b.hr_leave_types?.name}</div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{remaining}</div>
                <div className="text-[11px] text-muted-foreground mb-2">of {total} days</div>
                <div className="h-1.5 rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No leave balance allocated yet. Contact HR.
        </Card>
      )}

      {/* History */}
      <Card>
        <div className="border-b px-4 py-3 font-semibold text-sm">Recent requests</div>
        {requests.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No requests yet</div>
        ) : (
          <div className="divide-y">
            {requests.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-lg grid place-items-center shrink-0" style={{ background: (r.hr_leave_types?.color || "#8b5cf6") + "22", color: r.hr_leave_types?.color || "#8b5cf6" }}>
                  <Plane className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {r.hr_leave_types?.name ?? "Leave"} · {r.days}d
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.from_date} {r.from_date !== r.to_date && `→ ${r.to_date}`}
                    {r.is_half_day && ` (½ ${r.half_day_part})`}
                  </div>
                </div>
                <Badge variant="outline" className={cn("capitalize text-[10px]", STATUS_TONE[r.status])}>{r.status}</Badge>
                {r.status === "pending" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => cancelMut.mutate(r.id)}
                    disabled={cancelMut.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Apply sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Apply for leave</SheetTitle>
            <SheetDescription>Submit krar por HR review korbe.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Leave type</Label>
              <Select value={form.leave_type_id} onValueChange={(v) => setForm({ ...form, leave_type_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: t.color || "#8b5cf6" }} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 rounded-lg border p-3">
              <Switch checked={form.is_half_day} onCheckedChange={(v) => setForm({ ...form, is_half_day: v })} />
              <Label className="cursor-pointer">Half day only</Label>
              {form.is_half_day && (
                <Select value={form.half_day_part} onValueChange={(v: any) => setForm({ ...form, half_day_part: v })}>
                  <SelectTrigger className="h-8 w-32 ml-auto"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First half</SelectItem>
                    <SelectItem value="second">Second half</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From</Label>
                <Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={form.is_half_day ? form.from_date : form.to_date} disabled={form.is_half_day} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Reason</Label>
              <Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why are you taking leave?" />
            </div>

            <div>
              <Label>Contact during leave</Label>
              <Input value={form.contact_during_leave} onChange={(e) => setForm({ ...form, contact_during_leave: e.target.value })} placeholder="Phone / alternate" />
            </div>
          </div>
          <SheetFooter className="mt-5">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => applyMut.mutate()} disabled={!form.leave_type_id || applyMut.isPending}>
              {applyMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Submit request
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}