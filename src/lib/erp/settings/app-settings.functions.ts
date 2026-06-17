import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Generic key/value store backed by `app_settings`.
 * Values are stored as JSON strings; admin-only write.
 */

export const getAppSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string }) => z.object({ key: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("app_settings")
      .select("value, updated_at, updated_by")
      .eq("key", data.key)
      .maybeSingle();
    if (error) throw error;
    if (!row?.value) return { value: null, updated_at: row?.updated_at ?? null };
    try {
      return { value: JSON.parse(row.value), updated_at: row.updated_at };
    } catch {
      return { value: row.value, updated_at: row.updated_at };
    }
  });

export const saveAppSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; value: unknown }) =>
    z.object({ key: z.string().min(1).max(120), value: z.any() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Admin check
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin only");

    const json = JSON.stringify(data.value ?? null);
    const { error } = await context.supabase
      .from("app_settings")
      .upsert(
        { key: data.key, value: json, updated_by: context.userId, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw error;
    return { ok: true };
  });
