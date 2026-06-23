import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-[color:var(--hr-accent-soft)] blur-xl opacity-60" />
        <div className="relative bg-[color:var(--hr-accent-soft)] ring-1 ring-[color:var(--hr-accent)]/15 rounded-2xl p-4">
          <Icon className="h-7 w-7 text-[color:var(--hr-accent)]" />
        </div>
      </div>
      <div className="text-base font-semibold text-[color:var(--hr-text-strong)]">{title}</div>
      {description && (
        <div className="text-sm text-[color:var(--hr-text-muted)] mt-1 max-w-sm">{description}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}