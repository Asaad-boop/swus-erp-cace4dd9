import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HrSubnav } from "@/components/erp/hr/hr-subnav";

interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  filters?: ReactNode;
  hero?: ReactNode;
  children: ReactNode;
  /** When true, removes the gradient hero band (for dense pages like muster) */
  compact?: boolean;
  /** Max width for the inner container */
  maxWidth?: "default" | "wide" | "full";
}

/**
 * Unified HR page shell. Provides:
 *  - Sticky sub-nav
 *  - Optional gradient hero band with title/subtitle/actions
 *  - Optional filter row beneath the header
 *  - Centered content container
 */
export function HrPageShell({
  title,
  subtitle,
  eyebrow,
  breadcrumbs,
  actions,
  filters,
  hero,
  children,
  compact,
  maxWidth = "default",
}: Props) {
  const widthClass =
    maxWidth === "full" ? "max-w-none" : maxWidth === "wide" ? "max-w-[1800px]" : "max-w-[1600px]";

  return (
    <div className="min-h-screen bg-background">
      <HrSubnav />
      <div
        className={cn(
          "relative",
          !compact &&
            "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-56 before:opacity-90 before:[background:var(--gradient-hr-hero)] before:[mask-image:linear-gradient(to_bottom,black,transparent)]"
        )}
      >
        <div className={cn("relative px-4 md:px-8 pt-6 pb-4 mx-auto", widthClass)}>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="text-[11px] font-medium text-[color:var(--hr-text-muted)] mb-2 flex items-center gap-1.5">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="opacity-50">/</span>}
                  <span className={i === breadcrumbs.length - 1 ? "text-[color:var(--hr-text-strong)]" : ""}>
                    {b.label}
                  </span>
                </span>
              ))}
            </nav>
          )}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              {eyebrow && (
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--hr-accent)] mb-1">
                  {eyebrow}
                </div>
              )}
              <h1 className="text-[26px] md:text-3xl font-semibold tracking-tight text-[color:var(--hr-text-strong)] leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-[color:var(--hr-text-muted)] mt-1.5">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
          {hero && <div className="mt-5">{hero}</div>}
          {filters && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">{filters}</div>
          )}
        </div>
        <div className={cn("relative px-4 md:px-8 pb-10 mx-auto space-y-5 animate-fade-in", widthClass)}>
          {children}
        </div>
      </div>
    </div>
  );
}