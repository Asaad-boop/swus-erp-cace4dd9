import { Link, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Megaphone,
  Package,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Section = {
  key: string;
  label: string;
  icon: LucideIcon;
  to: string;
  matches: (p: string) => boolean;
  sub?: { to: string; label: string; exact?: boolean }[];
};

export const MARKETING_SECTIONS: Section[] = [
  {
    key: "pulse",
    label: "Pulse",
    icon: Activity,
    to: "/erp/marketing",
    matches: (p) => p === "/erp/marketing",
  },
  {
    key: "campaigns",
    label: "Campaigns",
    icon: Megaphone,
    to: "/erp/marketing/campaigns",
    matches: (p) =>
      p.startsWith("/erp/marketing/campaigns") ||
      p.startsWith("/erp/marketing/rollup") ||
      p.startsWith("/erp/marketing/attribution"),
    sub: [
      { to: "/erp/marketing/campaigns", label: "All campaigns" },
      { to: "/erp/marketing/rollup", label: "Profit rollup" },
      { to: "/erp/marketing/attribution", label: "Unmatched orders" },
    ],
  },
  {
    key: "products",
    label: "Products",
    icon: Package,
    to: "/erp/marketing/sku-pnl",
    matches: (p) => p.startsWith("/erp/marketing/sku-pnl"),
  },
  {
    key: "money",
    label: "Money",
    icon: Wallet,
    to: "/erp/finance/dollar-purchase",
    matches: (p) =>
      p.startsWith("/erp/finance/dollar-purchase") ||
      p.startsWith("/erp/marketing/ad-account-funding") ||
      p.startsWith("/erp/marketing/expenses"),
    sub: [
      { to: "/erp/finance/dollar-purchase", label: "Dollar wallet" },
      { to: "/erp/marketing/ad-account-funding", label: "Ad funding ledger" },
      { to: "/erp/marketing/expenses", label: "Manual expenses" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    to: "/erp/marketing/accounts",
    matches: (p) =>
      p.startsWith("/erp/marketing/accounts") ||
      p.startsWith("/erp/marketing/sync") ||
      p.startsWith("/erp/marketing/meta-reports"),
    sub: [
      { to: "/erp/marketing/accounts", label: "Ad accounts" },
      { to: "/erp/marketing/sync", label: "Sync health" },
      { to: "/erp/marketing/meta-reports", label: "Meta reports" },
    ],
  },
];

export function MarketingLeftRail() {
  const { pathname } = useLocation();
  const active = MARKETING_SECTIONS.find((s) => s.matches(pathname));
  return (
    <nav className="flex h-full w-full flex-col gap-1 px-2 py-3 text-sm">
      {MARKETING_SECTIONS.map((s) => {
        const isActive = s.key === active?.key;
        const Icon = s.icon;
        return (
          <div key={s.key} className="min-w-0">
            <Link
              to={s.to as never}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 font-medium transition-colors",
                isActive
                  ? "bg-[#1877F2]/10 text-[#1877F2]"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{s.label}</span>
            </Link>
            {isActive && s.sub && (
              <div className="ml-6 mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-gray-200 pl-3">
                {s.sub.map((c) => {
                  const subActive = c.exact
                    ? pathname === c.to
                    : pathname.startsWith(c.to);
                  return (
                    <Link
                      key={c.to}
                      to={c.to as never}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs transition-colors",
                        subActive
                          ? "text-[#1877F2] font-semibold"
                          : "text-gray-500 hover:text-gray-800",
                      )}
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}