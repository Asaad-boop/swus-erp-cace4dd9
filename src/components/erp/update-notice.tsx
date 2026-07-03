import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * ERP changelog. Add a new entry at the TOP whenever you ship an update.
 * Bump `id` to a fresh string — users who haven't seen it get a highlight.
 */
type UpdateEntry = { id: string; date: string; title: string; details?: string[] };

const UPDATES: UpdateEntry[] = [
  {
    id: "2026-07-03-incomplete-open-edit",
    date: "3 Jul 2026",
    title: "Incomplete orders now open as editable drafts",
    details: [
      "Incomplete checkout theke Open button e click korle draft order (status = new, source = incomplete) tairi hoye Order detail page e chole jabe.",
      "Oikhane customer name, phone, address, items shob edit kore normal Confirm flow use kora jabe.",
      "Auto customer note ar add hobe na.",
    ],
  },
  {
    id: "2026-07-03-marketing-kpi",
    date: "3 Jul 2026",
    title: "Marketing dashboard: Confirmed Revenue & Real ROAS",
    details: [
      "Hero KPI te ekhon Confirmed Revenue ar Real ROAS dekhabe, date range independent.",
    ],
  },
];

const STORAGE_KEY = "erp:last-seen-update";

export function UpdateNotice() {
  const latest = UPDATES[0];
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setLastSeen(localStorage.getItem(STORAGE_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  if (!latest) return null;
  const unseen = lastSeen !== latest.id;

  const markSeen = () => {
    try {
      localStorage.setItem(STORAGE_KEY, latest.id);
    } catch {
      /* ignore */
    }
    setLastSeen(latest.id);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && unseen) markSeen();
      }}
    >
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium border transition-colors",
            unseen
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground",
          )}
          title="What's new"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {unseen ? "Update available" : "What's new"}
          </span>
          {unseen && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background animate-pulse" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">What's new</div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y">
          {UPDATES.map((u, i) => (
            <div key={u.id} className="p-3.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-sm font-semibold leading-tight">{u.title}</div>
                {i === 0 && unseen && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0">
                    New
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mb-1.5">{u.date}</div>
              {u.details && u.details.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  {u.details.map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}