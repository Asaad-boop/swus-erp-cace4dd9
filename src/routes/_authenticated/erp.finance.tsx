import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, BookOpen, FileText, BarChart3, Settings, Wallet, Receipt, Target, Percent, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/finance")({
  head: () => ({ meta: [{ title: "Finance — ERP" }] }),
  component: FinanceLayout,
});

const NAV = [
  { to: "/erp/finance", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/erp/finance/accounts", label: "Chart of Accounts", icon: BookOpen },
  { to: "/erp/finance/wallets", label: "Wallets", icon: Wallet },
  { to: "/erp/finance/journal", label: "Journal", icon: FileText },
  { to: "/erp/finance/receivables", label: "AR / AP", icon: Receipt },
  { to: "/erp/finance/budgets", label: "Budgets", icon: Target },
  { to: "/erp/finance/taxes", label: "Taxes", icon: Percent },
  { to: "/erp/finance/product-profitability", label: "Profitability", icon: PackageSearch },
  { to: "/erp/finance/reports", label: "Reports", icon: BarChart3 },
  { to: "/erp/finance/settings", label: "Settings", icon: Settings },
];

function FinanceLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex flex-col h-full">
      <nav className="border-b bg-card sticky top-0 z-10">
        <div className="flex gap-1 px-2 md:px-4 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}