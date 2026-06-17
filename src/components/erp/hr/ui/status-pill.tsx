import { cn } from "@/lib/utils";

export type StatusTone =
  | "present" | "absent" | "late" | "leave" | "holiday"
  | "draft" | "finalized" | "paid" | "pending" | "approved" | "rejected"
  | "active" | "inactive" | "neutral";

const toneMap: Record<StatusTone, string> = {
  present: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  absent: "bg-red-50 text-red-600 ring-red-100",
  rejected: "bg-red-50 text-red-600 ring-red-100",
  inactive: "bg-gray-100 text-gray-600 ring-gray-200",
  late: "bg-amber-50 text-amber-700 ring-amber-100",
  pending: "bg-amber-50 text-amber-700 ring-amber-100",
  leave: "bg-blue-50 text-blue-700 ring-blue-100",
  holiday: "bg-violet-50 text-violet-700 ring-violet-100",
  draft: "bg-gray-100 text-gray-600 ring-gray-200",
  finalized: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  neutral: "bg-gray-100 text-gray-600 ring-gray-200",
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