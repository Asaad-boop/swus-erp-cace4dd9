import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Settings as SettingsIcon,
  UsersRound,
  Activity,
  ShieldCheck,
  FileBarChart2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  search?: Record<string, string>;
};

// HRM subnav — live ops + admin attendance flows.
const items: Item[] = [
  { to: "/erp/hr", label: "Live Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/erp/hr/attendance/muster", label: "Activities", icon: Activity },
  { to: "/erp/hr/attendance", label: "Admin Attendance", icon: ShieldCheck, exact: true },
  { to: "/erp/hr/reports", label: "Attendance Report", icon: FileBarChart2, exact: true },
  { to: "/erp/hr/leave", label: "Approvals", icon: CheckCircle2 },
  { to: "/erp/hr/reports", label: "Late Report", icon: Clock, search: { view: "late" } },
  { to: "/erp/hr/settings", label: "Settings", icon: SettingsIcon },
];

export function HrSubnav() {
  const { pathname, search } = useLocation();
  const currentView =
    typeof search === "object" && search !== null
      ? (search as Record<string, unknown>).view
      : undefined;
  return (
    <div className="sticky top-0 z-30 border-b border-[color:var(--hr-border)] bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto max-w-[1800px] flex items-center gap-3 px-4 md:px-8 h-12">
        <div className="hidden md:flex items-center gap-2 pr-3 mr-1 border-r border-[color:var(--hr-border)]">
          <div className="grid place-items-center h-7 w-7 rounded-lg bg-[color:var(--hr-accent-soft)] text-[color:var(--hr-accent)]">
            <UsersRound className="h-3.5 w-3.5" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-[color:var(--hr-text-strong)]">
            HRM
          </span>
        </div>
        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin -mx-1 px-1 flex-1">
          {items.map((it) => {
            const pathMatches = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            const wantsView = it.search?.view;
            const viewMatches = wantsView ? currentView === wantsView : !currentView || !it.exact;
            const active = pathMatches && viewMatches;
            return (
              <Link
                key={it.label}
                to={it.to as never}
                search={it.search as never}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 px-2.5 h-8 text-[12.5px] font-medium rounded-md transition-colors whitespace-nowrap",
                  active
                    ? "text-[color:var(--hr-text-strong)]"
                    : "text-[color:var(--hr-text-muted)] hover:text-[color:var(--hr-text-strong)]",
                )}
              >
                <it.icon
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    active ? "text-[color:var(--hr-accent)]" : "opacity-70",
                  )}
                />
                {it.label}
                {active && (
                  <span className="absolute inset-x-1.5 -bottom-[7px] h-[2px] rounded-full bg-[color:var(--hr-accent)]" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}