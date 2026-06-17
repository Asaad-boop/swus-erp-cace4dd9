import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

const SlugRe = /^[a-z0-9-]+$/;

export const createBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    slug: string;
    logo_url?: string | null;
    primary_color?: string | null;
    timezone?: string | null;
    currency?: string | null;
    language?: string | null;
    is_active?: boolean;
  }) =>
    z.object({
      name: z.string().trim().min(1).max(100),
      slug: z.string().trim().min(1).max(40).regex(SlugRe, "lowercase letters, digits, hyphens only"),
      logo_url: z.string().url().nullable().optional(),
      primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      timezone: z.string().max(80).nullable().optional(),
      currency: z.string().max(8).nullable().optional(),
      language: z.string().max(10).nullable().optional(),
      is_active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const settings = {
      primary_color: data.primary_color ?? null,
      timezone: data.timezone ?? "Asia/Dhaka",
      currency: data.currency ?? "BDT",
      language: data.language ?? "en",
    };
    const { data: row, error } = await context.supabase
      .from("brands")
      .insert({
        name: data.name,
        slug: data.slug,
        logo_url: data.logo_url ?? null,
        is_active: data.is_active ?? true,
        settings,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    name?: string;
    slug?: string;
    logo_url?: string | null;
    primary_color?: string | null;
    timezone?: string | null;
    currency?: string | null;
    language?: string | null;
    is_active?: boolean;
  }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(100).optional(),
      slug: z.string().trim().min(1).max(40).regex(SlugRe).optional(),
      logo_url: z.string().url().nullable().optional(),
      primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      timezone: z.string().max(80).nullable().optional(),
      currency: z.string().max(8).nullable().optional(),
      language: z.string().max(10).nullable().optional(),
      is_active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Merge per-brand meta into settings JSON without clobbering other keys.
    const { data: existing, error: fErr } = await context.supabase
      .from("brands")
      .select("settings")
      .eq("id", data.id)
      .single();
    if (fErr) throw fErr;
    const cur = (existing?.settings ?? {}) as Record<string, unknown>;
    const merged = {
      ...cur,
      ...(data.primary_color !== undefined ? { primary_color: data.primary_color } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.language !== undefined ? { language: data.language } : {}),
    };

    const patch: Record<string, unknown> = { settings: merged };
    if (data.name !== undefined) patch.name = data.name;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url;
    if (data.is_active !== undefined) patch.is_active = data.is_active;

    const { error } = await context.supabase.from("brands").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
