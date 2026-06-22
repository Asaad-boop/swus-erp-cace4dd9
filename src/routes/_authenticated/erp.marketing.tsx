import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing — ERP" }] }),
  component: MarketingLayout,
});

const tabs = [
  { to: "/erp/marketing", label: "Overview", exact: true },
  { to: "/erp/marketing/performance", label: "Performance" },
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
    <div className="flex flex-col h-full bg-[#F8F9FA]">
      <div className="border-b border-gray-100 bg-white px-4 md:px-6 py-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to as never}
                className={cn(
                  "px-3.5 py-1.5 text-sm font-medium rounded-full transition-all whitespace-nowrap",
                  active
                    ? "bg-[#1877F2] text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
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
