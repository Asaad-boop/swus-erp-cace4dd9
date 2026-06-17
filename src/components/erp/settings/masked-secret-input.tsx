import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Masked input for API keys, secrets, tokens.
 * - Non-admin users see "Admin only" lock placeholder; cannot read/edit.
 * - Admin users see password input + show/hide toggle.
 */
export function MaskedSecretInput({
  value,
  onChange,
  isAdmin,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  isAdmin: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);

  if (!isAdmin) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" /> Hidden — admin only
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10 font-mono text-xs"
        autoComplete="off"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
