import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ArrowUpDown, ChevronDown } from "lucide-react";
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

export function WebOrdersFilterBar({ state, onChange, onClearAll: _onClearAll }: Props) {
  const [dateOpen, setDateOpen] = useState(false);

  const dateLabel = state.datePreset === "custom"
    ? (state.dateFrom && state.dateTo
        ? `${format(new Date(state.dateFrom), "dd MMM")} → ${format(new Date(state.dateTo), "dd MMM")}`
        : "Custom")
    : PRESETS.find((p) => p.key === state.datePreset)?.label ?? "All Time";

  return (
    <div className="flex items-center gap-2">
      {/* Date */}
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-between gap-2 h-8 min-w-[130px] px-3 rounded-md border border-input bg-background text-xs font-medium hover:bg-muted/60 transition-colors",
              state.datePreset !== "all" && "border-primary/40 text-foreground",
            )}
          >
            <span className="inline-flex items-center gap-1.5 truncate">
              <CalendarIcon className="h-3.5 w-3.5 opacity-70" />
              {dateLabel}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 pointer-events-auto" align="end">
          <div className="flex flex-col gap-0.5 min-w-[140px]">
            {PRESETS.filter((p) => p.key !== "custom").map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  onChange({ datePreset: p.key, dateFrom: null, dateTo: null });
                  setDateOpen(false);
                }}
                className={cn(
                  "text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted transition-colors",
                  state.datePreset === p.key && "bg-primary/10 text-primary font-semibold",
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="border-t my-1" />
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-2 py-1">
              Custom Range
            </div>
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
                  setDateOpen(false);
                }
              }}
              numberOfMonths={1}
              className="pointer-events-auto"
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Source */}
      <Select value={state.source} onValueChange={(v) => onChange({ source: v })}>
        <SelectTrigger className={cn("h-8 w-[150px] text-xs", state.source !== "all" && "border-primary/40")}>
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
        <SelectTrigger className={cn("h-8 w-[170px] text-xs gap-1.5", state.sort !== "newest" && "border-primary/40")}>
          <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <SelectItem key={k} value={k} className="text-xs">{SORT_LABEL[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}