import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/reconciliation")({
  head: () => ({ meta: [{ title: "Reconciliation — ERP" }] }),
  component: ReconciliationLayout,
});

const tabs = [
  { to: "/erp/reconciliation", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/erp/reconciliation/invoice", label: "Invoice Upload", icon: FileSpreadsheet, exact: false },
] as const;

function ReconciliationLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-4 md:px-6">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to as never}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}