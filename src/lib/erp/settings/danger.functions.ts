import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

/**
 * Deletes test orders and related rows for a brand.
 * Safe-guarded: requires confirm token "DELETE" and admin role.
 */
export const clearTestData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; confirm: string }) =>
    z.object({ brandId: z.string().uuid(), confirm: z.literal("DELETE") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only orders flagged with note containing "TEST" — narrow blast radius.
    const { data: rows, error: fErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("brand_id", data.brandId)
      .ilike("notes", "%TEST%");
    if (fErr) throw fErr;
    const ids = (rows ?? []).map((r: any) => r.id);
    if (ids.length === 0) return { deleted: 0 };

    await supabaseAdmin.from("order_items").delete().in("order_id", ids);
    await supabaseAdmin.from("order_notes").delete().in("order_id", ids);
    await supabaseAdmin.from("order_status_history").delete().in("order_id", ids);
    const { error } = await supabaseAdmin.from("orders").delete().in("id", ids);
    if (error) throw error;
    return { deleted: ids.length };
  });
