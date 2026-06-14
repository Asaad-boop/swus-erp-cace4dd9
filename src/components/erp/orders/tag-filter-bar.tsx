import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { AutoTagKey, AutoTag } from "@/lib/erp/order-tags";

export type TagFilterOption = {
  key: AutoTagKey;
  label: string;
  icon: string;
  chip: string;
  count: number;
};

type Props = {
  options: TagFilterOption[];
  selected: Set<AutoTagKey>;
  onToggle: (k: AutoTagKey) => void;
  onClear: () => void;
};

export function TagFilterBar({ options, selected, onToggle, onClear }: Props) {
  // Only show options with at least 1 match
  const visible = options.filter((o) => o.count > 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-2 px-1">
      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mr-1">
        Filter by tag
      </span>
      {visible.map((o) => {
        const active = selected.has(o.key);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onToggle(o.key)}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ring-1 ring-inset transition-all",
              active
                ? cn(o.chip, "shadow-sm scale-105")
                : "bg-muted/40 text-muted-foreground ring-border hover:bg-muted",
            )}
          >
            <span className="text-[12px] leading-none">{o.icon}</span>
            <span>{o.label}</span>
            <span
              className={cn(
                "tabular-nums text-[10px] rounded-full px-1 min-w-[16px] text-center",
                active ? "bg-background/60" : "bg-background/80",
              )}
            >
              {o.count}
            </span>
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}

/** Build filter options with counts from a list of per-row tag arrays. */
export function buildFilterOptions(rowTags: AutoTag[][]): TagFilterOption[] {
  const acc = new Map<AutoTagKey, TagFilterOption>();
  for (const tags of rowTags) {
    for (const t of tags) {
      const existing = acc.get(t.key);
      if (existing) {
        existing.count++;
      } else {
        acc.set(t.key, {
          key: t.key,
          label: t.label,
          icon: t.icon,
          chip: t.chip,
          count: 1,
        });
      }
    }
  }
  // Sort by the natural tag priority (using first row's order is unreliable);
  // instead, sort by count desc then label.
  return Array.from(acc.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}