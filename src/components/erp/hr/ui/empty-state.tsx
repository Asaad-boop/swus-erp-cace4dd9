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
      <div className="bg-gray-100 rounded-2xl p-4 mb-4">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <div className="text-base font-semibold text-gray-900">{title}</div>
      {description && <div className="text-sm text-gray-500 mt-1 max-w-sm">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}