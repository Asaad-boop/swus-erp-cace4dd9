import { ArrowUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DateRangePicker, buildPreset, type MktRangeValue } from "@/components/erp/marketing/date-range-picker";

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
  const mktValue: MktRangeValue = (() => {
    if (state.datePreset === "all") return { presetKey: "lifetime", label: "All Time", from: "2020-01-01", to: new Date().toISOString().slice(0, 10) };
    if (state.datePreset === "custom") {
      const from = state.dateFrom ? new Date(state.dateFrom).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const to = state.dateTo ? new Date(state.dateTo).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      return { presetKey: "custom", label: "Custom", from, to };
    }
    const key = state.datePreset === "yesterday" ? "yesterday" : state.datePreset === "today" ? "today" : state.datePreset === "7d" ? "7d" : "30d";
    return buildPreset(key);
  })();

  return (
    <div className="flex items-center gap-2">
      <DateRangePicker
        className={cn("h-8", state.datePreset !== "all" && "border-primary/40")}
        value={mktValue}
        onChange={(v) => {
          if (v.presetKey === "lifetime") {
            onChange({ datePreset: "all", dateFrom: null, dateTo: null });
            return;
          }
          const [fy, fm, fd] = v.from.split("-").map(Number);
          const [ty, tm, td] = v.to.split("-").map(Number);
          const fromIso = new Date(fy, (fm ?? 1) - 1, fd ?? 1, 0, 0, 0, 0).toISOString();
          const toIso = new Date(ty, (tm ?? 1) - 1, td ?? 1, 23, 59, 59, 999).toISOString();
          onChange({ datePreset: "custom", dateFrom: fromIso, dateTo: toIso });
        }}
      />

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