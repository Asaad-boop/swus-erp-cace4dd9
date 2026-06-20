import { cn } from "@/lib/utils";

const TONES: Record<string, { cls: string; label: string; pulse?: boolean }> = {
  initiated: { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30", label: "Initiated" },
  in_transit: { cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30", label: "In Transit", pulse: true },
  return_in_transit: { cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30", label: "Return In Transit", pulse: true },
  received: { cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30", label: "Received" },
  return_received: { cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30", label: "Return Received" },
  qc_done: { cls: "bg-purple-500/10 text-purple-700 dark:text-purple-300 ring-purple-500/30", label: "QC Done" },
  restocked: { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", label: "Restocked" },
  closed: { cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-slate-500/30", label: "Closed" },
  completed: { cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", label: "Completed" },
  new_order_created: { cls: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/30", label: "New Order Created" },
};

export function ReturnStatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "initiated").toLowerCase();
  const tone = TONES[s] ?? { cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30", label: s.replace(/_/g, " ") };
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
      tone.cls,
    )}>
      {tone.pulse && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {tone.label}
    </span>
  );
}