import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, LogIn, LogOut, Coffee, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMyPunchToday } from "@/lib/erp/hr/me-punch.functions";
import { punchIn, punchOut, punchBreak } from "@/lib/erp/hr/punch.functions";

function fmtClock(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function dur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

async function getGeo(): Promise<{ lat: number | null; lng: number | null }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { lat: null, lng: null };
  return await new Promise((res) => {
    const t = setTimeout(() => res({ lat: null, lng: null }), 4000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); res({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); res({ lat: null, lng: null }); },
      { timeout: 4000, enableHighAccuracy: false },
    );
  });
}

export function AttendancePunchCard({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const getToday = useServerFn(getMyPunchToday);
  const inFn = useServerFn(punchIn);
  const outFn = useServerFn(punchOut);
  const breakFn = useServerFn(punchBreak);

  const { data, isLoading } = useQuery({
    queryKey: ["my-punch-today"],
    queryFn: () => getToday(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const [busy, setBusy] = useState<null | "in" | "out" | "break-start" | "break-end">(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const emp = data?.employee;
  const att = data?.attendance;
  const shift = data?.shift as any;

  const state = useMemo(() => {
    if (!att?.check_in_time) return "not_in" as const;
    if (att.check_out_time) return "done" as const;
    if (att.break_start && !att.break_end) return "on_break" as const;
    return "working" as const;
  }, [att]);

  const checkInAt = att?.check_in_time ? new Date(att.check_in_time) : null;
  const checkOutAt = att?.check_out_time ? new Date(att.check_out_time) : null;
  const breakStart = att?.break_start ? new Date(att.break_start) : null;
  const breakEnd = att?.break_end ? new Date(att.break_end) : null;

  const elapsed = checkInAt
    ? (checkOutAt ? checkOutAt.getTime() : now.getTime()) - checkInAt.getTime()
      - (breakStart && breakEnd ? breakEnd.getTime() - breakStart.getTime() : 0)
      - (breakStart && !breakEnd ? now.getTime() - breakStart.getTime() : 0)
    : 0;

  // late warning
  let lateMin = 0;
  if (shift?.start_time && !checkInAt) {
    const [h, m] = String(shift.start_time).split(":").map(Number);
    const start = new Date(); start.setHours(h, m, 0, 0);
    const diff = Math.round((now.getTime() - start.getTime()) / 60000);
    if (diff > Number(shift.grace_minutes ?? 0)) lateMin = diff;
  }

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["my-punch-today"] });
  };

  const handlePunchIn = async () => {
    if (!emp) return;
    setBusy("in");
    try {
      const geo = await getGeo();
      await inFn({ data: { employee_id: emp.id, lat: geo.lat, lng: geo.lng } });
      toast.success("Checked in — have a great day!");
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Check-in failed"); }
    finally { setBusy(null); }
  };
  const handlePunchOut = async () => {
    if (!emp) return;
    setBusy("out");
    try {
      const geo = await getGeo();
      const r: any = await outFn({ data: { employee_id: emp.id, lat: geo.lat, lng: geo.lng } });
      toast.success(`Checked out — ${r?.total_hours ?? "—"}h logged`);
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Check-out failed"); }
    finally { setBusy(null); }
  };
  const handleBreak = async (action: "start" | "end") => {
    if (!emp) return;
    setBusy(action === "start" ? "break-start" : "break-end");
    try {
      await breakFn({ data: { employee_id: emp.id, action } });
      toast.success(action === "start" ? "Break started" : "Break ended");
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Break update failed"); }
    finally { setBusy(null); }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 animate-pulse">
        <div className="h-4 w-24 bg-muted rounded mb-3" />
        <div className="h-9 w-32 bg-muted rounded mb-3" />
        <div className="h-9 w-full bg-muted rounded" />
      </div>
    );
  }

  if (!emp) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-4" />
          <span className="text-sm font-medium">Attendance unavailable</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Apnar account er sathe kono employee record link kora nei. HR ke bolun apnake link kore dite.
        </p>
      </div>
    );
  }

  const tone =
    state === "working" ? "emerald" :
    state === "on_break" ? "amber" :
    state === "done" ? "slate" : "indigo";

  return (
    <div className={cn(
      "rounded-xl border border-border/60 bg-card overflow-hidden",
      compact ? "p-3.5" : "p-4",
    )}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className={cn(
            "size-2 rounded-full",
            tone === "emerald" && "bg-emerald-500 animate-pulse",
            tone === "amber" && "bg-amber-500 animate-pulse",
            tone === "slate" && "bg-slate-400",
            tone === "indigo" && "bg-indigo-500",
          )} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {state === "not_in" && "Not checked in"}
            {state === "working" && "Working"}
            {state === "on_break" && "On break"}
            {state === "done" && "Day complete"}
          </span>
        </div>
        <Clock className="size-3.5 text-muted-foreground/70" />
      </div>

      <div className="tabular-nums leading-none tracking-tight font-semibold text-foreground text-2xl mb-1"
        style={{ fontFamily: "Sora, ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.02em" }}>
        {checkInAt ? dur(elapsed) : fmtClock(now)}
      </div>
      <div className="text-[11px] text-muted-foreground mb-3">
        {checkInAt
          ? <>In {fmtClock(checkInAt)}{checkOutAt ? ` · Out ${fmtClock(checkOutAt)}` : ""}{shift?.name ? ` · ${shift.name}` : ""}</>
          : lateMin > 0
          ? <span className="text-rose-600 dark:text-rose-400 font-medium">Late by {lateMin} min</span>
          : shift?.start_time ? `Shift starts ${String(shift.start_time).slice(0, 5)}` : "Ready when you are"}
      </div>

      {state === "not_in" && (
        <Button size="sm" className="w-full gap-1.5 h-9" onClick={handlePunchIn} disabled={busy === "in"}>
          {busy === "in" ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
          Check in
        </Button>
      )}

      {state === "working" && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => handleBreak("start")} disabled={busy === "break-start"}>
            {busy === "break-start" ? <Loader2 className="size-3.5 animate-spin" /> : <Coffee className="size-3.5" />}
            Break
          </Button>
          <Button size="sm" className="gap-1.5 h-9" onClick={handlePunchOut} disabled={busy === "out"}>
            {busy === "out" ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
            Check out
          </Button>
        </div>
      )}

      {state === "on_break" && (
        <Button size="sm" variant="outline" className="w-full gap-1.5 h-9" onClick={() => handleBreak("end")} disabled={busy === "break-end"}>
          {busy === "break-end" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          End break
        </Button>
      )}

      {state === "done" && (
        <div className="text-center text-xs text-muted-foreground py-1">
          ✓ {att?.total_hours ?? "—"}h logged today
        </div>
      )}
    </div>
  );
}