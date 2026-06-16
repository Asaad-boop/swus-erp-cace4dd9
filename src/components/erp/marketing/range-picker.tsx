import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function fmtDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function defaultRange(days = 7) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from: fmtDay(from), to: fmtDay(to) };
}

export function RangePicker({
  value,
  onChange,
}: {
  value: { from: string; to: string };
  onChange: (v: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label className="text-[10px] text-muted-foreground">From</Label>
        <Input
          type="date"
          className="h-8 w-[140px]"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-[10px] text-muted-foreground">To</Label>
        <Input
          type="date"
          className="h-8 w-[140px]"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
    </div>
  );
}

export function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "—";
  return `৳${n.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

export function fmtNum(v: any) {
  const n = Number(v ?? 0);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-BD");
}

export function fmtX(v: any) {
  if (v == null) return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  return `${n.toFixed(2)}x`;
}

export function fmtPct(v: any) {
  if (v == null) return "—";
  const n = Number(v);
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}