import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
async function assertSalary(supabase: any, userId: string) {
  const { data: a } = await supabase.rpc("has_hr_admin", { _user_id: userId });
  if (a) return;
  const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (r ?? []).map((x: any) => x.role);
  if (!roles.includes("admin") && !roles.includes("operations")) {
    throw new Error("Salary access requires admin or operations role");
  }
}

/* ============ BULK EMPLOYEE OPS ============ */
export const bulkUpdateEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      ids: z.array(z.string().uuid()).min(1),
      patch: z.object({
        status: z.string().optional(),
        department_id: z.string().uuid().nullable().optional(),
        designation_id: z.string().uuid().nullable().optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("hr_employees")
      .update(data.patch)
      .in("id", data.ids);
    if (error) throw error;
    return { ok: true, count: data.ids.length };
  });

export const setEmployeePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ id: z.string().uuid(), photo_url: z.string().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("hr_employees")
      .update({ photo_url: data.photo_url })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ============ SALARY ============ */
export const updateSalaryStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      id: z.string().uuid(),
      gross_salary: z.number().nullable(),
      salary_structure: z.object({
        basic: z.number(),
        allowances: z.record(z.string(), z.number()),
        deductions: z.record(z.string(), z.number()),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSalary(context.supabase, context.userId);
    const { data: prev } = await context.supabase
      .from("hr_employees")
      .select("gross_salary, salary_structure")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase
      .from("hr_employees")
      .update({
        gross_salary: data.gross_salary,
        salary_structure: data.salary_structure,
      })
      .eq("id", data.id);
    if (error) throw error;
    if (prev && prev.gross_salary !== data.gross_salary) {
      await context.supabase.from("hr_employment_history").insert({
        employee_id: data.id,
        event_type: "salary_revision",
        event_date: new Date().toISOString().slice(0, 10),
        from_value: { gross_salary: prev.gross_salary, salary_structure: prev.salary_structure },
        to_value: { gross_salary: data.gross_salary, salary_structure: data.salary_structure },
        created_by: context.userId,
      });
    }
    return { ok: true };
  });

/* ============ DOCUMENTS ============ */
export const listEmployeeDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ employeeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("hr_documents")
      .select("*")
      .eq("employee_id", data.employeeId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const recordEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      employee_id: z.string().uuid(),
      doc_type: z.string().min(1),
      title: z.string().min(1),
      file_url: z.string().min(1),
      file_name: z.string().optional(),
      mime_type: z.string().optional(),
      file_size: z.number().int().optional(),
      issue_date: z.string().nullable().optional(),
      expiry_date: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("hr_documents")
      .insert({ ...data, uploaded_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ id: z.string().uuid(), file_url: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_documents").delete().eq("id", data.id);
    if (error) throw error;
    if (data.file_url) {
      const m = data.file_url.match(/hr-documents\/(.+)$/);
      if (m) await context.supabase.storage.from("hr-documents").remove([m[1]]);
    }
    return { ok: true };
  });

export const getExpiringDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("hr_documents")
      .select("id, employee_id, doc_type, title, expiry_date")
      .gte("expiry_date", today)
      .lte("expiry_date", in30)
      .order("expiry_date");
    if (error) throw error;
    return data ?? [];
  });

/* ============ HISTORY ============ */
export const listEmploymentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ employeeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("hr_employment_history")
      .select("*")
      .eq("employee_id", data.employeeId)
      .order("event_date", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const addEmploymentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      employee_id: z.string().uuid(),
      event_type: z.string().min(1),
      event_date: z.string().min(1),
      from_value: z.any().optional(),
      to_value: z.any().optional(),
      notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("hr_employment_history")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/* ============ EMPLOYEE SUMMARY (attendance + leave snapshot) ============ */
export const getEmployeeSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ employeeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date();
    const from = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const year = today.getFullYear();

    const [attRes, balRes, typesRes, shiftRes] = await Promise.all([
      context.supabase
        .from("hr_attendance")
        .select("date, status, late_min, work_min, total_hours, check_in_time, check_out_time")
        .eq("employee_id", data.employeeId)
        .gte("date", from)
        .order("date"),
      context.supabase
        .from("hr_leave_balances")
        .select("*")
        .eq("employee_id", data.employeeId)
        .eq("year", year),
      context.supabase.from("hr_leave_types").select("id, name, code, color"),
      context.supabase
        .from("hr_employee_shifts")
        .select("id, shift_id, effective_from, effective_to, hr_shifts(name, start_time, end_time)")
        .eq("employee_id", data.employeeId)
        .order("effective_from", { ascending: false }),
    ]);
    if (attRes.error) throw attRes.error;
    if (balRes.error) throw balRes.error;

    const typeMap = new Map((typesRes.data ?? []).map((t: any) => [t.id, t]));
    const balances = (balRes.data ?? []).map((b: any) => ({
      ...b,
      type: typeMap.get(b.leave_type_id),
      remaining: Number(b.allocated ?? 0) + Number(b.carried ?? 0) - Number(b.used ?? 0) - Number(b.encashed ?? 0),
    }));
    return {
      attendance: attRes.data ?? [],
      balances,
      shifts: shiftRes.data ?? [],
    };
  });

/* ============ BULK EXPORT ============ */
export const exportEmployeesData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ ids: z.array(z.string().uuid()).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    let q = context.supabase
      .from("hr_employees")
      .select(
        "employee_code, full_name, email, phone, gender, date_of_birth, joining_date, status, employment_type, department_id, designation_id, gross_salary, bank_name, bank_account_no, nid",
      );
    if (data.ids && data.ids.length) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw error;
    const [{ data: depts }, { data: desigs }] = await Promise.all([
      context.supabase.from("hr_departments").select("id, name"),
      context.supabase.from("hr_designations").select("id, title"),
    ]);
    const dmap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
    const dsmap = new Map((desigs ?? []).map((d: any) => [d.id, d.title]));
    return (rows ?? []).map((r: any) => ({
      ...r,
      department: dmap.get(r.department_id) ?? "",
      designation: dsmap.get(r.designation_id) ?? "",
      department_id: undefined,
      designation_id: undefined,
    }));
  });

/* ============ SHIFT ASSIGNMENT ============ */
export const getCurrentShiftMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("hr_employee_shifts")
      .select("employee_id, shift_id, effective_from, effective_to, hr_shifts(name, start_time, end_time)")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`);
    if (error) throw error;
    const map: Record<string, any> = {};
    for (const r of (data ?? []) as any[]) {
      const cur = map[r.employee_id];
      if (!cur || new Date(r.effective_from) > new Date(cur.effective_from)) map[r.employee_id] = r;
    }
    return map;
  });

export const assignShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      employee_id: z.string().uuid(),
      shift_id: z.string().uuid(),
      effective_from: z.string().min(1),
      effective_to: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("hr_employee_shifts")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const bulkAssignShiftByDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      department_id: z.string().uuid(),
      shift_id: z.string().uuid(),
      effective_from: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: emps, error } = await context.supabase
      .from("hr_employees")
      .select("id")
      .eq("department_id", data.department_id)
      .eq("status", "active");
    if (error) throw error;
    if (!emps?.length) return { ok: true, count: 0 };
    const rows = emps.map((e: any) => ({
      employee_id: e.id,
      shift_id: data.shift_id,
      effective_from: data.effective_from,
    }));
    const { error: ie } = await context.supabase.from("hr_employee_shifts").insert(rows);
    if (ie) throw ie;
    return { ok: true, count: rows.length };
  });