import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAccess(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_hr_access", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("HR access required");
}

/** Resolve today's active shift for an employee. */
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

function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function statusFromPunchIn(shift: any, checkIn: Date): { status: string; late_min: number } {
  if (!shift?.start_time) return { status: "present", late_min: 0 };
  const [h, m] = String(shift.start_time).split(":").map(Number);
  const grace = Number(shift.grace_minutes ?? 0);
  const halfDayAfter = Number(shift.half_day_after_min ?? 0);
  const start = new Date(checkIn);
  start.setHours(h, m, 0, 0);
  const diff = Math.round((checkIn.getTime() - start.getTime()) / 60000);
  if (diff <= grace) return { status: "present", late_min: 0 };
  if (halfDayAfter > 0 && diff >= halfDayAfter) return { status: "half_day", late_min: diff };
  return { status: "late", late_min: diff };
}

/* =================== PUNCH IN =================== */
export const punchIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      employee_id: z.string().uuid(),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      selfie_url: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const shift = await getActiveShift(context.supabase, data.employee_id, today);
    const { status, late_min } = statusFromPunchIn(shift, now);

    const { data: existing } = await context.supabase
      .from("hr_attendance")
      .select("id, check_in_time")
      .eq("employee_id", data.employee_id)
      .eq("date", today)
      .maybeSingle();
    if (existing?.check_in_time) {
      throw new Error("Already checked in today");
    }

    const payload: any = {
      employee_id: data.employee_id,
      date: today,
      check_in_time: now.toISOString(),
      in_time: now.toISOString(),
      shift_id: shift?.id ?? null,
      status,
      late_min,
      source: "web",
      marked_by: context.userId,
      check_in_lat: data.lat ?? null,
      check_in_lng: data.lng ?? null,
      selfie_url: data.selfie_url ?? null,
      note: data.note ?? null,
    };
    if (existing) {
      const { data: row, error } = await context.supabase
        .from("hr_attendance")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    } else {
      const { data: row, error } = await context.supabase
        .from("hr_attendance")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
  });

/* =================== BREAK =================== */
export const punchBreak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      employee_id: z.string().uuid(),
      action: z.enum(["start", "end"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data: row } = await context.supabase
      .from("hr_attendance")
      .select("id, check_in_time, break_start, break_end")
      .eq("employee_id", data.employee_id)
      .eq("date", today)
      .maybeSingle();
    if (!row?.check_in_time) throw new Error("Check in first");
    const patch: any = {};
    if (data.action === "start") {
      if (row.break_start && !row.break_end) throw new Error("Already on break");
      patch.break_start = new Date().toISOString();
      patch.break_end = null;
    } else {
      if (!row.break_start) throw new Error("No break started");
      patch.break_end = new Date().toISOString();
    }
    const { error } = await context.supabase
      .from("hr_attendance")
      .update(patch)
      .eq("id", row.id);
    if (error) throw error;
    return { ok: true };
  });

/* =================== PUNCH OUT =================== */
export const punchOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      employee_id: z.string().uuid(),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data: row } = await context.supabase
      .from("hr_attendance")
      .select("id, check_in_time, break_start, break_end")
      .eq("employee_id", data.employee_id)
      .eq("date", today)
      .maybeSingle();
    if (!row?.check_in_time) throw new Error("Check in first");
    const now = new Date();
    const checkIn = new Date(row.check_in_time);
    let breakMin = 0;
    if (row.break_start && row.break_end) {
      breakMin = minutesBetween(new Date(row.break_start), new Date(row.break_end));
    }
    const totalMin = minutesBetween(checkIn, now) - breakMin;
    const total_hours = Math.round((totalMin / 60) * 100) / 100;

    const { error } = await context.supabase
      .from("hr_attendance")
      .update({
        check_out_time: now.toISOString(),
        out_time: now.toISOString(),
        check_out_lat: data.lat ?? null,
        check_out_lng: data.lng ?? null,
        total_hours,
        work_min: totalMin,
      })
      .eq("id", row.id);
    if (error) throw error;
    return { ok: true, total_hours };
  });

/* =================== TODAY STATUS =================== */
export const getTodayPunchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ employeeIds: z.array(z.string().uuid()).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("hr_attendance")
      .select(
        "employee_id, status, check_in_time, check_out_time, break_start, break_end, late_min, total_hours, selfie_url, check_in_lat, check_in_lng",
      )
      .eq("date", today);
    if (data.employeeIds?.length) q = q.in("employee_id", data.employeeIds);
    const { data: rows, error } = await q;
    if (error) throw error;
    const map: Record<string, any> = {};
    for (const r of rows ?? []) map[(r as any).employee_id] = r;
    return map;
  });

/* =================== ATTENDANCE CELL DETAILS (for muster click) =================== */
export const getAttendanceCell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ employee_id: z.string().uuid(), date: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("hr_attendance")
      .select("*")
      .eq("employee_id", data.employee_id)
      .eq("date", data.date)
      .maybeSingle();
    if (error) throw error;
    let selfieSignedUrl: string | null = null;
    if (row?.selfie_url) {
      const m = row.selfie_url.match(/hr-attendance-selfies\/(.+)$/);
      const path = m ? m[1] : row.selfie_url;
      const { data: s } = await context.supabase.storage
        .from("hr-attendance-selfies")
        .createSignedUrl(path, 3600);
      selfieSignedUrl = s?.signedUrl ?? null;
    }
    return { row, selfieSignedUrl };
  });