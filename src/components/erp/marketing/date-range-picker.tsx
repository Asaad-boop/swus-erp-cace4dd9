import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Check } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MktRangeValue = {
  from: string; // YYYY-MM-DD
  to: string;
  presetKey: string; // "today" | "yesterday" | "7d" | "14d" | "30d" | "this_month" | "last_month" | "90d" | "lifetime" | "custom"
  label: string;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function buildPreset(key: string): MktRangeValue {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (key) {
    case "today":
      return { presetKey: key, label: "Today", from: ymd(today), to: ymd(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { presetKey: key, label: "Yesterday", from: ymd(y), to: ymd(y) };
    }
    case "7d":
      return { presetKey: key, label: "Last 7 days", from: ymd(addDays(today, -6)), to: ymd(today) };
    case "14d":
      return { presetKey: key, label: "Last 14 days", from: ymd(addDays(today, -13)), to: ymd(today) };
    case "30d":
      return { presetKey: key, label: "Last 30 days", from: ymd(addDays(today, -29)), to: ymd(today) };
    case "90d":
      return { presetKey: key, label: "Last 90 days", from: ymd(addDays(today, -89)), to: ymd(today) };
    case "this_month":
      return { presetKey: key, label: "This month", from: ymd(startOfMonth(today)), to: ymd(today) };
    case "last_month": {
      const s = startOfMonth(addDays(startOfMonth(today), -1));
      const e = endOfMonth(s);
      return { presetKey: key, label: "Last month", from: ymd(s), to: ymd(e) };
    }
    case "lifetime":
      return { presetKey: key, label: "Lifetime", from: "2020-01-01", to: ymd(today) };
    default:
      return { presetKey: "7d", label: "Last 7 days", from: ymd(addDays(today, -6)), to: ymd(today) };
  }
}

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
  { key: "lifetime", label: "Lifetime" },
];

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function fmtTrigger(v: MktRangeValue) {
  if (v.presetKey !== "custom") return v.label;
  const from = parseYmd(v.from);
  const to = parseYmd(v.to);
  if (v.from === v.to) return format(from, "MMM d, yyyy");
  if (from.getFullYear() === to.getFullYear())
    return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
  return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: {
  value: MktRangeValue;
  onChange: (v: MktRangeValue) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>({
    from: parseYmd(value.from),
    to: parseYmd(value.to),
  });

  React.useEffect(() => {
    setDraft({ from: parseYmd(value.from), to: parseYmd(value.to) });
  }, [value.from, value.to]);

  const sub =
    value.presetKey === "custom" || value.presetKey === "lifetime"
      ? null
      : (() => {
          const from = parseYmd(value.from);
          const to = parseYmd(value.to);
          if (value.from === value.to) return format(from, "MMM d, yyyy");
          return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
        })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-9 gap-2 font-normal", className)}>
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{fmtTrigger(value)}</span>
          {sub && <span className="text-xs text-muted-foreground hidden md:inline">· {sub}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 pointer-events-auto"
        align="end"
        sideOffset={6}
      >
        <div className="flex flex-col sm:flex-row">
          {/* Presets */}
          <div className="flex sm:flex-col gap-1 p-2 sm:border-r border-b sm:border-b-0 bg-muted/30 sm:w-44 overflow-x-auto">
            {PRESETS.map((p) => {
              const active = value.presetKey === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => {
                    const v = buildPreset(p.key);
                    onChange(v);
                    setDraft({ from: parseYmd(v.from), to: parseYmd(v.to) });
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm text-left transition-colors whitespace-nowrap",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span>{p.label}</span>
                  {active && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>

          {/* Calendar */}
          <div className="p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={(r) => setDraft(r)}
              defaultMonth={draft?.from ?? new Date()}
              className="pointer-events-auto"
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {draft?.from
                  ? draft?.to
                    ? `${format(draft.from, "MMM d, yyyy")} – ${format(draft.to, "MMM d, yyyy")}`
                    : `${format(draft.from, "MMM d, yyyy")} – …`
                  : "Select a start date"}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft({ from: parseYmd(value.from), to: parseYmd(value.to) });
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!draft?.from || !draft?.to}
                  onClick={() => {
                    if (!draft?.from || !draft?.to) return;
                    onChange({
                      presetKey: "custom",
                      label: "Custom",
                      from: ymd(draft.from),
                      to: ymd(draft.to),
                    });
                    setOpen(false);
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}