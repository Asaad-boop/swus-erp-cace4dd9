import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, ShoppingCart, Boxes, Wallet, Truck, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/erp", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/erp/orders", label: "Orders", icon: ShoppingCart },
  { to: "/erp/inventory", label: "Inventory", icon: Boxes },
  { to: "/erp/finance", label: "Finance", icon: Wallet },
  { to: "/erp/courier", label: "Courier", icon: Truck },
  { to: "/erp/suppliers", label: "Suppliers", icon: Users },
  { to: "/erp/settings", label: "Settings", icon: Settings },
];

export function ErpSidebar() {
  const location = useLocation();
  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card">
      <div className="px-6 py-5 border-b border-border">
        <div className="text-lg font-bold tracking-tight">ERP Suite</div>
        <div className="text-xs text-muted-foreground mt-0.5">Multi-brand control</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to as never}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-3 text-xs text-muted-foreground border-t border-border">
        v0.1 · Phase 0
      </div>
    </aside>
  );
}