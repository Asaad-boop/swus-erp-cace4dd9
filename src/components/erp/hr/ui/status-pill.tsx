import { cn } from "@/lib/utils";

export type StatusTone =
  | "present" | "absent" | "late" | "leave" | "holiday"
  | "draft" | "finalized" | "paid" | "pending" | "approved" | "rejected"
  | "active" | "inactive" | "neutral";

const toneMap: Record<StatusTone, string> = {
  present:   "bg-[color:var(--hr-present-soft)] text-[color:var(--hr-present)] ring-[color:var(--hr-present)]/20",
  active:    "bg-[color:var(--hr-present-soft)] text-[color:var(--hr-present)] ring-[color:var(--hr-present)]/20",
  paid:      "bg-[color:var(--hr-present-soft)] text-[color:var(--hr-present)] ring-[color:var(--hr-present)]/20",
  approved:  "bg-[color:var(--hr-present-soft)] text-[color:var(--hr-present)] ring-[color:var(--hr-present)]/20",
  absent:    "bg-[color:var(--hr-absent-soft)]  text-[color:var(--hr-absent)]  ring-[color:var(--hr-absent)]/20",
  rejected:  "bg-[color:var(--hr-absent-soft)]  text-[color:var(--hr-absent)]  ring-[color:var(--hr-absent)]/20",
  late:      "bg-[color:var(--hr-late-soft)]    text-[color:var(--hr-late)]    ring-[color:var(--hr-late)]/20",
  pending:   "bg-[color:var(--hr-late-soft)]    text-[color:var(--hr-late)]    ring-[color:var(--hr-late)]/20",
  leave:     "bg-[color:var(--hr-leave-soft)]   text-[color:var(--hr-leave)]   ring-[color:var(--hr-leave)]/20",
  holiday:   "bg-[color:var(--hr-holiday-soft)] text-[color:var(--hr-holiday)] ring-[color:var(--hr-holiday)]/20",
  finalized: "bg-[color:var(--hr-accent-soft)]  text-[color:var(--hr-accent)]  ring-[color:var(--hr-accent)]/20",
  inactive:  "bg-muted text-muted-foreground ring-[color:var(--hr-border)]",
  draft:     "bg-muted text-muted-foreground ring-[color:var(--hr-border)]",
  neutral:   "bg-muted text-muted-foreground ring-[color:var(--hr-border)]",
};

interface Props {
  tone: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function StatusPill({ tone, children, dot, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneMap[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}