import { cn } from "@/lib/utils";
import { STATUS_TABS, type OrderStatus, type StatusTabKey } from "@/lib/erp/orders";

const TAB_TINT: Record<StatusTabKey, { dot: string; activeBg: string; activeText: string }> = {
  all:            { dot: "bg-foreground/70",    activeBg: "bg-foreground",    activeText: "text-background" },
  pending:        { dot: "bg-blue-500",         activeBg: "bg-blue-500",      activeText: "text-white" },
  packing:        { dot: "bg-purple-500",       activeBg: "bg-purple-500",    activeText: "text-white" },
  rts:            { dot: "bg-cyan-500",         activeBg: "bg-cyan-500",      activeText: "text-white" },
  shipped:        { dot: "bg-amber-500",        activeBg: "bg-amber-500",     activeText: "text-white" },
  delivered:      { dot: "bg-emerald-500",      activeBg: "bg-emerald-500",   activeText: "text-white" },
  partial:        { dot: "bg-emerald-400",      activeBg: "bg-emerald-400",   activeText: "text-white" },
  pending_return: { dot: "bg-orange-500",       activeBg: "bg-orange-500",    activeText: "text-white" },
  returned:       { dot: "bg-red-500",          activeBg: "bg-red-500",       activeText: "text-white" },
  exchange:       { dot: "bg-violet-500",       activeBg: "bg-violet-500",    activeText: "text-white" },
  on_hold:        { dot: "bg-yellow-500",       activeBg: "bg-yellow-500",    activeText: "text-zinc-900" },
  cancelled:      { dot: "bg-zinc-400",         activeBg: "bg-zinc-500",      activeText: "text-white" },
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
      <div className="flex items-center gap-1.5 px-3 py-2.5 min-w-max">
        {STATUS_TABS.map((t) => {
          const c = t.key === "all"
            ? total
            : t.statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
          const isActive = active === t.key;
          const tint = TAB_TINT[t.key];
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.statuses)}
              className={cn(
                "group relative inline-flex items-center gap-2 pl-3 pr-2 h-9 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all border",
                isActive
                  ? `${tint.activeBg} ${tint.activeText} border-transparent shadow-sm`
                  : "bg-card text-muted-foreground border-border/80 hover:text-foreground hover:bg-muted/60",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full transition-transform", isActive ? "bg-current/80" : tint.dot, isActive && "scale-110")} />
              {t.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center h-5 min-w-[22px] px-1.5 rounded-full text-[10px] font-bold tabular-nums",
                  isActive ? "bg-white/25 text-current" : "bg-muted text-foreground/70",
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