import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!(roles.has("admin") || roles.has("operations") || roles.has("accountant"))) {
    throw new Error("Forbidden");
  }
}

export const getHealthChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; from: string; to: string }) =>
    z.object({ brand_id: z.string().uuid(), from: dateStr, to: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("mkt_health_checks", {
      p_brand_id: data.brand_id, p_from: data.from, p_to: data.to,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });