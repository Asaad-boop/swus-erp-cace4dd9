import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { getLastSyncStatus } from "@/lib/erp/marketing/meta.functions";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function LastSyncedBadge({
  brandIds,
  className,
}: {
  brandIds: string[];
  className?: string;
}) {
  const fn = useServerFn(getLastSyncStatus);
  const q = useQuery({
    queryKey: ["mkt", "last-sync", [...brandIds].sort()],
    queryFn: () => fn({ data: { brandIds } }),
    enabled: brandIds.length > 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  if (!brandIds.length) return null;

  const s = q.data;
  const running = s?.lastStatus === "running";
  const errored = s?.lastStatus === "error";
  const when = s?.lastCompletedAt ?? null;

  const Icon = running ? RefreshCw : errored ? AlertCircle : when ? CheckCircle2 : Clock;
  const tone = running
    ? "text-sky-600 border-sky-500/30 bg-sky-500/5"
    : errored
      ? "text-rose-600 border-rose-500/30 bg-rose-500/5"
      : when
        ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/5"
        : "text-muted-foreground border-muted";

  const label = running
    ? "Syncing…"
    : `Last synced ${relTime(when)}`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
            tone,
            className,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", running && "animate-spin")} />
          <span>{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        <div className="space-y-0.5">
          <div>
            Last completed:{" "}
            {when ? new Date(when).toLocaleString() : "never"}
          </div>
          {s?.lastStartedAt && (
            <div>Last started: {new Date(s.lastStartedAt).toLocaleString()}</div>
          )}
          {s?.lastStatus && <div>Status: {s.lastStatus}</div>}
          {errored && s?.lastError && (
            <div className="text-rose-500">Error: {s.lastError}</div>
          )}
          <div className="text-muted-foreground pt-1">
            Auto-refresh every 30s · pg_cron every 10m
          </div>
        </div>
      </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}