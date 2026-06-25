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
  // De-dupe auto tags by key and manual tags by lowercased value to avoid
  // duplicate chips when the same tag arrives from multiple sources.
  const seenAuto = new Set<string>();
  const dedupAuto = autoTags.filter((t) => {
    if (seenAuto.has(t.key)) return false;
    seenAuto.add(t.key);
    return true;
  });
  const seenManual = new Set<string>();
  const dedupManual = (manualTags ?? []).filter((t) => {
    const k = (t ?? "").trim().toLowerCase();
    if (!k || seenManual.has(k)) return false;
    seenManual.add(k);
    return true;
  });
  const all = [
    ...dedupAuto.map((t) => ({ kind: "auto" as const, tag: t })),
    ...dedupManual.map((t) => ({ kind: "manual" as const, tag: t })),
  ];
  if (all.length === 0) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }
  const visible = all.slice(0, max);
  const extra = all.length - visible.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5")}>
        {visible.map((entry, idx) => {
          if (entry.kind === "auto") {
            const t = entry.tag;
            return (
              <Tooltip key={`a-${t.key}`}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-flex items-center cursor-help leading-none transition-all hover:scale-110",
                      compact
                        ? "h-[18px] w-[18px] justify-center rounded-full text-[10px] ring-1 ring-inset shadow-sm"
                        : "gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                      t.chip,
                    )}
                  >
                    <span className="leading-none">{t.icon}</span>
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
            <Tooltip key={`m-${entry.tag}-${idx}`}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full leading-none font-medium cursor-help transition-colors",
                    compact
                      ? "h-[18px] px-1.5 text-[9.5px] tracking-wide uppercase max-w-[64px] truncate bg-muted/60 text-muted-foreground hover:bg-muted ring-1 ring-inset ring-border/50"
                      : "text-[10px] px-2 py-0.5 ring-1 ring-inset",
                    compact ? "" : manualTagColor(entry.tag),
                  )}
                >
                  {compact ? entry.tag.slice(0, 6) : `#${entry.tag}`}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                #{entry.tag}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {extra > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-muted/60 text-[9.5px] text-muted-foreground font-semibold cursor-help ring-1 ring-inset ring-border/50">
                +{extra}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[220px]">
              <div className="flex flex-col gap-0.5">
                {all.slice(max).map((e, i) =>
                  e.kind === "auto" ? (
                    <div key={`o-a-${i}`}>{e.tag.icon} {e.tag.label}</div>
                  ) : (
                    <div key={`o-m-${i}`}>#{e.tag}</div>
                  ),
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}