import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "indigo" | "emerald" | "amber" | "red" | "blue" | "slate";

const accentMap: Record<Accent, { fg: string; bg: string; ring: string }> = {
  indigo: {
    fg: "text-[color:var(--hr-accent)]",
    bg: "bg-[color:var(--hr-accent-soft)]",
    ring: "ring-[color:var(--hr-accent)]/15",
  },
  emerald: {
    fg: "text-[color:var(--hr-present)]",
    bg: "bg-[color:var(--hr-present-soft)]",
    ring: "ring-[color:var(--hr-present)]/15",
  },
  amber: {
    fg: "text-[color:var(--hr-late)]",
    bg: "bg-[color:var(--hr-late-soft)]",
    ring: "ring-[color:var(--hr-late)]/15",
  },
  red: {
    fg: "text-[color:var(--hr-absent)]",
    bg: "bg-[color:var(--hr-absent-soft)]",
    ring: "ring-[color:var(--hr-absent)]/15",
  },
  blue: {
    fg: "text-[color:var(--hr-leave)]",
    bg: "bg-[color:var(--hr-leave-soft)]",
    ring: "ring-[color:var(--hr-leave)]/15",
  },
  slate: {
    fg: "text-[color:var(--hr-text-muted)]",
    bg: "bg-muted",
    ring: "ring-[color:var(--hr-border)]",
  },
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
        "group relative rounded-2xl p-5 ring-1 transition-all duration-200",
        "bg-[color:var(--hr-surface-elevated)] ring-[color:var(--hr-border)]",
        "hover:-translate-y-0.5 hover:shadow-[var(--shadow-hr-elevated)] shadow-[var(--shadow-hr-card)]",
        "overflow-hidden",
      )}
    >
      {/* accent corner glow */}
      <div
        className={cn(
          "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl opacity-60 transition-opacity duration-300 group-hover:opacity-90",
          a.bg,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hr-text-muted)]">
          {label}
        </div>
        {Icon && (
          <div className={cn("rounded-xl p-2 ring-1", a.bg, a.ring)}>
            <Icon className={cn("h-4 w-4", a.fg)} />
          </div>
        )}
      </div>
      <div className="relative mt-4 text-[28px] font-semibold text-[color:var(--hr-text-strong)] tabular-nums leading-none tracking-tight">
        {loading ? (
          <span className="inline-block h-7 w-20 bg-muted rounded animate-pulse" />
        ) : (
          value
        )}
      </div>
      {trend && (
        <div className="relative mt-2.5 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ring-1 ring-inset",
              up
                ? "bg-[color:var(--hr-present-soft)] text-[color:var(--hr-present)] ring-[color:var(--hr-present)]/15"
                : "bg-[color:var(--hr-absent-soft)] text-[color:var(--hr-absent)] ring-[color:var(--hr-absent)]/15",
            )}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend.value)}%
          </span>
          {trend.label && (
            <span className="text-[color:var(--hr-text-muted)]">{trend.label}</span>
          )}
        </div>
      )}
      {hint && !trend && (
        <div className="relative mt-2.5 text-xs text-[color:var(--hr-text-muted)]">{hint}</div>
      )}
    </div>
  );
}