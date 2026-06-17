import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LeaveKpis } from "./types";

async function assertAccess(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_hr_access", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("HR access required");
}
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_hr_admin", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("HR admin only");
}
function daysBetween(from: string, to: string) {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

/* ---------- Leave Types ---------- */
export const listLeaveTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("hr_leave_types").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  });

export const upsertLeaveType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    code: z.string().min(1),
    color: z.string().optional(),
    is_paid: z.boolean().optional(),
    default_days_per_year: z.number().optional(),
    max_carry_forward: z.number().optional(),
    requires_approval: z.boolean().optional(),
    min_notice_days: z.number().int().optional(),
    applies_to_gender: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    description: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase.from("hr_leave_types").upsert(payload).select().single();
    if (error) throw error;
    return row;
  });

export const deleteLeaveType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_leave_types").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Leave Balances ---------- */
export const getEmployeeBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    employeeId: z.string().uuid(),
    year: z.number().int().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const year = data.year ?? new Date().getFullYear();
    const [balRes, typesRes] = await Promise.all([
      context.supabase.from("hr_leave_balances").select("*").eq("employee_id", data.employeeId).eq("year", year),
      context.supabase.from("hr_leave_types").select("*").eq("is_active", true).order("name"),
    ]);
    if (balRes.error) throw balRes.error;
    const balMap = new Map((balRes.data ?? []).map((b: any) => [b.leave_type_id, b]));
    return (typesRes.data ?? []).map((t: any) => {
      const b: any = balMap.get(t.id);
      return {
        leave_type: t,
        year,
        allocated: Number(b?.allocated ?? t.default_days_per_year ?? 0),
        used: Number(b?.used ?? 0),
        carried: Number(b?.carried ?? 0),
        encashed: Number(b?.encashed ?? 0),
        remaining: Number(b?.allocated ?? t.default_days_per_year ?? 0) + Number(b?.carried ?? 0) - Number(b?.used ?? 0),
      };
    });
  });

export const setBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    employee_id: z.string().uuid(),
    leave_type_id: z.string().uuid(),
    year: z.number().int(),
    allocated: z.number().optional(),
    carried: z.number().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("hr_leave_balances")
      .upsert({
        employee_id: data.employee_id,
        leave_type_id: data.leave_type_id,
        year: data.year,
        allocated: data.allocated ?? 0,
        carried: data.carried ?? 0,
      }, { onConflict: "employee_id,leave_type_id,year" })
      .select().single();
    if (error) throw error;
    return row;
  });

export const allocateYearlyBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ year: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [empsRes, typesRes] = await Promise.all([
      context.supabase.from("hr_employees").select("id").neq("status","terminated").neq("status","resigned"),
      context.supabase.from("hr_leave_types").select("id, default_days_per_year").eq("is_active", true),
    ]);
    if (empsRes.error) throw empsRes.error;
    if (typesRes.error) throw typesRes.error;
    const rows: any[] = [];
    for (const e of empsRes.data ?? []) {
      for (const t of typesRes.data ?? []) {
        rows.push({ employee_id: e.id, leave_type_id: t.id, year: data.year, allocated: Number(t.default_days_per_year ?? 0) });
      }
    }
    if (!rows.length) return { ok: true, count: 0 };
    const { error } = await context.supabase.from("hr_leave_balances").upsert(rows, { onConflict: "employee_id,leave_type_id,year", ignoreDuplicates: true });
    if (error) throw error;
    return { ok: true, count: rows.length };
  });

/* ---------- Leave Requests ---------- */
export const listLeaveRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    status: z.string().optional(),
    employeeId: z.string().uuid().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    let q = context.supabase
      .from("hr_leave_requests")
      .select("*, employee:hr_employees(id, full_name, employee_code, photo_url, department_id), leave_type:hr_leave_types(id, name, code, color, is_paid)");
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.employeeId) q = q.eq("employee_id", data.employeeId);
    if (data.from) q = q.gte("from_date", data.from);
    if (data.to) q = q.lte("to_date", data.to);
    q = q.order("created_at", { ascending: false }).limit(500);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const applyLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    employee_id: z.string().uuid(),
    leave_type_id: z.string().uuid(),
    from_date: z.string(),
    to_date: z.string(),
    is_half_day: z.boolean().optional(),
    half_day_part: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    contact_during_leave: z.string().nullable().optional(),
    attachment_url: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const days = data.is_half_day ? 0.5 : daysBetween(data.from_date, data.to_date);
    const { data: row, error } = await context.supabase.from("hr_leave_requests")
      .insert({ ...data, days, created_by: context.userId })
      .select().single();
    if (error) throw error;
    return row;
  });

export const decideLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid(),
    decision: z.enum(["approved","rejected"]),
    decision_note: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: req, error: e0 } = await context.supabase.from("hr_leave_requests").select("*").eq("id", data.id).maybeSingle();
    if (e0) throw e0;
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already decided");

    const { data: row, error } = await context.supabase
      .from("hr_leave_requests")
      .update({
        status: data.decision,
        decision_note: data.decision_note ?? null,
        approver_id: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select().single();
    if (error) throw error;

    if (data.decision === "approved") {
      const year = new Date(req.from_date).getFullYear();
      const { data: bal } = await context.supabase
        .from("hr_leave_balances")
        .select("*")
        .eq("employee_id", req.employee_id)
        .eq("leave_type_id", req.leave_type_id)
        .eq("year", year)
        .maybeSingle();
      await context.supabase.from("hr_leave_balances").upsert({
        id: bal?.id,
        employee_id: req.employee_id,
        leave_type_id: req.leave_type_id,
        year,
        allocated: Number(bal?.allocated ?? 0),
        carried: Number(bal?.carried ?? 0),
        used: Number(bal?.used ?? 0) + Number(req.days),
      }, { onConflict: "employee_id,leave_type_id,year" });
    }
    return row;
  });

export const cancelLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("hr_leave_requests").update({ status: "cancelled" }).eq("id", data.id).select().single();
    if (error) throw error;
    return row;
  });

export const getLeaveKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeaveKpis> => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().slice(0, 10);

    const [pendingR, monthR, todayR, upcomingR] = await Promise.all([
      context.supabase.from("hr_leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      context.supabase.from("hr_leave_requests").select("status, decided_at").gte("decided_at", ms),
      context.supabase.from("hr_leave_requests").select("id").eq("status", "approved").lte("from_date", today).gte("to_date", today),
      context.supabase.from("hr_leave_requests").select("id, from_date, to_date, days, employee:hr_employees(full_name), leave_type:hr_leave_types(name, color)").eq("status", "approved").gte("from_date", today).order("from_date").limit(8),
    ]);

    let approvedThisMonth = 0, rejectedThisMonth = 0;
    for (const r of monthR.data ?? []) {
      if (r.status === "approved") approvedThisMonth++;
      if (r.status === "rejected") rejectedThisMonth++;
    }

    return {
      pending: pendingR.count ?? 0,
      approvedThisMonth,
      rejectedThisMonth,
      onLeaveToday: (todayR.data ?? []).length,
      upcoming: (upcomingR.data ?? []).map((r: any) => ({
        id: r.id,
        employee_name: r.employee?.full_name ?? "—",
        from_date: r.from_date,
        to_date: r.to_date,
        days: Number(r.days),
        type: r.leave_type?.name ?? "—",
        color: r.leave_type?.color ?? "#6366f1",
      })),
    };
  });
