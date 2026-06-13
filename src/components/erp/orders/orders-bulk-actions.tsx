import { useEffect, useState } from "react";
import { CheckCheck, Printer, Sticker, ClipboardList, FileSpreadsheet, Truck, RefreshCw, Download, Copy, X, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/lib/erp/orders";

type Props = {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onStatus: (s: OrderStatus) => void;
  onExport: () => void;
  isPending: boolean;
};

export function OrdersBulkActions({ selectedCount, totalCount, onSelectAll, onClear, onStatus, onExport, isPending }: Props) {
  const disabled = selectedCount === 0;
  const [open, setOpen] = useState(false);

  // Auto-open when user selects rows; auto-close when selection cleared.
  useEffect(() => {
    if (selectedCount > 0) setOpen(true);
    else setOpen(false);
  }, [selectedCount]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <span className="font-semibold">Actions</span>
          {selectedCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
              {selectedCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
          <span className="text-xs font-semibold">
            {selectedCount > 0 ? `${selectedCount} selected` : "No selection"}
          </span>
          {selectedCount > 0 ? (
            <button onClick={onClear} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" /> Clear
            </button>
          ) : (
            <button onClick={onSelectAll} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" disabled={!totalCount}>
              <CheckCheck className="h-3.5 w-3.5" /> Select All
            </button>
          )}
        </div>

        {isPending && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b bg-muted/20">
            <Loader2 className="h-3 w-3 animate-spin" /> Updating…
          </div>
        )}

        <Section label="Print Options">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionTile icon={Printer} label="Invoice" disabled />
            <ActionTile icon={Sticker} label="Sticker" disabled />
            <ActionTile icon={ClipboardList} label="Picking" disabled />
            <ActionTile icon={FileSpreadsheet} label="Sheet" disabled />
          </div>
        </Section>

        <Section label={`Status Update${selectedCount ? ` (${selectedCount} selected)` : ""}`}>
          <ActionRow icon={CheckCheck} label="Ready to Ship" onClick={() => onStatus("ready_to_ship")} disabled={disabled} />
          <ActionRow icon={Truck} label="Mark Shipped" onClick={() => onStatus("shipped")} disabled={disabled} />
          <ActionRow icon={X} label="Cancel Orders" tone="destructive" onClick={() => onStatus("cancelled")} disabled={disabled} />
        </Section>

        <Section label="Courier Services">
          <ActionRow icon={Truck} label="Send to Pathao" disabled />
          <ActionRow icon={RefreshCw} label="Refresh Status" disabled />
        </Section>

        <Section label="Tools & Export">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionTile icon={Download} label="Excel" onClick={onExport} />
            <ActionTile icon={Copy} label="Duplicates" disabled />
          </div>
        </Section>
      </PopoverContent>
    </Popover>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2 py-2 border-t">
      <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick, disabled, tone }: { icon: React.ElementType; label: string; onClick?: () => void; disabled?: boolean; tone?: "destructive" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-2 h-9 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        tone === "destructive" ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

function ActionTile({ icon: Icon, label, onClick, disabled }: { icon: React.ElementType; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-2.5 h-9 rounded-md border bg-card text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {label}
    </button>
  );
}