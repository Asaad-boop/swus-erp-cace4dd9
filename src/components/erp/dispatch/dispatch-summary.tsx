import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

type Stats = {
  pendingCount: number; pendingValue: number;
  packedCount: number; packedValue: number;
  readyCount: number; readyValue: number;
  shippedCount: number; shippedValue: number;
  pathaoCount: number; pathaoValue: number;
  manualCount: number; manualValue: number;
  topProducts: { name: string; qty: number }[];
};

const fmt = (n: number) => `৳${Math.round(n).toLocaleString()}`;

export function DispatchSummary({
  open, onOpenChange, stats, dateLabel, onExportCsv,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stats: Stats;
  dateLabel: string;
  onExportCsv: () => void;
}) {
  const Row = ({ emoji, label, count, value, color }: { emoji: string; label: string; count: number; value: number; color: string }) => (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${color}`}>
      <span className="text-sm font-medium">{emoji} {label}</span>
      <span className="text-sm tabular-nums">{count} orders · <strong>{fmt(value)}</strong></span>
    </div>
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>Today's Dispatch — {dateLabel}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          <Row emoji="📦" label="Pending" count={stats.pendingCount} value={stats.pendingValue} color="bg-slate-100" />
          <Row emoji="📫" label="Packed" count={stats.packedCount} value={stats.packedValue} color="bg-amber-50" />
          <Row emoji="🚀" label="Ready" count={stats.readyCount} value={stats.readyValue} color="bg-emerald-50" />
          <Row emoji="✅" label="Shipped" count={stats.shippedCount} value={stats.shippedValue} color="bg-blue-50" />
        </div>
        {(stats.pathaoCount > 0 || stats.manualCount > 0) && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-2">Courier Breakdown</h3>
            <div className="space-y-1 text-sm">
              {stats.pathaoCount > 0 && (
                <div className="flex justify-between"><span>Pathao</span><span>{stats.pathaoCount} · {fmt(stats.pathaoValue)}</span></div>
              )}
              {stats.manualCount > 0 && (
                <div className="flex justify-between"><span>Manual</span><span>{stats.manualCount} · {fmt(stats.manualValue)}</span></div>
              )}
            </div>
          </div>
        )}
        {stats.topProducts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-2">Top Products Today</h3>
            <ul className="space-y-1 text-sm">
              {stats.topProducts.map((p) => (
                <li key={p.name} className="flex justify-between">
                  <span className="truncate pr-2">{p.name}</span>
                  <span className="tabular-nums">× {p.qty}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-8 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onExportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}