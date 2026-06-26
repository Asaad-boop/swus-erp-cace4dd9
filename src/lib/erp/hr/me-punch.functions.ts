import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the current user's employee row + today's attendance + active shift.
 * Self-service: does NOT require HR access. If user has no linked employee
 * record, returns { employee: null }.
 */
export const getMyPunchToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    // employee (self) — try by user_id, then by email self-heal
    let { data: emp } = await context.supabase
      .from("hr_employees")
      .select("id, full_name, display_name, photo_url, user_id, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!emp) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: au } = await supabaseAdmin.auth.admin.getUserById(context.userId);
        const email = au?.user?.email?.toLowerCase();
        if (email) {
          const { data: match } = await supabaseAdmin
            .from("hr_employees")
            .select("id, full_name, display_name, photo_url, user_id, email")
            .is("user_id", null)
            .ilike("email", email)
            .limit(1)
            .maybeSingle();
          if (match) {
            await supabaseAdmin
              .from("hr_employees")
              .update({ user_id: context.userId })
              .eq("id", match.id);
            emp = { ...match, user_id: context.userId } as any;
          }
        }

        // Auto-provision: admin/staff users without an HR record get one created
        // automatically so they can punch attendance like anyone else.
        if (!emp) {
          const { data: roles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", context.userId);
          const roleSet = new Set((roles ?? []).map((r: any) => r.role));
          const isStaffish = roleSet.has("admin") || roleSet.has("staff") || roleSet.has("moderator") || roleSet.has("manager");
          if (isStaffish) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("display_name, email, phone")
              .eq("id", context.userId)
              .maybeSingle();
            const fullName =
              prof?.display_name?.trim() ||
              au?.user?.user_metadata?.full_name ||
              email?.split("@")[0] ||
              "Admin User";
            const code = `ADM-${context.userId.slice(0, 8).toUpperCase()}`;
            const { data: created, error: cErr } = await (supabaseAdmin as any)
              .from("hr_employees")
              .insert({
                user_id: context.userId,
                employee_code: code,
                full_name: fullName,
                display_name: prof?.display_name ?? fullName,
                email: prof?.email ?? email ?? null,
                phone: prof?.phone ?? null,
                employment_status: "active",
              })
              .select("id, full_name, display_name, photo_url, user_id, email")
              .single();
            if (!cErr && created) emp = created as any;
          }
        }
      } catch { /* ignore */ }
    }
    if (!emp) return { employee: null, attendance: null, shift: null, today };

    const [{ data: att }, shiftRow, defShift] = await Promise.all([
      context.supabase
        .from("hr_attendance")
        .select("id, status, check_in_time, check_out_time, break_start, break_end, late_min, total_hours, work_min, shift_id")
        .eq("employee_id", emp.id)
        .eq("date", today)
        .maybeSingle(),
      context.supabase
        .from("hr_employee_shifts")
        .select("shift_id, hr_shifts(*)")
        .eq("employee_id", emp.id)
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase.from("hr_shifts").select("*").eq("is_default", true).limit(1).maybeSingle(),
    ]);
    const shift = (shiftRow as any)?.data?.hr_shifts ?? (defShift as any)?.data ?? null;
    return { employee: emp, attendance: att ?? null, shift, today };
  });