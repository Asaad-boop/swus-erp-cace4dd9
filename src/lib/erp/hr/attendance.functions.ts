import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AttendanceKpis } from "./types";

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

/* ---------- Shifts ---------- */
export const listShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("hr_shifts").select("*").order("name");
    if (error) throw error;
    return data ?? [];
  });

export const upsertShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    code: z.string().nullable().optional(),
    start_time: z.string(),
    end_time: z.string(),
    break_minutes: z.number().int().min(0).optional(),
    grace_minutes: z.number().int().min(0).optional(),
    half_day_after_min: z.number().int().min(0).optional(),
    is_night: z.boolean().optional(),
    is_default: z.boolean().optional(),
    is_active: z.boolean().optional(),
    description: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase.from("hr_shifts").upsert(payload).select().single();
    if (error) throw error;
    return row;
  });

export const deleteShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_shifts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Holidays ---------- */
export const listHolidays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    year: z.number().int().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const year = data.year ?? new Date().getFullYear();
    const { data: rows, error } = await context.supabase
      .from("hr_holidays")
      .select("*")
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`)
      .order("date");
    if (error) throw error;
    return rows ?? [];
  });

export const upsertHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid().optional(),
    date: z.string(),
    name: z.string().min(1),
    type: z.string().optional(),
    is_optional: z.boolean().optional(),
    description: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase.from("hr_holidays").upsert(payload).select().single();
    if (error) throw error;
    return row;
  });

export const deleteHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_holidays").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Attendance ---------- */
function diffMin(from: string | Date, to: string | Date) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

export const listAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    from: z.string(),
    to: z.string(),
    employeeId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    status: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    let q = context.supabase
      .from("hr_attendance")
      .select("*, employee:hr_employees(id, full_name, employee_code, department_id, photo_url)")
      .gte("date", data.from)
      .lte("date", data.to);
    if (data.employeeId) q = q.eq("employee_id", data.employeeId);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    q = q.order("date", { ascending: false }).order("employee_id");
    const { data: rows, error } = await q;
    if (error) throw error;
    let result = rows ?? [];
    if (data.departmentId && data.departmentId !== "all") {
      result = result.filter((r: any) => r.employee?.department_id === data.departmentId);
    }
    return result;
  });

export const markAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    employee_id: z.string().uuid(),
    date: z.string(),
    in_time: z.string().nullable().optional(),
    out_time: z.string().nullable().optional(),
    status: z.enum(["present","absent","late","half_day","leave","holiday","week_off"]).optional(),
    note: z.string().nullable().optional(),
    source: z.string().optional(),
    shift_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let work_min = 0, ot_min = 0, late_min = 0;
    if (data.in_time && data.out_time) {
      work_min = diffMin(data.in_time, data.out_time);
      const std = 480;
      if (work_min > std) ot_min = work_min - std;
    }
    if (data.in_time && data.shift_id) {
      const { data: shift } = await context.supabase.from("hr_shifts").select("start_time, grace_minutes").eq("id", data.shift_id).maybeSingle();
      if (shift) {
        const [sh, sm] = String(shift.start_time).split(":").map(Number);
        const shiftStart = new Date(data.date + "T00:00:00");
        shiftStart.setHours(sh, sm + (shift.grace_minutes ?? 0), 0, 0);
        const inT = new Date(data.in_time);
        if (inT > shiftStart) late_min = diffMin(shiftStart, inT);
      }
    }
    const payload: any = {
      employee_id: data.employee_id,
      date: data.date,
      in_time: data.in_time ?? null,
      out_time: data.out_time ?? null,
      shift_id: data.shift_id ?? null,
      status: data.status ?? (data.in_time ? (late_min > 0 ? "late" : "present") : "absent"),
      source: data.source ?? "manual",
      note: data.note ?? null,
      work_min, ot_min, late_min,
      marked_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("hr_attendance")
      .upsert(payload, { onConflict: "employee_id,date" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const bulkMarkAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    date: z.string(),
    employee_ids: z.array(z.string().uuid()),
    status: z.enum(["present","absent","leave","holiday","week_off"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const rows = data.employee_ids.map((id) => ({
      employee_id: id,
      date: data.date,
      status: data.status,
      source: "manual",
      marked_by: context.userId,
    }));
    const { error } = await context.supabase.from("hr_attendance").upsert(rows, { onConflict: "employee_id,date" });
    if (error) throw error;
    return { ok: true, count: rows.length };
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_attendance").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getMusterRoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    departmentId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const from = `${data.year}-${String(data.month).padStart(2,"0")}-01`;
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const to = `${data.year}-${String(data.month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

    let empQ = context.supabase.from("hr_employees").select("id, full_name, employee_code, department_id, photo_url").neq("status", "terminated").neq("status", "resigned");
    if (data.departmentId && data.departmentId !== "all") empQ = empQ.eq("department_id", data.departmentId);
    const { data: emps, error: e1 } = await empQ.order("full_name");
    if (e1) throw e1;

    const { data: att, error: e2 } = await context.supabase
      .from("hr_attendance")
      .select("employee_id, date, status, late_min, ot_min, work_min")
      .gte("date", from).lte("date", to);
    if (e2) throw e2;

    const { data: hols } = await context.supabase
      .from("hr_holidays")
      .select("date, name")
      .gte("date", from).lte("date", to);

    const map = new Map<string, Map<string, any>>();
    for (const r of att ?? []) {
      if (!map.has(r.employee_id)) map.set(r.employee_id, new Map());
      map.get(r.employee_id)!.set(r.date, r);
    }

    return {
      from, to, lastDay,
      employees: emps ?? [],
      attendance: Object.fromEntries(Array.from(map.entries()).map(([k, v]) => [k, Object.fromEntries(v)])),
      holidays: (hols ?? []).reduce((acc: any, h: any) => { acc[h.date] = h.name; return acc; }, {}),
    };
  });

export const getAttendanceKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ date: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<AttendanceKpis> => {
    await assertAccess(context.supabase, context.userId);
    const { data: emps } = await context.supabase
      .from("hr_employees").select("id, status").neq("status", "terminated").neq("status", "resigned");
    const total = (emps ?? []).length;
    const { data: att } = await context.supabase
      .from("hr_attendance").select("status, work_min, ot_min").eq("date", data.date);
    let present = 0, late = 0, onLeave = 0, totalWork = 0, totalOt = 0, count = 0;
    for (const r of att ?? []) {
      if (r.status === "present") present++;
      if (r.status === "late") { present++; late++; }
      if (r.status === "half_day") present++;
      if (r.status === "leave") onLeave++;
      if (r.work_min) { totalWork += r.work_min; count++; }
      if (r.ot_min) totalOt += r.ot_min;
    }
    const absent = Math.max(0, total - present - onLeave);
    return {
      totalEmployees: total,
      present, late, absent, onLeave,
      avgWorkHours: count ? +(totalWork / count / 60).toFixed(1) : 0,
      totalOtHours: +(totalOt / 60).toFixed(1),
    };
  });
