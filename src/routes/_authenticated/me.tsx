import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, CalendarDays, Plane, Wallet, User, Building2, LogOut, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getMyEmployee } from "@/lib/erp/hr/me.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "My Workspace" }] }),
  component: MeShell,
});

const nav = [
  { to: "/me", label: "Home", icon: Home, exact: true },
  { to: "/me/attendance", label: "Attendance", icon: CalendarDays },
  { to: "/me/leave", label: "Leave", icon: Plane },
  { to: "/me/payslips", label: "Payslips", icon: Wallet },
  { to: "/me/profile", label: "Profile", icon: User },
];

function MeShell() {
  const location = useLocation();
  const getEmp = useServerFn(getMyEmployee);
  const { data } = useQuery({ queryKey: ["me", "emp"], queryFn: () => getEmp() });
  const emp: any = data?.employee;
  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:py-4">
          <Link to="/erp" className="text-muted-foreground hover:text-foreground shrink-0 md:hidden" aria-label="Back to ERP">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">My Workspace</div>
            <div className="truncate text-sm font-semibold">
              {emp?.display_name || emp?.full_name || "Welcome"}
            </div>
          </div>
          <Avatar className="h-9 w-9 shrink-0">
            {emp?.photo_url && <AvatarImage src={emp.photo_url} />}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {(emp?.display_name || emp?.full_name || "U").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Desktop horizontal nav */}
        <nav className="mx-auto hidden max-w-5xl items-center gap-1 px-4 pb-2 md:flex">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.to, n.exact);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/erp">Back to ERP</Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Sign out
            </Button>
          </div>
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-4 sm:pt-6 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-5xl grid-cols-5">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.to, n.exact);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "grid h-9 w-12 place-items-center rounded-xl transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}