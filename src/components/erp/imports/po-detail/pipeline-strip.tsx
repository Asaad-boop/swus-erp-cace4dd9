import { useMemo } from "react";
import {
  ShoppingCart, Warehouse as WarehouseIcon, Plane, Truck, PackageCheck, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImpCartonStatus, ImpPoStatus } from "@/lib/erp/imports/types";

export const PIPELINE_STAGES: { key: ImpCartonStatus; label: string; icon: any; bg: string; ring: string; text: string }[] = [
  { key: "ordered",            label: "ORDERED",    icon: ShoppingCart,  bg: "bg-blue-500",    ring: "ring-blue-200 dark:ring-blue-900",    text: "text-blue-600" },
  { key: "at_china_warehouse", label: "CHINA WH",   icon: WarehouseIcon, bg: "bg-cyan-500",    ring: "ring-cyan-200 dark:ring-cyan-900",    text: "text-cyan-600" },
  { key: "in_transit",         label: "IN TRANSIT", icon: Plane,         bg: "bg-indigo-500",  ring: "ring-indigo-200 dark:ring-indigo-900","text": "text-indigo-600" } as any,
  { key: "arrived_bd",         label: "ARRIVED BD", icon: Truck,         bg: "bg-orange-500",  ring: "ring-orange-200 dark:ring-orange-900","text": "text-orange-600" } as any,
  { key: "released",           label: "RELEASED",   icon: PackageCheck,  bg: "bg-violet-500",  ring: "ring-violet-200 dark:ring-violet-900","text": "text-violet-600" } as any,
  { key: "in_stock",           label: "IN STOCK",   icon: CheckCircle2,  bg: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-900","text": "text-emerald-600" } as any,
];

export function PipelineStrip({ stages, activeStatus }: { stages: any[]; activeStatus: ImpPoStatus }) {
  const activeIdx = useMemo(() => {
    const map: Partial<Record<ImpPoStatus, number>> = {
      ordered: 0, at_china_warehouse: 1, in_transit: 2, arrived_bd: 3, partially_received: 4, completed: 5,
    };
    return map[activeStatus] ?? 0;
  }, [activeStatus]);

  return (
    <div className="relative">
      <div className="absolute left-8 right-8 top-6 h-0.5 bg-gradient-to-r from-primary/40 via-primary/40 to-primary/40" />
      <div className="grid grid-cols-6 gap-2 relative">
        {stages.map((s, i) => {
          const isActive = i <= activeIdx;
          const isCurrent = i === activeIdx;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex flex-col items-center text-center">
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center border-2 transition-all",
                isActive ? `${s.bg} text-white border-transparent shadow-md` : "bg-background border-border text-muted-foreground",
                isCurrent && `ring-4 ${s.ring}`,
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <div className={cn("mt-2 text-[10px] tracking-wider font-semibold", isActive ? s.text : "text-muted-foreground")}>{s.label}</div>
              <div className={cn("text-base font-bold tabular-nums", isActive ? "" : "text-muted-foreground/60")}>{s.count}</div>
              <div className="text-[10px] text-muted-foreground">{s.pieces} pcs</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}