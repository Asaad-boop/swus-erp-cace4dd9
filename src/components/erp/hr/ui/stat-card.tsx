import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "indigo" | "emerald" | "amber" | "red" | "blue" | "slate";

const accentMap: Record<Accent, { border: string; iconBg: string; iconText: string }> = {
  indigo: { border: "border-l-indigo-500", iconBg: "bg-indigo-50", iconText: "text-indigo-600" },
  emerald: { border: "border-l-emerald-500", iconBg: "bg-emerald-50", iconText: "text-emerald-600" },
  amber: { border: "border-l-amber-500", iconBg: "bg-amber-50", iconText: "text-amber-600" },
  red: { border: "border-l-red-500", iconBg: "bg-red-50", iconText: "text-red-600" },
  blue: { border: "border-l-blue-500", iconBg: "bg-blue-50", iconText: "text-blue-600" },
  slate: { border: "border-l-slate-400", iconBg: "bg-slate-50", iconText: "text-slate-600" },
};

interface Props {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  accent?: Accent;
  trend?: { value: number; label?: string } | null;
  loading?: boolean;
  hint?: string;
}

export function StatCard({ label, value, icon: Icon, accent = "slate", trend, loading, hint }: Props) {
  const a = accentMap[accent];
  const up = trend && trend.value >= 0;
  return (
    <div
      className={cn(
        "group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-150 p-5 border-l-4",
        a.border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{label}</div>
        {Icon && (
          <div className={cn("rounded-lg p-1.5", a.iconBg)}>
            <Icon className={cn("h-4 w-4", a.iconText)} />
          </div>
        )}
      </div>
      <div className="mt-3 text-3xl font-bold text-gray-900 tabular-nums leading-none">
        {loading ? <span className="inline-block h-7 w-16 bg-gray-100 rounded animate-pulse" /> : value}
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
              up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend.value)}%
          </span>
          {trend.label && <span className="text-gray-500">{trend.label}</span>}
        </div>
      )}
      {hint && !trend && <div className="mt-2 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}