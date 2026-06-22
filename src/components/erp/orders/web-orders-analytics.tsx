import { useMemo, useState, lazy, Suspense } from "react";
import { ChevronDown, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  created_at: string;
  web_status: string | null;
  source_website: string | null;
  attribution?: { utm_source: string | null; utm_medium: string | null } | null;
};

const Charts = lazy(() => import("./web-orders-analytics-charts"));

export function WebOrdersAnalytics({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  const todayRows = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return rows.filter((r) => new Date(r.created_at).getTime() >= startMs);
  }, [rows]);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold">Analytics</span>
          <span className="text-xs text-muted-foreground">· Today ({todayRows.length} orders)</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t p-4">
          <Suspense fallback={<div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading charts…</div>}>
            <Charts rows={rows} todayRows={todayRows} />
          </Suspense>
        </div>
      )}
    </div>
  );
}