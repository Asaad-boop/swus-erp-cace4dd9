import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";

export type ScanInputHandle = { focus: () => void; clear: () => void };

type Props = {
  onScan: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export const ScanInput = forwardRef<ScanInputHandle, Props>(function ScanInput(
  { onScan, placeholder, disabled },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRef = useRef<string>("");

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => setValue(""),
  }));

  function submit() {
    const v = value.trim();
    if (!v) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    lastSubmittedRef.current = v;
    onScan(v);
    setValue("");
    inputRef.current?.focus();
  }

  // Auto-submit when a complete-looking invoice id is present (scanner paste or fast typing).
  useEffect(() => {
    const v = value.trim();
    if (!v || v === lastSubmittedRef.current) return;
    const looksComplete = /^[A-Z]{2,5}-?\d{4,}$/i.test(v) || /^\d{6,}$/.test(v);
    if (!looksComplete) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim() === v) submit();
    }, 80);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      setValue("");
    }
  }

  return (
    <div className="flex gap-2 items-center w-full">
      <div className="relative flex-1">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder ?? "Scan or type invoice number…"}
          disabled={disabled}
          className="pl-10 h-14 text-lg font-mono"
          autoFocus
        />
      </div>
      <Button size="lg" onClick={submit} disabled={disabled || !value.trim()}>
        Submit
      </Button>
    </div>
  );
});