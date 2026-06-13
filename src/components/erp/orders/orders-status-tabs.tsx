import { cn } from "@/lib/utils";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

type Props = {
  active: StatusTabKey;
  counts: Record<string, number>;
  total: number;
  onChange: (statuses: OrderStatus[]) => void;
};

export function OrdersStatusTabs({ active, counts, total, onChange }: Props) {
  return (
    <div className="border-b bg-card rounded-t-xl overflow-x-auto">
      <div className="flex items-end gap-1 px-2 min-w-max">
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
                "relative inline-flex items-center gap-1.5 px-3 h-10 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold tabular-nums",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
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