import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing — ERP" }] }),
  component: MarketingLayout,
});

const tabs = [
  { to: "/erp/marketing", label: "Performance", exact: true },
  { to: "/erp/marketing/accounts", label: "Ad Accounts" },
  { to: "/erp/marketing/campaigns", label: "Campaigns" },
  { to: "/erp/marketing/rollup", label: "Profit Rollup" },
  { to: "/erp/marketing/sku-pnl", label: "SKU P&L" },
  { to: "/erp/marketing/expenses", label: "Manual Expenses" },
  { to: "/erp/marketing/attribution", label: "Attribution" },
  { to: "/erp/marketing/sync", label: "Sync Log" },
];

function MarketingLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-4 md:px-6">
        <div className="flex items-end gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to as never}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
