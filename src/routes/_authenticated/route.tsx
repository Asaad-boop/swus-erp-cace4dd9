import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthGate,
});

// ERP backoffice roles — any one is enough to access /erp/*
const ERP_ROLES = new Set([
  "admin",
  "moderator",
  "customer_service",
  "operations",
  "packer",
  "accountant",
  "marketing_manager",
  "warehouse_staff",
]);

type Status =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "authed"; roles: string[] };

function AuthGate() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!u.user) {
        setStatus({ kind: "guest" });
        return;
      }
      const { data: rows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      if (!mounted) return;
      const roles = (rows ?? []).map((r) => r.role as string);
      setStatus({ kind: "authed", roles });
    };

    void load();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setStatus({ kind: "guest" });
      } else if (event === "SIGNED_IN") {
        void load();
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (status.kind === "loading") return <div className="min-h-screen bg-background" />;
  if (status.kind === "guest") return <Navigate to="/auth" replace />;

  const { roles } = status;
  const hasErpAccess = roles.some((r) => ERP_ROLES.has(r));

  if (!hasErpAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Ei account er ERP backoffice e dhukar permission nei. Admin ke bolun proper role assign
            korte.
          </p>
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
