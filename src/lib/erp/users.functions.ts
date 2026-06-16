import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const APP_ROLES = [
  "admin",
  "operations",
  "accountant",
  "warehouse_staff",
  "packer",
  "customer_service",
  "marketing_manager",
  "moderator",
  "cargo_agent",
  "customer",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admin only");
}

/* ============= LIST ============= */

export const listAppUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const users = list.users ?? [];
    const ids = users.map((u: any) => u.id);

    const [rolesRes, profilesRes, agentsRes] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("imp_cargo_agents").select("id, name, user_id, brand_id").not("user_id", "is", null),
    ]);
    if (rolesRes.error) throw rolesRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (agentsRes.error) throw agentsRes.error;

    const rolesByUser: Record<string, string[]> = {};
    (rolesRes.data ?? []).forEach((r: any) => {
      (rolesByUser[r.user_id] = rolesByUser[r.user_id] || []).push(r.role);
    });
    const profileByUser: Record<string, string> = {};
    (profilesRes.data ?? []).forEach((p: any) => { profileByUser[p.id] = p.display_name; });
    const agentByUser: Record<string, any> = {};
    (agentsRes.data ?? []).forEach((a: any) => { if (a.user_id) agentByUser[a.user_id] = a; });

    return users.map((u: any) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed_at: u.email_confirmed_at,
      banned_until: u.banned_until ?? null,
      phone: u.phone ?? null,
      display_name: profileByUser[u.id] ?? null,
      roles: rolesByUser[u.id] ?? [],
      cargo_agent: agentByUser[u.id] ?? null,
    }));
  });

export const listAvailableCargoAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [agentsRes, brandsRes] = await Promise.all([
      supabaseAdmin.from("imp_cargo_agents").select("id, name, brand_id, user_id").order("name"),
      supabaseAdmin.from("brands").select("id, name"),
    ]);
    if (agentsRes.error) throw agentsRes.error;
    if (brandsRes.error) throw brandsRes.error;
    const brandMap: Record<string, string> = {};
    (brandsRes.data ?? []).forEach((b: any) => { brandMap[b.id] = b.name; });
    return (agentsRes.data ?? []).map((a: any) => ({
      ...a,
      brands: a.brand_id ? { name: brandMap[a.brand_id] ?? null } : null,
    }));
  });

/* ============= CREATE ============= */

const RoleEnum = z.enum(APP_ROLES);

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; displayName?: string; roles: string[]; cargoAgentId?: string | null }) =>
    z.object({
      email: z.string().trim().email().max(255),
      password: z.string().min(6).max(72),
      displayName: z.string().trim().max(100).optional(),
      roles: z.array(RoleEnum).max(10),
      cargoAgentId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.displayName ? { display_name: data.displayName } : undefined,
    });
    if (error) throw error;
    const newUserId = created.user!.id;

    if (data.displayName) {
      await supabaseAdmin.from("profiles").upsert({ id: newUserId, display_name: data.displayName });
    }

    const finalRoles = data.cargoAgentId && !data.roles.includes("cargo_agent")
      ? [...data.roles, "cargo_agent" as const]
      : data.roles;

    if (finalRoles.length) {
      const rows = finalRoles.map((r) => ({ user_id: newUserId, role: r }));
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert(rows);
      if (rErr) throw rErr;
    }

    if (data.cargoAgentId) {
      const { error: aErr } = await supabaseAdmin
        .from("imp_cargo_agents")
        .update({ user_id: newUserId })
        .eq("id", data.cargoAgentId);
      if (aErr) throw aErr;
    }

    return { id: newUserId };
  });

/* ============= UPDATE ROLES ============= */

export const updateUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; roles: string[] }) =>
    z.object({ userId: z.string().uuid(), roles: z.array(RoleEnum).max(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && !data.roles.includes("admin")) {
      throw new Error("Cannot remove your own admin role");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: dErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (dErr) throw dErr;
    if (data.roles.length) {
      const { error: iErr } = await supabaseAdmin
        .from("user_roles")
        .insert(data.roles.map((r) => ({ user_id: data.userId, role: r })));
      if (iErr) throw iErr;
    }
    return { ok: true };
  });

/* ============= LINK CARGO AGENT ============= */

export const linkUserToCargoAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; cargoAgentId: string | null }) =>
    z.object({ userId: z.string().uuid(), cargoAgentId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // unlink existing first
    await supabaseAdmin.from("imp_cargo_agents").update({ user_id: null }).eq("user_id", data.userId);
    if (data.cargoAgentId) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "cargo_agent" }, { onConflict: "user_id,role" });
      if (roleErr) throw roleErr;

      const { error } = await supabaseAdmin
        .from("imp_cargo_agents")
        .update({ user_id: data.userId })
        .eq("id", data.cargoAgentId);
      if (error) throw error;
    }
    return { ok: true };
  });

/* ============= PASSWORD RESET ============= */

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(6).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw error;
    return { ok: true };
  });

/* ============= DELETE ============= */

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("imp_cargo_agents").update({ user_id: null }).eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

/* ============= BAN / UNBAN ============= */

export const toggleUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; ban: boolean }) =>
    z.object({ userId: z.string().uuid(), ban: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Cannot disable your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ban ? "876000h" : "none",
    } as any);
    if (error) throw error;
    return { ok: true };
  });

/* ============= UPDATE PROFILE ============= */

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; displayName?: string | null; email?: string | null }) =>
    z.object({
      userId: z.string().uuid(),
      displayName: z.string().trim().max(100).nullable().optional(),
      email: z.string().trim().email().max(255).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { email: data.email });
      if (error) throw error;
    }
    if (data.displayName !== undefined) {
      await supabaseAdmin.from("profiles").upsert({ id: data.userId, display_name: data.displayName ?? null });
    }
    return { ok: true };
  });

/* ============= GENERATE LINKS ============= */

export const generateAuthLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; type: "recovery" | "magiclink" }) =>
    z.object({ email: z.string().email(), type: z.enum(["recovery", "magiclink"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: data.type,
      email: data.email,
    });
    if (error) throw error;
    return { url: link.properties?.action_link ?? null };
  });

/* ============= BULK ============= */

export const bulkDeleteUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userIds: string[] }) =>
    z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const ids = data.userIds.filter((id) => id !== context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("imp_cargo_agents").update({ user_id: null }).in("user_id", ids);
    await supabaseAdmin.from("user_roles").delete().in("user_id", ids);
    for (const id of ids) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
    return { ok: true, count: ids.length };
  });

export const bulkSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userIds: string[]; role: string; action: "add" | "remove" }) =>
    z.object({
      userIds: z.array(z.string().uuid()).min(1).max(100),
      role: RoleEnum,
      action: z.enum(["add", "remove"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.action === "add") {
      const rows = data.userIds.map((uid) => ({ user_id: uid, role: data.role }));
      const { error } = await supabaseAdmin.from("user_roles").upsert(rows, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const safeIds = data.role === "admin" ? data.userIds.filter((id) => id !== context.userId) : data.userIds;
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .in("user_id", safeIds)
        .eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });