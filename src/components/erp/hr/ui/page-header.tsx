import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}

/**
 * Compact page header for HR pages that don't use HrPageShell.
 * For new pages prefer HrPageShell which embeds this layout with the hero band.
 */
export function PageHeader({ title, subtitle, actions, eyebrow }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hr-accent)] mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--hr-text-strong)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-[color:var(--hr-text-muted)] mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}