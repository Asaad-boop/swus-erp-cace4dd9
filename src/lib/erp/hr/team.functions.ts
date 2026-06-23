import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Team / Manager workspace helpers.
 *
 * "Manager" here = an hr_employees row whose `id` appears in some other
 * employee's `manager_id`. No separate user_role needed — we authorize
 * every action by re-checking the line-manager relationship against the
 * caller's employee row.
 *
 * Uses the admin client to bypass the `hr_admin only` RLS on leave_requests
 * write paths, but only AFTER verifying the caller is the actual line
 * manager of the target employee.
 */

async function getSelfEmpId(supabase: any, userId: string) {
  const { data } = await supabase
    .from("hr_employees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id as string | undefined;
}

export const getMyTeamSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const myEmpId = await getSelfEmpId(context.supabase, context.userId);
    if (!myEmpId) return { isManager: false, reports: [], pendingLeaveCount: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);

    const { data: reports } = await supabaseAdmin
      .from("hr_employees")
      .select("id, full_name, display_name, photo_url, status, department_id, designation_id, hr_departments(name), hr_designations(name)")
      .eq("manager_id", myEmpId)
      .eq("status", "active");

    const reportIds = (reports ?? []).map((r: any) => r.id);
    if (reportIds.length === 0) {
      return { isManager: false, reports: [], pendingLeaveCount: 0, todayAttendance: {} };
    }

    const [attRes, pendingRes] = await Promise.all([
      supabaseAdmin
        .from("hr_attendance")
        .select("employee_id, status, check_in_time, check_out_time, late_min")
        .in("employee_id", reportIds)
        .eq("date", today),
      supabaseAdmin
        .from("hr_leave_requests")
        .select("id", { count: "exact", head: true })
        .in("employee_id", reportIds)
        .eq("status", "pending"),
    ]);

    const todayAttendance: Record<string, any> = {};
    for (const a of attRes.data ?? []) todayAttendance[(a as any).employee_id] = a;

    return {
      isManager: true,
      reports: reports ?? [],
      pendingLeaveCount: pendingRes.count ?? 0,
      todayAttendance,
    };
  });

export const getTeamLeaveRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({ status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const myEmpId = await getSelfEmpId(context.supabase, context.userId);
    if (!myEmpId) return { rows: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reports } = await supabaseAdmin
      .from("hr_employees")
      .select("id")
      .eq("manager_id", myEmpId);
    const reportIds = (reports ?? []).map((r: any) => r.id);
    if (reportIds.length === 0) return { rows: [] };
    let q = supabaseAdmin
      .from("hr_leave_requests")
      .select(
        "id, from_date, to_date, days, status, reason, is_half_day, half_day_part, decided_at, decision_note, employee_id, created_at, hr_leave_types(name,color), hr_employees!hr_leave_requests_employee_id_fkey(id, full_name, display_name, photo_url)",
      )
      .in("employee_id", reportIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    return { rows: rows ?? [] };
  });

export const decideTeamLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const myEmpId = await getSelfEmpId(context.supabase, context.userId);
    if (!myEmpId) throw new Error("No employee record linked");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // verify the leave's employee reports to me
    const { data: req } = await supabaseAdmin
      .from("hr_leave_requests")
      .select("id, status, employee_id, hr_employees!hr_leave_requests_employee_id_fkey(manager_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!req) throw new Error("Not found");
    const mgrId = (req as any).hr_employees?.manager_id;
    if (mgrId !== myEmpId) throw new Error("Not your team member");
    if (req.status !== "pending") throw new Error("Already decided");
    const { error } = await supabaseAdmin
      .from("hr_leave_requests")
      .update({
        status: data.decision,
        approver_id: myEmpId,
        decided_at: new Date().toISOString(),
        decision_note: data.note ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });