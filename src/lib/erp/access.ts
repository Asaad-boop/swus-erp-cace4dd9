/**
 * Centralized role → module access control for the ERP backoffice.
 *
 * Single source of truth used by:
 *   - `_authenticated/route.tsx` to gate every URL (including direct URL hits)
 *   - `ErpSidebar` to hide modules the user can't open
 *
 * Admin always wins. Anyone else only gets the modules their roles grant.
 */

export type Module =
  | "dashboard"
  | "workspace"
  | "orders"
  | "inventory"
  | "fulfillment"
  | "supply"
  | "finance"
  | "marketing"
  | "crm"
  | "analytics"
  | "hr"
  | "staff_accounts"
  | "customer_accounts"
  | "settings"
  | "diagnostics";

export const ROLE_MODULES: Record<string, Module[]> = {
  admin: [
    "dashboard", "workspace", "orders", "inventory", "fulfillment", "supply",
    "finance", "marketing", "crm", "analytics", "hr",
    "staff_accounts", "customer_accounts", "settings", "diagnostics",
  ],
  operations: [
    "dashboard", "workspace", "orders", "inventory", "fulfillment",
    "supply", "crm", "analytics", "hr",
  ],
  accountant: ["dashboard", "workspace", "finance", "analytics"],
  warehouse_staff: ["dashboard", "workspace", "inventory", "fulfillment", "supply"],
  packer: ["dashboard", "workspace", "fulfillment"],
  customer_service: ["dashboard", "workspace", "orders", "crm", "customer_accounts"],
  marketing_manager: ["dashboard", "workspace", "marketing", "analytics"],
  moderator: ["dashboard", "workspace"],
  hr_admin: ["dashboard", "workspace", "hr"],
  hr_manager: ["dashboard", "workspace", "hr"],
  employee: ["workspace"],
  customer: [],
};

export function getAllowedModules(roles: string[]): Set<Module> {
  const s = new Set<Module>();
  for (const r of roles) {
    const mods = ROLE_MODULES[r];
    if (mods) for (const m of mods) s.add(m);
  }
  return s;
}

/** Path → module. Order matters: more specific patterns first. */
const PATH_RULES: { test: (p: string) => boolean; module: Module }[] = [
  { test: (p) => p === "/me" || p.startsWith("/me/"), module: "workspace" },
  { test: (p) => p === "/erp" || p === "/erp/", module: "dashboard" },
  // HR staff/users live inside /erp/hr but need their own modules
  { test: (p) => p.startsWith("/erp/hr/staff"), module: "staff_accounts" },
  { test: (p) => p.startsWith("/erp/hr"), module: "hr" },
  { test: (p) => p.startsWith("/erp/orders"), module: "orders" },
  {
    test: (p) =>
      p.startsWith("/erp/inventory") ||
      p.startsWith("/erp/reorder-queue") ||
      p.startsWith("/erp/purchase-orders") ||
      p.startsWith("/erp/stocktake"),
    module: "inventory",
  },
  {
    test: (p) =>
      p.startsWith("/erp/courier") ||
      p.startsWith("/erp/dispatch") ||
      p.startsWith("/erp/returns") ||
      p.startsWith("/erp/reconciliation"),
    module: "fulfillment",
  },
  { test: (p) => p.startsWith("/erp/suppliers") || p.startsWith("/erp/imports"), module: "supply" },
  { test: (p) => p.startsWith("/erp/finance"), module: "finance" },
  { test: (p) => p.startsWith("/erp/marketing"), module: "marketing" },
  { test: (p) => p.startsWith("/erp/crm"), module: "crm" },
  { test: (p) => p.startsWith("/erp/analytics"), module: "analytics" },
  { test: (p) => p.startsWith("/erp/users"), module: "customer_accounts" },
  { test: (p) => p.startsWith("/erp/settings"), module: "settings" },
  { test: (p) => p.startsWith("/erp/diagnostics"), module: "diagnostics" },
];

export function moduleForPath(pathname: string): Module | null {
  for (const r of PATH_RULES) if (r.test(pathname)) return r.module;
  return null;
}

/** Returns true if the user can open the given pathname. Admin bypass. */
export function canAccessPath(roles: string[], pathname: string): boolean {
  if (roles.includes("admin")) return true;
  const mod = moduleForPath(pathname);
  if (!mod) return true; // routes outside the matrix aren't restricted by us
  return getAllowedModules(roles).has(mod);
}

/** Convenience: does the user have any backoffice (`/erp/*`) module? */
export function hasAnyBackoffice(roles: string[]): boolean {
  if (roles.includes("admin")) return true;
  const allowed = getAllowedModules(roles);
  // workspace alone (employee/customer) is NOT backoffice
  for (const m of allowed) {
    if (m !== "workspace") return true;
  }
  return false;
}