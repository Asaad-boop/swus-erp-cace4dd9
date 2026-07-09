import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/marketing")({
  head: () => ({ meta: [{ title: "Marketing — ERP" }] }),
  component: MarketingLayout,
});

// 4-hub top navigation. Each hub owns a set of legacy sub-routes accessed
// via contextual sub-tabs — the underlying pages are unchanged (Phase 2
// UI-only consolidation).
type Hub = {
  key: string;
  label: string;
  default: string;
  matches: (path: string) => boolean;
  sub: { to: string; label: string; exact?: boolean }[];
};

const hubs: Hub[] = [
  {
    key: "overview",
    label: "Overview",
    default: "/erp/marketing",
    matches: (p) =>
      p === "/erp/marketing" ||
      p.startsWith("/erp/marketing/expenses") ||
      p.startsWith("/erp/marketing/sync") ||
      p.startsWith("/erp/marketing/meta-reports"),
    sub: [
      { to: "/erp/marketing", label: "Dashboard", exact: true },
      { to: "/erp/marketing/expenses", label: "Manual Expenses" },
      { to: "/erp/marketing/meta-reports", label: "Meta Reports" },
      { to: "/erp/marketing/sync", label: "Sync Log" },
    ],
  },
  {
    key: "spend",
    label: "Ad Spend",
    default: "/erp/finance/dollar-purchase",
    matches: (p) =>
      p.startsWith("/erp/finance/dollar-purchase") ||
      p.startsWith("/erp/marketing/ad-account-funding"),
    sub: [
      { to: "/erp/finance/dollar-purchase", label: "Dollar Purchase" },
      { to: "/erp/marketing/ad-account-funding", label: "Ad Funding Ledger" },
    ],
  },
  {
    key: "campaigns",
    label: "Campaigns",
    default: "/erp/marketing/campaigns",
    matches: (p) =>
      p.startsWith("/erp/marketing/campaigns") ||
      p.startsWith("/erp/marketing/rollup") ||
      p.startsWith("/erp/marketing/sku-pnl") ||
      p.startsWith("/erp/marketing/attribution"),
    sub: [
      { to: "/erp/marketing/campaigns", label: "Campaigns" },
      { to: "/erp/marketing/rollup", label: "Profit Rollup" },
      { to: "/erp/marketing/sku-pnl", label: "SKU P&L" },
      { to: "/erp/marketing/attribution", label: "Unmatched Orders" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    default: "/erp/marketing/accounts",
    matches: (p) => p.startsWith("/erp/marketing/accounts"),
    sub: [{ to: "/erp/marketing/accounts", label: "Ad Accounts & Brand Mapping" }],
  },
];

function MarketingLayout() {
  const { pathname } = useLocation();
  const activeHub = hubs.find((h) => h.matches(pathname)) ?? hubs[0];
  return (
    <div className="flex flex-col h-full bg-[#F8F9FA]">
      <div className="border-b border-gray-100 bg-white px-4 md:px-6 pt-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {hubs.map((h) => {
            const active = h.key === activeHub.key;
            return (
              <Link
                key={h.key}
                to={h.default as never}
                className={cn(
                  "px-4 py-1.5 text-sm font-semibold rounded-full transition-all whitespace-nowrap",
                  active
                    ? "bg-[#1877F2] text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                {h.label}
              </Link>
            );
          })}
        </div>
        {activeHub.sub.length > 1 && (
          <div className="flex items-center gap-4 mt-3 -mb-px overflow-x-auto">
            {activeHub.sub.map((s) => {
              const active = s.exact ? pathname === s.to : pathname.startsWith(s.to);
              return (
                <Link
                  key={s.to}
                  to={s.to as never}
                  className={cn(
                    "pb-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                    active
                      ? "border-[#1877F2] text-[#1877F2]"
                      : "border-transparent text-gray-500 hover:text-gray-800",
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
