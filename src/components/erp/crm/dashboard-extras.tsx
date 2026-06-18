import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { RefreshCw, AlarmClock, Megaphone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recalculateRfm, pushSegmentToMetaAudience } from "@/lib/erp/crm/admin.functions";
import { getOverdueCrmTasks } from "@/lib/erp/crm/engagement.functions";
import { listConnectedAdAccounts } from "@/lib/erp/marketing/meta.functions";
import { SEGMENT_LABELS } from "@/lib/erp/crm/segments";
import type { CrmSegment } from "@/lib/erp/crm/types";

/* ===== Recalculate RFM button ===== */

export function RecalculateRfmButton() {
  const fn = useServerFn(recalculateRfm);
  const mut = useMutation({
    mutationFn: () => fn({ data: {} }),
    onSuccess: () => toast.success("RFM recalculated"),
    onError: (e: any) => toast.error(e.message ?? "Recalc failed"),
  });
  return (
    <Button variant="outline" size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
      <RefreshCw className={`h-4 w-4 mr-1.5 ${mut.isPending ? "animate-spin" : ""}`} />
      {mut.isPending ? "Recalculating…" : "Recalculate RFM"}
    </Button>
  );
}

/* ===== Overdue tasks widget ===== */

export function OverdueTasksCard({ brandId }: { brandId?: string }) {
  const fn = useServerFn(getOverdueCrmTasks);
  const q = useQuery({
    queryKey: ["crm-overdue-tasks", brandId ?? "all"],
    queryFn: () => fn({ data: { brandId, limit: 5 } }),
    staleTime: 30_000,
  });

  if (q.isLoading) return null;
  const total = q.data?.total ?? 0;
  const rows = q.data?.rows ?? [];
  if (!total) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md grid place-items-center text-amber-600 bg-amber-100">
              <AlarmClock className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Overdue tasks</div>
              <div className="text-[11px] text-muted-foreground">{total} pending follow-ups</div>
            </div>
          </div>
          <Badge variant="destructive" className="text-[10px]">{total}</Badge>
        </div>
        <div className="space-y-1">
          {rows.map((t: any) => (
            <Link
              key={t.id}
              to="/erp/crm/$customerId"
              params={{ customerId: t.customer_key }}
              className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-amber-100/60"
            >
              <span className="truncate flex-1">{t.title}</span>
              <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                {t.due_date ? new Date(t.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ===== Push to Meta Audience dialog ===== */

export function PushToMetaDialog({
  open, onOpenChange, brandId,
}: { open: boolean; onOpenChange: (v: boolean) => void; brandId?: string }) {
  const pushFn = useServerFn(pushSegmentToMetaAudience);
  const listAccountsFn = useServerFn(listConnectedAdAccounts);
  const [segment, setSegment] = useState<CrmSegment>("vip");
  const [adAccountId, setAdAccountId] = useState<string>("");
  const [name, setName] = useState("");

  const accountsQ = useQuery({
    queryKey: ["mkt-accounts-for-meta-push", brandId],
    enabled: open && !!brandId,
    queryFn: () => listAccountsFn({ data: { brandId: brandId! } }),
  });

  const pushMut = useMutation({
    mutationFn: () =>
      pushFn({ data: { brandId: brandId!, adAccountId, segment, audienceName: name.trim() || undefined } }),
    onSuccess: (r: any) => {
      if (!r.ok) { toast.error(r.error || "Push failed"); return; }
      toast.success(`Pushed ${r.uploaded} contacts to "${r.audienceName}"`);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Push failed"),
  });

  const accounts = accountsQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Push segment to Meta Audience
          </DialogTitle>
          <DialogDescription>
            Phones SHA-256 hashed kore Meta Custom Audience banabe. App secret thakle appsecret_proof use hobe.
          </DialogDescription>
        </DialogHeader>

        {!brandId ? (
          <div className="flex items-center gap-2 text-sm p-3 rounded-md border bg-amber-50 text-amber-800">
            <AlertTriangle className="h-4 w-4" /> Top brand switcher e specific brand select korun.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Segment</Label>
              <Select value={segment} onValueChange={(v: any) => setSegment(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SEGMENT_LABELS) as CrmSegment[]).map((s) => (
                    <SelectItem key={s} value={s}>{SEGMENT_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ad account</Label>
              <Select value={adAccountId} onValueChange={setAdAccountId}>
                <SelectTrigger><SelectValue placeholder={accountsQ.isLoading ? "Loading…" : "Choose ad account"} /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id} disabled={!a.has_access_token}>
                      {a.name} {!a.has_access_token && "(no token)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!accounts.length && !accountsQ.isLoading && (
                <p className="text-[11px] text-muted-foreground">Ei brand e Meta ad account configured nei.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Audience name (optional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto-generated if blank" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!brandId || !adAccountId || pushMut.isPending}
            onClick={() => pushMut.mutate()}
          >
            {pushMut.isPending ? "Pushing…" : "Push to Meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}