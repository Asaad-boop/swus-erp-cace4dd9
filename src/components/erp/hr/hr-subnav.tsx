import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Users, Building2, BadgeCheck, Settings as SettingsIcon, CalendarCheck, CalendarDays, Clock, Palmtree, Wallet, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/erp/hr", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/erp/hr/employees", label: "Employees", icon: Users },
  { to: "/erp/hr/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/erp/hr/leave", label: "Leave", icon: CalendarDays },
  { to: "/erp/hr/shifts", label: "Shifts", icon: Clock },
  { to: "/erp/hr/payroll", label: "Payroll", icon: Wallet },
  { to: "/erp/hr/holidays", label: "Holidays", icon: Palmtree },
  { to: "/erp/hr/departments", label: "Departments", icon: Building2 },
  { to: "/erp/hr/designations", label: "Designations", icon: BadgeCheck },
  { to: "/erp/hr/reports", label: "Reports", icon: BarChart3 },
  { to: "/erp/hr/settings", label: "Settings", icon: SettingsIcon },
];

export function HrSubnav() {
  const { pathname } = useLocation();
  return (
    <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-thin">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to as never}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 whitespace-nowrap",
                active
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
              )}
            >
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}