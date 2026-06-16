import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!roles.has("admin")) throw new Error("Forbidden: admin role required");
}

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!(roles.has("admin") || roles.has("operations") || roles.has("accountant"))) {
    throw new Error("Forbidden");
  }
}

function randomKey(prefix = "mkt_") {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  const b64 = btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return prefix + b64;
}

export const listTrackerSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("marketing_tracker_sites")
      .select("id, brand_id, name, site_key, allowed_origins, is_active, last_event_at, created_at, brands:brand_id(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTrackerSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; name: string; allowed_origins?: string[] }) =>
    z
      .object({
        brand_id: z.string().uuid(),
        name: z.string().min(1).max(120),
        allowed_origins: z.array(z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const site_key = randomKey();
    const { data: row, error } = await context.supabase
      .from("marketing_tracker_sites")
      .insert({
        brand_id: data.brand_id,
        name: data.name,
        site_key,
        allowed_origins: data.allowed_origins ?? [],
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTrackerSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    name?: string;
    allowed_origins?: string[];
    is_active?: boolean;
  }) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        allowed_origins: z.array(z.string()).optional(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("marketing_tracker_sites")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateTrackerSiteKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const site_key = randomKey();
    const { data: row, error } = await context.supabase
      .from("marketing_tracker_sites")
      .update({ site_key })
      .eq("id", data.id)
      .select("id, site_key")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTrackerSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("marketing_tracker_sites")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTrackerStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id?: string }) =>
    z.object({ brand_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let sessQ = context.supabase
      .from("marketing_sessions")
      .select("id", { count: "exact", head: true })
      .gte("first_seen_at", since);
    let evtQ = context.supabase
      .from("marketing_events")
      .select("id", { count: "exact", head: true })
      .gte("event_time", since);
    if (data.brand_id) {
      sessQ = sessQ.eq("brand_id", data.brand_id);
      evtQ = evtQ.eq("brand_id", data.brand_id);
    }
    const [{ count: sessions }, { count: events }] = await Promise.all([sessQ, evtQ]);
    return { sessions: sessions ?? 0, events: events ?? 0, since };
  });