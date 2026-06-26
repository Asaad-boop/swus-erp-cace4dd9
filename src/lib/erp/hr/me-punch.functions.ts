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