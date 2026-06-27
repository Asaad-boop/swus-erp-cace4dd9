import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CostSource = "fifo" | "fx_fallback" | "manual" | "mixed";

const STYLES: Record<CostSource, { cls: string; label: string }> = {
  fifo:        { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "FIFO" },
  fx_fallback: { cls: "bg-amber-50 text-amber-700 border-amber-200",       label: "FX Fallback" },
  manual:      { cls: "bg-slate-50 text-slate-600 border-slate-200",       label: "Manual" },
  mixed:       { cls: "bg-amber-50 text-amber-700 border-amber-200",       label: "Mixed" },
};

export function CostSourceBadge({
  source,
  estimated,
  className,
}: {
  source: CostSource;
  estimated?: boolean;
  className?: string;
}) {
  const s = STYLES[source];
  return (
    <Badge variant="outline" className={cn("border font-medium", s.cls, className)}>
      {s.label}{estimated && source !== "fifo" ? " · Est" : ""}
    </Badge>
  );
}

export function EstimatedWarning({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("border font-medium bg-amber-50 text-amber-700 border-amber-200", className)}>
      ⚠ Some Meta costs estimated
    </Badge>
  );
}