import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { manualTagColor, type AutoTag } from "@/lib/erp/order-tags";

type Props = {
  autoTags: AutoTag[];
  manualTags?: string[] | null;
  max?: number;
  /** When true, only show icon + label fits compactly */
  compact?: boolean;
};

export function AutoTagChips({ autoTags, manualTags, max = 4, compact = false }: Props) {
  const all = [
    ...autoTags.map((t) => ({ kind: "auto" as const, tag: t })),
    ...((manualTags ?? []).map((t) => ({ kind: "manual" as const, tag: t }))),
  ];
  if (all.length === 0) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }
  const visible = all.slice(0, max);
  const extra = all.length - visible.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-1">
        {visible.map((entry, idx) => {
          if (entry.kind === "auto") {
            const t = entry.tag;
            return (
              <Tooltip key={`a-${t.key}`}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ring-inset cursor-help leading-none",
                      t.chip,
                    )}
                  >
                    <span className="text-[11px] leading-none">{t.icon}</span>
                    {!compact && <span>{t.label}</span>}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[220px]">
                  <div className="font-semibold">{t.label}</div>
                  <div className="text-muted-foreground">{t.reason}</div>
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <span
              key={`m-${entry.tag}-${idx}`}
              className={cn(
                "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md ring-1 ring-inset leading-none",
                manualTagColor(entry.tag),
              )}
            >
              #{entry.tag}
            </span>
          );
        })}
        {extra > 0 && (
          <span className="text-[10px] text-muted-foreground self-center font-medium">+{extra}</span>
        )}
      </div>
    </TooltipProvider>
  );
}