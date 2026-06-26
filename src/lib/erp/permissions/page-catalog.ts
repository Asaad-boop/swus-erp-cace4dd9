/**
 * Catalog of every backoffice page that can be individually toggled
 * per user via the "Pages" permission tab.
 *
 * Each entry represents a sidebar destination. Path matching is
 * prefix-based: granting `/erp/orders/web` lets the user open that
 * page and any nested sub-route under it.
 *
 * Admin always bypasses page-level permissions.
 */
export type PageEntry = {
  path: string;
  label: string;
  group: string;
};

export const PAGE_CATALOG: PageEntry[] = [
  { group: "Overview", path: "/erp", label: "Dashboard" },

  { group: "Sales", path: "/erp/orders/web", label: "Web Orders" },
  { group: "Sales", path: "/erp/orders/list", label: "Order List" },
  { group: "Sales", path: "/erp/orders/new", label: "Create Order" },

  { group: "Inventory", path: "/erp/inventory", label: "Stock" },
  { group: "Inventory", path: "/erp/reorder-queue", label: "Reorder Queue" },
  { group: "Inventory", path: "/erp/purchase-orders", label: "Purchase Orders" },
  { group: "Inventory", path: "/erp/stocktake", label: "Stocktake" },

  { group: "Fulfillment", path: "/erp/courier", label: "Courier" },
  { group: "Fulfillment", path: "/erp/dispatch", label: "Dispatch" },
  { group: "Fulfillment", path: "/erp/returns", label: "Returns" },
  { group: "Fulfillment", path: "/erp/reconciliation", label: "COD Reconciliation" },

  { group: "Supply Chain", path: "/erp/suppliers", label: "Suppliers" },
  { group: "Supply Chain", path: "/erp/imports", label: "Imports" },

  { group: "Finance", path: "/erp/finance", label: "Overview" },
  { group: "Finance", path: "/erp/finance/accounts", label: "Chart of Accounts" },
  { group: "Finance", path: "/erp/finance/wallets", label: "Wallets" },
  { group: "Finance", path: "/erp/finance/journal", label: "Journal" },
  { group: "Finance", path: "/erp/finance/receivables", label: "AR / AP" },
  { group: "Finance", path: "/erp/finance/budgets", label: "Budgets" },
  { group: "Finance", path: "/erp/finance/taxes", label: "Taxes" },
  { group: "Finance", path: "/erp/finance/product-profitability", label: "Profitability" },
  { group: "Finance", path: "/erp/finance/reports", label: "Reports" },
  { group: "Finance", path: "/erp/finance/settings", label: "Finance Settings" },

  { group: "Marketing", path: "/erp/marketing", label: "Overview" },
  { group: "Marketing", path: "/erp/marketing/campaigns", label: "Campaigns" },
  { group: "Marketing", path: "/erp/marketing/sku-pnl", label: "SKU P&L" },
  { group: "Marketing", path: "/erp/marketing/expenses", label: "Expenses" },
  { group: "Marketing", path: "/erp/marketing/attribution", label: "Attribution" },

  { group: "CRM", path: "/erp/crm", label: "Customers" },
  { group: "CRM", path: "/erp/users", label: "Registered Accounts" },

  { group: "Analytics", path: "/erp/analytics", label: "Analytics" },
  { group: "Analytics", path: "/erp/analytics/live", label: "Live Analytics" },

  { group: "HRM", path: "/erp/hr", label: "Live Dashboard" },
  { group: "HRM", path: "/erp/hr/attendance/muster", label: "Activities" },
  { group: "HRM", path: "/erp/hr/attendance", label: "Admin Attendance" },
  { group: "HRM", path: "/erp/hr/reports", label: "Attendance Report" },
  { group: "HRM", path: "/erp/hr/leave", label: "Approvals" },
  { group: "HRM", path: "/erp/hr/settings", label: "HR Settings" },
  { group: "HRM", path: "/erp/hr/staff", label: "Staff Logins" },

  { group: "System", path: "/erp/settings", label: "Settings" },
  { group: "System", path: "/erp/diagnostics", label: "Diagnostics" },
];

export const PAGE_GROUPS = Array.from(new Set(PAGE_CATALOG.map((p) => p.group)));

export const ALL_PAGE_PATHS = PAGE_CATALOG.map((p) => p.path);

/**
 * Returns true if `pathname` is covered by any path in `allowed`.
 * Match = exact OR `pathname` starts with `allowed + "/"`.
 * Always allows the protected layout entry (`/erp` alone) implicit
 * landing — the caller still gates whether the user has any access.
 */
export function pathAllowedBy(allowed: string[] | null | undefined, pathname: string): boolean {
  if (!allowed || allowed.length === 0) return true; // no override = use role defaults
  // Sort longest-first to match the most specific entry first.
  for (const a of [...allowed].sort((x, y) => y.length - x.length)) {
    if (pathname === a) return true;
    // `/erp` is the dashboard landing only — never treat it as a prefix
    // that grants every `/erp/...` child page.
    if (a === "/erp") continue;
    if (pathname.startsWith(a + "/")) return true;
  }
  return false;
}