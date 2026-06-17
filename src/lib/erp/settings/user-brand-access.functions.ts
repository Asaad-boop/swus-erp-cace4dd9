import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

export const listUserBrandAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("user_brand_access")
      .select("user_id, brand_id, created_at");
    if (error) throw error;
    const byUser: Record<string, string[]> = {};
    (data ?? []).forEach((r: any) => {
      (byUser[r.user_id] = byUser[r.user_id] || []).push(r.brand_id);
    });
    return byUser;
  });

export const setUserBrandAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; brandIds: string[] }) =>
    z.object({
      userId: z.string().uuid(),
      brandIds: z.array(z.string().uuid()).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Replace strategy: delete then insert
    const { error: dErr } = await supabaseAdmin
      .from("user_brand_access")
      .delete()
      .eq("user_id", data.userId);
    if (dErr) throw dErr;
    if (data.brandIds.length > 0) {
      const rows = data.brandIds.map((bid) => ({
        user_id: data.userId,
        brand_id: bid,
        created_by: context.userId,
      }));
      const { error: iErr } = await supabaseAdmin.from("user_brand_access").insert(rows);
      if (iErr) throw iErr;
    }
    return { ok: true };
  });
