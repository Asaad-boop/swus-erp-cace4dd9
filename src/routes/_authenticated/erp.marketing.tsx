import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing — ERP" }] }),
  component: MarketingLayout,
});

const tabs = [
  { to: "/erp/marketing", label: "Dashboard", exact: true },
  { to: "/erp/marketing/campaigns", label: "Campaigns", exact: false },
  { to: "/erp/marketing/accounts", label: "Ad Accounts", exact: false },
  { to: "/erp/marketing/settings", label: "Settings", exact: false },
];

function MarketingLayout() {
  const location = useLocation();
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-4 md:px-6 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Marketing</h1>
        </div>
        <nav className="flex gap-1 -mb-px">
          {tabs.map((t) => {
            const active = t.exact
              ? location.pathname === t.to || location.pathname === `${t.to}/`
              : location.pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to as never}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}