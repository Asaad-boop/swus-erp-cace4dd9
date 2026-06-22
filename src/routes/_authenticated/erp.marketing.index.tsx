import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, RefreshCw, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBrandPicker } from "@/components/erp/brand-picker-gate";
import { DashboardOverview } from "@/components/erp/marketing/dashboard-overview";
import { syncBrandInsightsRange } from "@/lib/erp/marketing/meta.functions";

export const Route = createFileRoute("/_authenticated/erp/marketing/")({
  component: MarketingOverview,
});

function MarketingOverview() {
  const { brandId, effectiveBrand, picker } = useBrandPicker();
  const qc = useQueryClient();
  const syncRangeFn = useServerFn(syncBrandInsightsRange);
  const [isSyncing, setIsSyncing] = useState(false);

  async function syncToday() {
    if (!brandId) return;
    setIsSyncing(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await syncRangeFn({ data: { brandId, since: today, until: today } });
      toast.success(`Synced today · ${res.rows} rows`);
      await qc.invalidateQueries({ queryKey: ["mkt", "dashboard-summary", brandId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[#1877F2]/5 via-background to-background p-5">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#1877F2]/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1877F2]/10 text-[#1877F2] ring-1 ring-[#1877F2]/20">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight">Marketing Overview</h1>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {effectiveBrand?.name ?? "—"} · ek look e ajker spend, ROAS, top campaigns & budget pacing.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {picker}
            <Button
              variant="outline"
              onClick={syncToday}
              disabled={isSyncing || !brandId}
              className="gap-2"
              title="Sync today's Meta data"
            >
              <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
              Sync Today
            </Button>
            <Button asChild className="gap-2 bg-[#1877F2] hover:bg-[#1877F2]/90">
              <Link to="/erp/marketing/performance">
                Performance Table
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {brandId ? (
        <DashboardOverview brandId={brandId} />
      ) : (
        <div className="rounded-xl border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          Select a brand to view its marketing dashboard.
        </div>
      )}
    </div>
  );
}