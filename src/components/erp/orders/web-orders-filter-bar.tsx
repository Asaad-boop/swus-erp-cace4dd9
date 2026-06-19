import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X, ArrowUpDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";
export type SortKey = "newest" | "oldest" | "highest" | "lowest" | "recent_note";

const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest First",
  oldest: "Oldest First",
  highest: "Highest Value",
  lowest: "Lowest Value",
  recent_note: "Most Recent Note",
};

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Sources" },
  { value: "facebook", label: "📘 Facebook" },
  { value: "instagram", label: "📷 Instagram" },
  { value: "google", label: "🔍 Google" },
  { value: "direct", label: "🔗 Direct" },
  { value: "other", label: "🌐 Other" },
];

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "custom", label: "Custom" },
];

export type FilterState = {
  datePreset: DatePreset;
  dateFrom: string | null;
  dateTo: string | null;
  source: string;
  sort: SortKey;
};

export function computeDateRange(preset: DatePreset, customFrom: string | null, customTo: string | null) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  switch (preset) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "7d": {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return { from: startOfDay(s), to: endOfDay(now) };
    }
    case "30d": {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      return { from: startOfDay(s), to: endOfDay(now) };
    }
    case "custom": return { from: customFrom, to: customTo };
    default: return { from: null, to: null };
  }
}

type Props = {
  state: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  onClearAll: () => void;
};

export function WebOrdersFilterBar({ state, onChange, onClearAll }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const activeCount =
    (state.datePreset !== "all" ? 1 : 0) +
    (state.source !== "all" ? 1 : 0) +
    (state.sort !== "newest" ? 1 : 0);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (state.datePreset !== "all") {
    const label = state.datePreset === "custom"
      ? `${state.dateFrom ? format(new Date(state.dateFrom), "dd MMM") : "…"} → ${state.dateTo ? format(new Date(state.dateTo), "dd MMM") : "…"}`
      : PRESETS.find((p) => p.key === state.datePreset)?.label ?? "Date";
    chips.push({
      key: "date",
      label: `📅 ${label}`,
      onRemove: () => onChange({ datePreset: "all", dateFrom: null, dateTo: null }),
    });
  }
  if (state.source !== "all") {
    chips.push({
      key: "source",
      label: SOURCE_OPTIONS.find((s) => s.value === state.source)?.label ?? state.source,
      onRemove: () => onChange({ source: "all" }),
    });
  }
  if (state.sort !== "newest") {
    chips.push({
      key: "sort",
      label: `↕ ${SORT_LABEL[state.sort]}`,
      onRemove: () => onChange({ sort: "newest" }),
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 backdrop-blur px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-semibold uppercase tracking-wider text-[10px]">Filters</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[9px] ml-1">{activeCount}</Badge>
          )}
        </div>

        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1">
          {PRESETS.map((p) => {
            const active = state.datePreset === p.key;
            if (p.key === "custom") {
              return (
                <Popover key={p.key} open={customOpen} onOpenChange={setCustomOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <CalendarIcon className="h-3 w-3" />
                      {active && state.dateFrom && state.dateTo
                        ? `${format(new Date(state.dateFrom), "dd MMM")} → ${format(new Date(state.dateTo), "dd MMM")}`
                        : "Custom"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3 pointer-events-auto" align="start">
                    <Calendar
                      mode="range"
                      selected={{
                        from: state.dateFrom ? new Date(state.dateFrom) : undefined,
                        to: state.dateTo ? new Date(state.dateTo) : undefined,
                      }}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          const from = new Date(range.from); from.setHours(0, 0, 0, 0);
                          const to = new Date(range.to); to.setHours(23, 59, 59, 999);
                          onChange({ datePreset: "custom", dateFrom: from.toISOString(), dateTo: to.toISOString() });
                          setCustomOpen(false);
                        }
                      }}
                      numberOfMonths={2}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              );
            }
            return (
              <button
                key={p.key}
                onClick={() => onChange({ datePreset: p.key, dateFrom: null, dateTo: null })}
                className={cn(
                  "h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Source */}
        <Select value={state.source} onValueChange={(v) => onChange({ source: v })}>
          <SelectTrigger className="h-7 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={state.sort} onValueChange={(v) => onChange({ sort: v as SortKey })}>
          <SelectTrigger className="h-7 w-[170px] text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">{SORT_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors"
            >
              {c.label}
              <X className="h-3 w-3 opacity-70" />
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={onClearAll}
          >
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
}