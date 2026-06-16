import { createFileRoute, Navigate, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Package, LogOut, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_agent")({
  ssr: false,
  component: AgentGate,
});

type Status = "loading" | "guest" | "denied" | "ok";

function AgentGate() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { if (mounted) setStatus("guest"); return; }
      const { data: ok } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "cargo_agent" });
      if (mounted) setStatus(ok ? "ok" : "denied");
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) setStatus("guest");
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  if (status === "loading") return <div className="min-h-screen bg-background" />;
  if (status === "guest") return <Navigate to="/auth" replace />;
  if (status === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">Access denied</h1>
          <p className="text-sm text-muted-foreground mb-4">Ei account er cargo agent permission nei.</p>
          <Button onClick={async () => { await supabase.auth.signOut(); }}>Sign out</Button>
        </div>
      </div>
    );
  }
  return <AgentShell />;
}

function AgentShell() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const nav = [
    { to: "/agent", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/agent/orders", label: "Purchase Orders", icon: Package, exact: false },
    { to: "/agent/profile", label: "Profile", icon: UserCircle2, exact: true },
  ] as const;

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen flex bg-muted/20">
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="text-sm font-bold">Cargo Agent Portal</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Supplier &amp; Shipping</div>
        </div>
        <nav className="p-2 flex-1 space-y-1">
          {nav.map((n) => {
            const active = isActive(n.to, n.exact);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-border">
          <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}