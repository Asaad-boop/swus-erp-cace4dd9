import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ─────────────────── Decision badge ─────────────────── */

export type DecisionKey = "scale" | "monitor" | "optimize" | "kill" | "insufficient";

const DECISION_STYLES: Record<DecisionKey, { cls: string; label: string; icon: string }> = {
  scale:        { cls: "bg-emerald-50 text-emerald-700 border-emerald-200",  label: "Scale Up",   icon: "🚀" },
  monitor:      { cls: "bg-amber-50 text-amber-700 border-amber-200",        label: "Monitor",    icon: "👀" },
  optimize:     { cls: "bg-purple-50 text-purple-700 border-purple-200",     label: "Optimize",   icon: "⚙️" },
  kill:         { cls: "bg-red-50 text-red-600 border-red-200",              label: "Kill",       icon: "💀" },
  insufficient: { cls: "bg-slate-50 text-slate-600 border-slate-200",        label: "No data",    icon: "•"  },
};

export function MktDecisionBadge({
  decision,
  showIcon = true,
  className,
}: {
  decision: DecisionKey;
  showIcon?: boolean;
  className?: string;
}) {
  const s = DECISION_STYLES[decision];
  return (
    <Badge variant="outline" className={cn("border font-medium gap-1", s.cls, className)}>
      {showIcon && <span aria-hidden>{s.icon}</span>}
      {s.label}
    </Badge>
  );
}

/* ─────────────────── Status badge ─────────────────── */

export function MktStatusBadge({ status, className }: { status: string | null; className?: string }) {
  const v = (status ?? "").toUpperCase();
  const isActive = v === "ACTIVE";
  const isPaused = v === "PAUSED";
  const dot = isActive ? "bg-emerald-500" : isPaused ? "bg-amber-500" : "bg-zinc-400";
  const cls = isActive
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isPaused
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-zinc-50 text-zinc-600 border-zinc-200";
  return (
    <Badge variant="outline" className={cn("border font-medium gap-1.5", cls, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot, isActive && "animate-pulse")} />
      {status ?? "—"}
    </Badge>
  );
}

/* ─────────────────── Budget badge ─────────────────── */

export function MktBudgetBadge({ status }: { status: "ok" | "warn" | "over" }) {
  if (status === "over")
    return (
      <Badge variant="outline" className="border bg-red-50 text-red-600 border-red-200 font-medium animate-pulse">
        🔴 Over Budget
      </Badge>
    );
  if (status === "warn")
    return (
      <Badge variant="outline" className="border bg-amber-50 text-amber-700 border-amber-200 font-medium">
        🟡 Near Limit
      </Badge>
    );
  return (
    <Badge variant="outline" className="border bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
      🟢 On Track
    </Badge>
  );
}

/* ─────────────────── Subtype (expense) badge ─────────────────── */

const SUBTYPE_STYLES: Record<string, { cls: string; label: string }> = {
  influencer:   { cls: "bg-purple-50 text-purple-700 border-purple-200",  label: "Influencer" },
  content:      { cls: "bg-blue-50 text-blue-700 border-blue-200",        label: "UGC / Content" },
  photoshoot:   { cls: "bg-pink-50 text-pink-700 border-pink-200",        label: "Photoshoot" },
  agency:       { cls: "bg-amber-50 text-amber-700 border-amber-200",     label: "Agency" },
  boost:        { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Boosted Post" },
  print_design: { cls: "bg-orange-50 text-orange-700 border-orange-200",  label: "Print / Design" },
  event:        { cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", label: "Event" },
  sms_email:    { cls: "bg-cyan-50 text-cyan-700 border-cyan-200",        label: "SMS / Email" },
  other:        { cls: "bg-slate-50 text-slate-600 border-slate-200",     label: "Other" },
};

export function MktSubtypeBadge({ subtype }: { subtype: string }) {
  const s = SUBTYPE_STYLES[subtype] ?? { cls: "bg-slate-50 text-slate-600 border-slate-200", label: subtype };
  return (
    <Badge variant="outline" className={cn("border font-medium", s.cls)}>
      {s.label}
    </Badge>
  );
}

/* ─────────────────── Chip (product/campaign link) ─────────────────── */

export function MktChip({
  tone = "indigo",
  children,
}: {
  tone?: "indigo" | "blue" | "muted";
  children: ReactNode;
}) {
  const cls =
    tone === "indigo"
      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
      : tone === "blue"
        ? "bg-[#1877F2]/8 text-[#1877F2] border-[#1877F2]/20"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}