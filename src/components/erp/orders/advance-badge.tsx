import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  advance: number | null | undefined;
  total?: number | null;
  /** Only show the badge once the advance is confirmed-received (has txn id). */
  txnId?: string | null;
  className?: string;
  /** Compact = just a small chip; full = chip + tiny "due" line. */
  variant?: "compact" | "full";
};

/** Shows an "Advance ৳X" chip and (in full mode) the remaining due. Hidden when no advance. */
export function AdvanceBadge({ advance, total, txnId, className, variant = "compact" }: Props) {
  const amt = Number(advance ?? 0);
  if (!amt || amt <= 0) return null;
  // Advance recorded on the order but not yet posted to accounts → don't show as paid/due.
  if (!txnId) return null;
  const due = Math.max(0, Number(total ?? 0) - amt);
  const fullyPaid = total != null && amt >= Number(total);
  return (
    <div className={cn("inline-flex flex-col items-end gap-0.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset whitespace-nowrap",
          fullyPaid
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ring-emerald-500/30"
            : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 ring-purple-500/30",
        )}
        title={fullyPaid ? "Fully prepaid" : `Advance paid ৳${amt.toLocaleString()}`}
      >
        <Wallet className="h-3 w-3" />
        {fullyPaid ? "Paid" : `Adv ৳${amt.toLocaleString()}`}
      </span>
      {variant === "full" && !fullyPaid && total != null && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Due ৳{due.toLocaleString()}
        </span>
      )}
    </div>
  );
}