import { useEffect, useRef } from "react";
import { Camera, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ScanMode = "pack" | "ready" | "ship";

const MODES: { key: ScanMode; label: string; emoji: string }[] = [
  { key: "pack", label: "PACK", emoji: "📦" },
  { key: "ready", label: "READY", emoji: "✅" },
  { key: "ship", label: "SHIP", emoji: "🚚" },
];

export function ScanInput({
  mode,
  onModeChange,
  onScan,
  onOpenCamera,
  busy,
}: {
  mode: ScanMode;
  onModeChange: (m: ScanMode) => void;
  onScan: (value: string) => void;
  onOpenCamera: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Keep input focused
  useEffect(() => {
    const refocus = () => ref.current?.focus();
    refocus();
    const id = window.setInterval(() => {
      if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        refocus();
      }
    }, 800);
    return () => window.clearInterval(id);
  }, []);

  const submit = () => {
    const v = ref.current?.value.trim();
    if (!v) return;
    onScan(v);
    if (ref.current) ref.current.value = "";
  };

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-white shadow-sm p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onOpenCamera} className="gap-1">
          <Camera className="h-4 w-4" /> Camera
        </Button>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border">
          <ScanLine className="h-5 w-5 text-indigo-600" />
          <input
            ref={ref}
            type="text"
            placeholder="Scan or type order #... press Enter"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="flex-1 bg-transparent outline-none text-base font-mono placeholder:text-slate-400"
            autoFocus
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 mr-1">Mode:</span>
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onModeChange(m.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition",
              mode === m.key
                ? "bg-indigo-600 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {m.emoji} {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}