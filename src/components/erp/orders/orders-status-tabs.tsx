import { cn } from "@/lib/utils";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

const TAB_DOT: Record<StatusTabKey, string> = {
  all:            "bg-foreground/60",
  pending:        "bg-blue-500",
  packing:        "bg-purple-500",
  rts:            "bg-cyan-500",
  shipped:        "bg-amber-500",
  delivered:      "bg-emerald-500",
  partial:        "bg-emerald-400",
  paid:           "bg-teal-500",
  pending_return: "bg-orange-500",
  returned:       "bg-red-500",
  exchange:       "bg-violet-500",
  on_hold:        "bg-yellow-500",
  cancelled:      "bg-zinc-400",
};

type Props = {
  active: StatusTabKey;
  counts: Record<string, number>;
  total: number;
  onChange: (statuses: OrderStatus[]) => void;
};

export function OrdersStatusTabs({ active, counts, total, onChange }: Props) {
  return (
    <div className="border-b bg-gradient-to-b from-muted/30 to-card overflow-x-auto">
      <div className="flex items-stretch gap-0.5 px-2 min-w-max">
        {STATUS_TABS.map((t) => {
          const c = t.key === "all"
            ? total
            : t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.statuses)}
              className={cn(
                "group relative inline-flex items-center gap-2 px-3 h-11 text-[13px] font-medium whitespace-nowrap transition-all",
                "after:absolute after:left-3 after:right-3 after:bottom-[-1px] after:h-[2px] after:rounded-full after:transition-all",
                isActive
                  ? "text-foreground after:bg-foreground"
                  : "text-muted-foreground hover:text-foreground after:bg-transparent",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full ring-2 ring-background", TAB_DOT[t.key], isActive ? "" : "opacity-70")} />
              <span>{t.label}</span>
              <span
                className={cn(
                  "inline-flex items-center justify-center h-[18px] min-w-[22px] px-1.5 rounded-md text-[10px] font-semibold tabular-nums transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground group-hover:bg-foreground/10 group-hover:text-foreground",
                )}
              >
                {c.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}