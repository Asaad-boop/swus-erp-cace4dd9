import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  total: number;
  amount: number;
  onChange: (amount: number) => void;
  label?: string;
  chips?: number[];
  className?: string;
  disabled?: boolean;
};

export function AmountPercentInput({ total, amount, onChange, label = "Amount (BDT)", chips = [30, 50, 70, 100], className, disabled }: Props) {
  const [pctStr, setPctStr] = useState<string>(total > 0 ? ((amount / total) * 100).toFixed(2).replace(/\.?0+$/, "") : "0");
  const editing = useRef<"amount" | "pct" | null>(null);

  // when external amount changes (or total), sync pct unless user is typing pct
  useEffect(() => {
    if (editing.current === "pct") return;
    const p = total > 0 ? (amount / total) * 100 : 0;
    setPctStr(p ? p.toFixed(2).replace(/\.?0+$/, "") : "0");
  }, [amount, total]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label className="text-xs">{label}</Label>}
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <Input
          type="number"
          step="0.01"
          min={0}
          disabled={disabled}
          value={amount || ""}
          placeholder="0"
          onFocus={() => (editing.current = "amount")}
          onBlur={() => (editing.current = null)}
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            onChange(v);
          }}
        />
        <div className="relative">
          <Input
            type="number"
            step="0.01"
            min={0}
            max={100}
            disabled={disabled || total <= 0}
            value={pctStr}
            onFocus={() => (editing.current = "pct")}
            onBlur={() => (editing.current = null)}
            onChange={(e) => {
              const raw = e.target.value;
              setPctStr(raw);
              const p = Number(raw) || 0;
              onChange(Number(((p / 100) * total).toFixed(2)));
            }}
            className="pr-7"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
        </div>
      </div>
      {total > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-6 px-2 text-[11px]"
              onClick={() => onChange(Number(((c / 100) * total).toFixed(2)))}
            >
              {c}%
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={() => onChange(0)}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}