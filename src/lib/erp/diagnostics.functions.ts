import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DiagnosticsResult = {
  server: {
    supabaseUrlHost: string | null;
    hasServiceRoleKey: boolean;
    hasPublishableKey: boolean;
    nodeEnv: string | null;
    runtime: string;
  };
  user: {
    userId: string;
    email: string | null;
  };
  roles: string[];
  brands: Array<{ id: string; name: string; is_active: boolean }>;
  crm: {
    canRead: boolean;
    materializedViewCount: number | null;
    materializedViewError: string | null;
    liveViewError: string | null;
    error: string | null;
  };
};

function host(u: string | undefined | null): string | null {
  if (!u) return null;
  try { return new URL(u).host; } catch { return null; }
}

function envValue(...keys: string[]): string | undefined {
  return keys.map((key) => process.env[key]).find(Boolean);
}

export const runDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiagnosticsResult> => {
    const { supabase, userId, claims } = context;

    // Roles (via user_roles, scoped by user RLS)
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);

    // Brands the user can see
    const { data: brandRows } = await supabase
      .from("brands")
      .select("id,name,is_active")
      .order("name");

    // CRM probe: try MV first, then live view
    let canRead = false;
    let mvCount: number | null = null;
    let mvErr: string | null = null;
    let liveErr: string | null = null;
    let topErr: string | null = null;
    try {
      const { supabaseAdmin, isSupabaseAdminConfigured } =
        await import("@/integrations/supabase/client.server");
      if (!isSupabaseAdminConfigured()) {
        topErr = "SUPABASE_SERVICE_ROLE_KEY is missing on this server";
      } else {
        const mv = await supabaseAdmin
          .from("crm_customers_mv")
          .select("customer_key", { count: "exact", head: true });
        if (mv.error) mvErr = mv.error.message;
        else { mvCount = mv.count ?? 0; canRead = true; }

        if (!canRead) {
          const lv = await supabaseAdmin
            .from("crm_customers_v")
            .select("customer_key", { count: "exact", head: true });
          if (lv.error) liveErr = lv.error.message;
          else canRead = true;
        }
      }
    } catch (e: any) {
      topErr = e?.message ?? String(e);
    }

    return {
      server: {
        supabaseUrlHost: host(envValue("SUPABASE_URL", "VITE_SUPABASE_URL")),
        hasServiceRoleKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_SERVICE_ROLE_KEY),
        hasPublishableKey: !!envValue("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"),
        nodeEnv: process.env.NODE_ENV ?? null,
        runtime: typeof (globalThis as any).EdgeRuntime === "string" ? "edge" : "node",
      },
      user: {
        userId,
        email: (claims as any)?.email ?? null,
      },
      roles,
      brands: (brandRows ?? []) as any,
      crm: {
        canRead,
        materializedViewCount: mvCount,
        materializedViewError: mvErr,
        liveViewError: liveErr,
        error: topErr,
      },
    };
  });

export const refreshCrmMaterializedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("refresh_crm_customers_mv");
    if (error) throw error;
    return { ok: true };
  });