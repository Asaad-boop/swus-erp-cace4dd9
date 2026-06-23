import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Users, CheckCircle2, XCircle, Clock, Calendar, Loader2, AlertCircle, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyTeamSummary, getTeamLeaveRequests, decideTeamLeave } from "@/lib/erp/hr/team.functions";

export const Route = createFileRoute("/_authenticated/me/team")({
  head: () => ({ meta: [{ title: "My Team" }] }),
  component: TeamPage,
});

function TeamPage() {
  const qc = useQueryClient();
  const teamFn = useServerFn(getMyTeamSummary);
  const leaveFn = useServerFn(getTeamLeaveRequests);
  const decideFn = useServerFn(decideTeamLeave);

  const [status, setStatus] = useState<"pending" | "all">("pending");
  const [decisionTarget, setDecisionTarget] = useState<{ id: string; mode: "approved" | "rejected"; name?: string } | null>(null);
  const [note, setNote] = useState("");

  const { data: team, isLoading: tLoading } = useQuery({
    queryKey: ["me", "team", "summary"],
    queryFn: () => teamFn(),
  });
  const { data: lv, isLoading: lLoading } = useQuery({
    queryKey: ["me", "team", "leave", status],
    queryFn: () => leaveFn({ data: { status } }),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected"; note: string }) =>
      decideFn({ data: { id: v.id, decision: v.decision, note: v.note || null } }),
    onSuccess: () => {
      toast.success("Decision saved");
      qc.invalidateQueries({ queryKey: ["me", "team"] });
      setDecisionTarget(null);
      setNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (tLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;

  if (!team?.isManager) {
    return (
      <Card className="p-10 text-center space-y-2">
        <Users className="h-10 w-10 mx-auto text-muted-foreground" />
        <div className="font-semibold">Apnar under e kono team member nei</div>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Jokhon HR apnar under e employee assign korbe, ekhane tader attendance o leave request dekhabe.
        </p>
      </Card>
    );
  }

  const reports: any[] = team.reports ?? [];
  const todayAtt: Record<string, any> = team.todayAttendance ?? {};
  const leaveRows: any[] = lv?.rows ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Team</h1>
          <p className="text-sm text-muted-foreground">{reports.length} direct reports · {team.pendingLeaveCount} pending approvals</p>
        </div>
      </div>

      {/* Team grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => {
          const a = todayAtt[r.id];
          const stateLabel =
            !a ? "Absent" :
            a.check_out_time ? "Done" :
            a.check_in_time ? (a.late_min > 0 ? `Late · ${a.late_min}m` : "Working") : "Absent";
          const tone =
            !a ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" :
            a.check_out_time ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" :
            a.late_min > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" :
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-11 w-11">
                  {r.photo_url && <AvatarImage src={r.photo_url} />}
                  <AvatarFallback>{(r.display_name || r.full_name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.display_name || r.full_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.hr_designations?.name || "—"}{r.hr_departments?.name ? ` · ${r.hr_departments.name}` : ""}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                      <Clock className="h-3 w-3" /> {stateLabel}
                    </span>
                    {a?.check_in_time && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        in {new Date(a.check_in_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Leave inbox */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Leave approvals</h2>
            {team.pendingLeaveCount > 0 && (
              <Badge variant="secondary" className="ml-1">{team.pendingLeaveCount} pending</Badge>
            )}
          </div>
          <Tabs value={status} onValueChange={(v) => setStatus(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" />
            <TabsContent value="all" />
          </Tabs>
        </div>

        {lLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : leaveRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
            {status === "pending" ? "Kono pending request nei" : "Kono request nei"}
          </div>
        ) : (
          <div className="divide-y">
            {leaveRows.map((r) => {
              const emp = r.hr_employees;
              const type = r.hr_leave_types;
              return (
                <div key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <Avatar className="h-10 w-10 shrink-0">
                    {emp?.photo_url && <AvatarImage src={emp.photo_url} />}
                    <AvatarFallback>{(emp?.display_name || emp?.full_name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{emp?.display_name || emp?.full_name}</span>
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                        style={type?.color ? { backgroundColor: type.color + "22", color: type.color } : undefined}
                      >
                        {type?.name || "Leave"}
                      </Badge>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(r.from_date).toLocaleDateString()} – {new Date(r.to_date).toLocaleDateString()}
                      </span>
                      <span>· {r.days} {r.days === 1 ? "day" : "days"}</span>
                      {r.is_half_day && <span className="text-amber-600">half-day ({r.half_day_part})</span>}
                    </div>
                    {r.reason && <div className="mt-1 text-sm line-clamp-2">{r.reason}</div>}
                    {r.decision_note && (
                      <div className="mt-1 text-xs text-muted-foreground italic">Note: {r.decision_note}</div>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2 sm:flex-col sm:gap-1.5">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => { setDecisionTarget({ id: r.id, mode: "approved", name: emp?.display_name || emp?.full_name }); setNote(""); }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/5"
                        onClick={() => { setDecisionTarget({ id: r.id, mode: "rejected", name: emp?.display_name || emp?.full_name }); setNote(""); }}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={!!decisionTarget} onOpenChange={(o) => !o && setDecisionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionTarget?.mode === "approved" ? "Approve" : "Reject"} leave — {decisionTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <label className="text-xs font-medium text-muted-foreground">
              {decisionTarget?.mode === "approved" ? "Optional note" : "Reason (optional)"}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={decisionTarget?.mode === "approved" ? "Approved — enjoy your time off" : "Why rejected?"}
              rows={3}
            />
            {decisionTarget?.mode === "rejected" && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Employee ke janano hobe ei decision.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecisionTarget(null)}>Cancel</Button>
            <Button
              className={decisionTarget?.mode === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}
              disabled={decide.isPending}
              onClick={() => decisionTarget && decide.mutate({ id: decisionTarget.id, decision: decisionTarget.mode, note })}
            >
              {decide.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirm {decisionTarget?.mode === "approved" ? "approval" : "rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    rejected: "bg-destructive/15 text-destructive",
    cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${map[status] || ""}`}>
      {status}
    </span>
  );
}