import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hr-text-muted)]">
      {children}
    </div>
  );
}