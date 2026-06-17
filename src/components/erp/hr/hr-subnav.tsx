import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Users, Building2, BadgeCheck, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/erp/hr", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/erp/hr/employees", label: "Employees", icon: Users },
  { to: "/erp/hr/departments", label: "Departments", icon: Building2 },
  { to: "/erp/hr/designations", label: "Designations", icon: BadgeCheck },
  { to: "/erp/hr/settings", label: "Settings", icon: SettingsIcon },
];

export function HrSubnav() {
  const { pathname } = useLocation();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-4">
      {items.map((it) => {
        const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to as never}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}