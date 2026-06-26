import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_ROLES } from "@/lib/erp/users.functions";

/**
 * Unified "Add Person" — single server fn that optionally creates:
 *   1) An auth user + role + brand access (if access.createLogin)
 *   2) An HR employee record (if employment.create)
 *
 * Replaces the split between createAppUser and createEmployee for the wizard flow.
 */

const RoleEnum = z.enum(APP_ROLES);

const personSchema = z.object({
  // Step 1 — basics (always required)
  basics: z.object({
    full_name: z.string().trim().min(1),
    email: z.string().trim().email().optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    photo_url: z.string().nullable().optional(),
  }),
  // Step 2 — access (optional: skip to create employee-only with no login)
  access: z
    .object({
      createLogin: z.boolean(),
      password: z.string().min(6).max(72).optional(),
      roles: z.array(RoleEnum).max(10).optional(),
      brandIds: z.array(z.string().uuid()).max(50).optional(),
    })
    .optional(),
  // Step 3 — employment (optional: skip to create login-only / no HR record)
  employment: z
    .object({
      createEmployee: z.boolean(),
      joining_date: z.string().optional(),
      department_id: z.string().uuid().nullable().optional(),
      designation_id: z.string().uuid().nullable().optional(),
      employment_type: z
        .enum(["full_time", "part_time", "contract", "intern", "consultant"])
        .nullable()
        .optional(),
      gross_salary: z.number().nullable().optional(),
    })
    .optional(),
});

async function assertAdmin(supabase: any, userId: string) {
  // Either HR admin or platform admin can add people
  const { data: hrAdmin } = await supabase.rpc("has_hr_admin", { _user_id: userId });
  if (hrAdmin) return;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;
  throw new Error("Admin only");
}

export const createPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => personSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const wantsLogin = !!data.access?.createLogin;
    const wantsEmployee = !!data.employment?.createEmployee;
    if (!wantsLogin && !wantsEmployee) {
      throw new Error("Pick at least one: create login OR create employee record.");
    }

    const result: { userId?: string; employeeId?: string } = {};

    // ── 1) Auth user + role + brand access
    if (wantsLogin) {
      const email = (data.basics.email || "").trim();
      const password = data.access?.password || "";
      if (!email) throw new Error("Email required to create a login.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");

      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        phone: data.basics.phone || undefined,
        user_metadata: { display_name: data.basics.full_name },
      });
      if (error) throw error;
      const newUserId = created.user!.id;
      result.userId = newUserId;

      await supabaseAdmin
        .from("profiles")
        .upsert({ id: newUserId, display_name: data.basics.full_name });

      const roles = data.access?.roles ?? [];
      if (roles.length) {
        const { error: rErr } = await supabaseAdmin
          .from("user_roles")
          .insert(roles.map((r) => ({ user_id: newUserId, role: r })));
        if (rErr) throw rErr;
      }

      const brandIds = data.access?.brandIds ?? [];
      if (brandIds.length) {
        const { error: bErr } = await supabaseAdmin
          .from("user_brand_access")
          .insert(brandIds.map((bid) => ({ user_id: newUserId, brand_id: bid, created_by: context.userId })));
        if (bErr) throw bErr;
      }
    }

    // ── 2) Employee record (linked to user if we just created one)
    if (wantsEmployee) {
      const { data: code, error: ce } = await context.supabase.rpc("hr_next_employee_code");
      if (ce) throw ce;

      const empPayload: any = {
        employee_code: code,
        user_id: result.userId ?? null,
        full_name: data.basics.full_name,
        email: data.basics.email || null,
        phone: data.basics.phone || null,
        photo_url: data.basics.photo_url ?? null,
        joining_date: data.employment?.joining_date || new Date().toISOString().slice(0, 10),
        department_id: data.employment?.department_id ?? null,
        designation_id: data.employment?.designation_id ?? null,
        employment_type: data.employment?.employment_type ?? null,
        gross_salary: data.employment?.gross_salary ?? null,
        status: "active",
        currency: "BDT",
        created_by: context.userId,
      };

      // If no login was created, try to link an existing auth user by email
      if (!empPayload.user_id && empPayload.email) {
        try {
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const match = list?.users?.find(
            (u: any) => u.email?.toLowerCase() === String(empPayload.email).toLowerCase(),
          );
          if (match) empPayload.user_id = match.id;
        } catch { /* ignore */ }
      }

      const { data: row, error } = await context.supabase
        .from("hr_employees")
        .insert(empPayload)
        .select()
        .single();
      if (error) throw error;
      result.employeeId = row.id;

      await context.supabase.from("hr_employment_history").insert({
        employee_id: row.id,
        event_type: "joined",
        event_date: row.joining_date,
        to_value: {
          status: row.status,
          department_id: row.department_id,
          designation_id: row.designation_id,
          gross_salary: row.gross_salary,
        },
        created_by: context.userId,
      });
    }

    return result;
  });