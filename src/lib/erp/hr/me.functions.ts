import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Resolve current user's employee row (or null). Server-side admin client to bypass any RLS that hides foreign rows. */
async function getSelfEmployee(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("hr_employees")
    .select(
      "id, employee_code, full_name, display_name, email, phone, photo_url, status, employment_type, joining_date, department_id, designation_id, manager_id, work_location, gross_salary, currency, user_id",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getActiveShift(supabase: any, employeeId: string, dateStr: string) {
  const { data } = await supabase
    .from("hr_employee_shifts")
    .select("shift_id, hr_shifts(*)")
    .eq("employee_id", employeeId)
    .lte("effective_from", dateStr)
    .or(`effective_to.is.null,effective_to.gte.${dateStr}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.hr_shifts) return data.hr_shifts as any;
  const { data: def } = await supabase
    .from("hr_shifts")
    .select("*")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  return def;
}

function ymRange(ym: string) {
  // ym = "YYYY-MM"
  const [y, m] = ym.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    y,
    m,
  };
}

/* ================= EMPLOYEE PROFILE ================= */
export const getMyEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) return { employee: null, department: null, designation: null, manager: null };
    const [dept, desig, mgr] = await Promise.all([
      emp.department_id
        ? context.supabase.from("hr_departments").select("id,name").eq("id", emp.department_id).maybeSingle()
        : Promise.resolve({ data: null }),
      emp.designation_id
        ? context.supabase.from("hr_designations").select("id,name").eq("id", emp.designation_id).maybeSingle()
        : Promise.resolve({ data: null }),
      emp.manager_id
        ? context.supabase.from("hr_employees").select("id,full_name,display_name,photo_url").eq("id", emp.manager_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      employee: emp,
      department: (dept as any).data ?? null,
      designation: (desig as any).data ?? null,
      manager: (mgr as any).data ?? null,
    };
  });

/* ================= POST-LOGIN LANDING ================= */
/** Decide where this user should land after login.
 *  - Staff (has hr_employees row AND no admin/operations role) → /me
 *  - Everyone else (admin/ops/no employee row) → /erp
 */
export const getMyLanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [empRes, adminRes, opsRes] = await Promise.all([
      supabase.from("hr_employees").select("id").eq("user_id", userId).maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
    ]);
    const isStaff = !!empRes.data && !adminRes.data && !opsRes.data;
    return { to: isStaff ? "/me" : "/erp" } as const;
  });

/* ================= TODAY ================= */
export const getMyToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) return { employee: null, today: null, shift: null };
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: row }, shift] = await Promise.all([
      context.supabase
        .from("hr_attendance")
        .select(
          "id, date, status, check_in_time, check_out_time, break_start, break_end, late_min, ot_min, work_min, total_hours, source",
        )
        .eq("employee_id", emp.id)
        .eq("date", today)
        .maybeSingle(),
      getActiveShift(context.supabase, emp.id, today),
    ]);
    return { employee: emp, today: row, shift };
  });

/* ================= DASHBOARD STATS ================= */
export const getMyDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) return null;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    // ISO week start (Sunday-based for BD market)
    const d = new Date();
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const [monthRowsRes, weekRowsRes, balRes, payRes] = await Promise.all([
      context.supabase
        .from("hr_attendance")
        .select("date, status, late_min, ot_min, work_min, total_hours")
        .eq("employee_id", emp.id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      context.supabase
        .from("hr_attendance")
        .select("work_min, total_hours")
        .eq("employee_id", emp.id)
        .gte("date", weekStartStr),
      context.supabase
        .from("hr_leave_balances")
        .select("allocated, used, carried, hr_leave_types(name,color)")
        .eq("employee_id", emp.id)
        .eq("year", now.getUTCFullYear()),
      context.supabase
        .from("hr_payslips")
        .select("net_pay, gross, paid_at, hr_payroll_runs(month,year,status)")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const monthRows = monthRowsRes.data ?? [];
    const weekRows = weekRowsRes.data ?? [];
    const present = monthRows.filter((r: any) => ["present", "late", "half_day"].includes(r.status)).length;
    const lateCount = monthRows.filter((r: any) => r.status === "late").length;
    const absent = monthRows.filter((r: any) => r.status === "absent").length;
    const totalOt = monthRows.reduce((s: number, r: any) => s + (Number(r.ot_min) || 0), 0);
    const weekMin = weekRows.reduce((s: number, r: any) => s + (Number(r.work_min) || 0), 0);

    const balances = (balRes.data ?? []).map((b: any) => ({
      name: b.hr_leave_types?.name ?? "Leave",
      color: b.hr_leave_types?.color ?? "#64748b",
      remaining: Math.max(0, Number(b.allocated || 0) + Number(b.carried || 0) - Number(b.used || 0)),
    }));
    const leaveRemaining = balances.reduce((s, b) => s + b.remaining, 0);

    return {
      employee: emp,
      week_minutes: weekMin,
      month_present: present,
      month_late: lateCount,
      month_absent: absent,
      month_ot_minutes: totalOt,
      leave_remaining: leaveRemaining,
      balances,
      latest_payslips: payRes.data ?? [],
    };
  });

/* ================= ATTENDANCE MONTH ================= */
export const getMyAttendanceMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ ym: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) return { rows: [], holidays: [], leaves: [], range: null };
    const { from, to } = ymRange(data.ym);
    const [attRes, holRes, lvRes] = await Promise.all([
      context.supabase
        .from("hr_attendance")
        .select(
          "date, status, check_in_time, check_out_time, break_start, break_end, late_min, ot_min, work_min, total_hours, note",
        )
        .eq("employee_id", emp.id)
        .gte("date", from)
        .lte("date", to)
        .order("date"),
      context.supabase.from("hr_holidays").select("date, name, type").gte("date", from).lte("date", to),
      context.supabase
        .from("hr_leave_requests")
        .select("from_date, to_date, status, hr_leave_types(name,color)")
        .eq("employee_id", emp.id)
        .eq("status", "approved")
        .gte("from_date", from)
        .lte("to_date", to),
    ]);
    return {
      rows: attRes.data ?? [],
      holidays: holRes.data ?? [],
      leaves: lvRes.data ?? [],
      range: { from, to },
    };
  });

/* ================= PERFORMANCE ================= */
export const getMyPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ days: z.number().int().min(7).max(365).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) return null;
    const days = data.days ?? 90;
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data: rows } = await context.supabase
      .from("hr_attendance")
      .select("date, status, late_min, ot_min, work_min, total_hours")
      .eq("employee_id", emp.id)
      .gte("date", from)
      .order("date");

    const present = (rows ?? []).filter((r: any) => ["present", "late", "half_day"].includes(r.status));
    const punctual = present.filter((r: any) => r.status === "present").length;
    const lateCount = present.filter((r: any) => r.status === "late").length;
    const absent = (rows ?? []).filter((r: any) => r.status === "absent").length;
    const totalOt = (rows ?? []).reduce((s: number, r: any) => s + (Number(r.ot_min) || 0), 0);
    const totalWork = (rows ?? []).reduce((s: number, r: any) => s + (Number(r.work_min) || 0), 0);

    // Streak: consecutive on-time days from latest date going back
    const sorted = [...(rows ?? [])].sort((a: any, b: any) => b.date.localeCompare(a.date));
    let streak = 0;
    for (const r of sorted) {
      if (r.status === "present") streak++;
      else if (["late", "absent", "half_day"].includes(r.status)) break;
    }

    // Weekly buckets for sparkline
    const weekMap: Record<string, number> = {};
    (rows ?? []).forEach((r: any) => {
      const d = new Date(r.date);
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay());
      const k = ws.toISOString().slice(0, 10);
      weekMap[k] = (weekMap[k] || 0) + (Number(r.work_min) || 0);
    });
    const weekly = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, minutes]) => ({ week, minutes }));

    return {
      days,
      present_count: present.length,
      punctual_count: punctual,
      late_count: lateCount,
      absent_count: absent,
      attendance_pct: present.length + absent > 0 ? (present.length / (present.length + absent)) * 100 : 0,
      punctuality_pct: present.length > 0 ? (punctual / present.length) * 100 : 0,
      total_ot_minutes: totalOt,
      total_work_minutes: totalWork,
      streak,
      weekly,
    };
  });

/* ================= LEAVE ================= */
export const getMyLeaveData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) return { balances: [], requests: [], leaveTypes: [] };
    const year = new Date().getUTCFullYear();
    const [balRes, reqRes, typesRes] = await Promise.all([
      context.supabase
        .from("hr_leave_balances")
        .select("id, allocated, used, carried, encashed, leave_type_id, hr_leave_types(id,name,code,color,is_paid)")
        .eq("employee_id", emp.id)
        .eq("year", year),
      context.supabase
        .from("hr_leave_requests")
        .select("id, from_date, to_date, days, status, reason, is_half_day, half_day_part, decided_at, decision_note, hr_leave_types(name,color)")
        .eq("employee_id", emp.id)
        .order("from_date", { ascending: false })
        .limit(50),
      context.supabase
        .from("hr_leave_types")
        .select("id, name, color, is_paid, requires_approval, min_notice_days, max_carry_forward")
        .eq("is_active", true)
        .order("name"),
    ]);
    return {
      employee_id: emp.id,
      balances: balRes.data ?? [],
      requests: reqRes.data ?? [],
      leaveTypes: typesRes.data ?? [],
    };
  });

function daysBetween(from: string, to: string) {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export const applyMyLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      leave_type_id: z.string().uuid(),
      from_date: z.string(),
      to_date: z.string(),
      is_half_day: z.boolean().optional(),
      half_day_part: z.enum(["first", "second"]).nullable().optional(),
      reason: z.string().trim().max(500).nullable().optional(),
      contact_during_leave: z.string().trim().max(120).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) throw new Error("No employee record linked to your account");
    const days = data.is_half_day ? 0.5 : daysBetween(data.from_date, data.to_date);
    const { data: row, error } = await context.supabase
      .from("hr_leave_requests")
      .insert({
        employee_id: emp.id,
        leave_type_id: data.leave_type_id,
        from_date: data.from_date,
        to_date: data.to_date,
        is_half_day: !!data.is_half_day,
        half_day_part: data.half_day_part ?? null,
        reason: data.reason ?? null,
        contact_during_leave: data.contact_during_leave ?? null,
        days,
        status: "pending",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const cancelMyLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) throw new Error("No employee record linked");
    const { data: req } = await context.supabase
      .from("hr_leave_requests")
      .select("id, employee_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!req || req.employee_id !== emp.id) throw new Error("Not your request");
    if (req.status !== "pending") throw new Error("Only pending requests can be cancelled");
    const { error } = await context.supabase
      .from("hr_leave_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ================= PAYSLIPS ================= */
export const getMyPayslips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) return { rows: [], ytd: { gross: 0, net: 0, count: 0 } };
    const year = new Date().getUTCFullYear();
    const { data: rows } = await context.supabase
      .from("hr_payslips")
      .select(
        "id, basic, gross, net_pay, payment_status, paid_at, allowances, deductions, absent_deduction, late_deduction, overtime_earning, hr_payroll_runs(month, year, status)",
      )
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false })
      .limit(36);
    const ytdRows = (rows ?? []).filter((r: any) => r.hr_payroll_runs?.year === year);
    const ytd = {
      gross: ytdRows.reduce((s: number, r: any) => s + Number(r.gross || 0), 0),
      net: ytdRows.reduce((s: number, r: any) => s + Number(r.net_pay || 0), 0),
      count: ytdRows.length,
    };
    return { employee: emp, rows: rows ?? [], ytd };
  });

export const getMyPayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const emp = await getSelfEmployee(context.supabase, context.userId);
    if (!emp) throw new Error("No employee linked");
    const { data: row, error } = await context.supabase
      .from("hr_payslips")
      .select("*, hr_payroll_runs(month, year, status)")
      .eq("id", data.id)
      .eq("employee_id", emp.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Not found");
    return row;
  });