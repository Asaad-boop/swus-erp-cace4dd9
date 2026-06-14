import { useEffect, useState } from "react";
import { CheckCheck, Printer, Sticker, ClipboardList, FileSpreadsheet, Truck, RefreshCw, Download, Copy, X, Loader2, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { STATUS_GROUPS, statusAccent, statusBadge, type OrderStatus } from "@/lib/erp/orders";

type Props = {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onStatus: (s: OrderStatus) => void;
  onExport: () => void;
  onSendToPathao: () => void;
  onPrint: (mode: "invoice" | "sticker" | "picking" | "sheet") => void;
  isPending: boolean;
};

export function OrdersBulkActions({ selectedCount, totalCount, onSelectAll, onClear, onStatus, onExport, onSendToPathao, onPrint, isPending }: Props) {
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
            <ActionTile icon={Printer} label="Invoice" onClick={() => onPrint("invoice")} disabled={disabled} />
            <ActionTile icon={Sticker} label="Sticker" onClick={() => onPrint("sticker")} disabled={disabled} />
            <ActionTile icon={ClipboardList} label="Picking" onClick={() => onPrint("picking")} disabled={disabled} />
            <ActionTile icon={FileSpreadsheet} label="Sheet" onClick={() => onPrint("sheet")} disabled={disabled} />
          </div>
        </Section>

        <Section label={`Status Update${selectedCount ? ` (${selectedCount} selected)` : ""}`}>
          <div className="grid grid-cols-2 gap-1.5 mb-1.5">
            <ActionTile icon={CheckCheck} label="RTS" onClick={() => onStatus("ready_to_ship")} disabled={disabled} />
            <ActionTile icon={Truck} label="Shipped" onClick={() => onStatus("shipped")} disabled={disabled} />
          </div>
          {STATUS_GROUPS.map((g) => (
            <StatusGroupCollapsible
              key={g.key}
              label={g.label}
              statuses={g.statuses}
              onStatus={onStatus}
              disabled={disabled}
            />
          ))}
          <button
            onClick={() => onStatus("cancelled")}
            disabled={disabled}
            className="w-full flex items-center gap-2.5 px-2 h-9 mt-1 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
            <span className="flex-1 text-left">Cancel Orders</span>
          </button>
        </Section>

        <Section label="Courier Services">
          <ActionRow icon={Truck} label="Send to Pathao" onClick={onSendToPathao} disabled={disabled} />
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

function StatusGroupCollapsible({
  label,
  statuses,
  onStatus,
  disabled,
}: {
  label: string;
  statuses: OrderStatus[];
  onStatus: (s: OrderStatus) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(label === "Fulfillment");
  return (
    <div className="rounded-md border bg-card/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2 h-8 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/60"
      >
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-1 space-y-0.5">
          {statuses.map((s) => {
            const b = statusBadge(s);
            return (
              <button
                key={s}
                onClick={() => onStatus(s)}
                disabled={disabled}
                className="w-full flex items-center gap-2 px-2 h-8 rounded text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: statusAccent(s) }} />
                <span className="flex-1 text-left">{b.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}