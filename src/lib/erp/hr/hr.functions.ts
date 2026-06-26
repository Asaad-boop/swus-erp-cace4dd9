import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { HrEmployee, HrKpis } from "./types";

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

/* ================ DEPARTMENTS ================ */
export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("hr_departments")
      .select("*")
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    code: z.string().nullable().optional(),
    parent_id: z.string().uuid().nullable().optional(),
    head_employee_id: z.string().uuid().nullable().optional(),
    description: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase
      .from("hr_departments")
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_departments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ================ DESIGNATIONS ================ */
export const listDesignations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("hr_designations")
      .select("*")
      .order("title");
    if (error) throw error;
    return data ?? [];
  });

export const upsertDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(1),
    department_id: z.string().uuid().nullable().optional(),
    level: z.number().int().nullable().optional(),
    description: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase
      .from("hr_designations")
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_designations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ================ EMPLOYEES ================ */
const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  employee_code: z.string().optional(),
  user_id: z.string().uuid().nullable().optional(),
  full_name: z.string().min(1),
  display_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
  alt_phone: z.string().nullable().optional(),
  gender: z.enum(["male","female","other"]).nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  marital_status: z.string().nullable().optional(),
  blood_group: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  nid: z.string().nullable().optional(),
  passport: z.string().nullable().optional(),
  tin: z.string().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  status: z.enum(["active","probation","on_leave","suspended","terminated","resigned","retired"]).optional(),
  employment_type: z.enum(["full_time","part_time","contract","intern","consultant"]).nullable().optional(),
  joining_date: z.string().optional(),
  confirmation_date: z.string().nullable().optional(),
  probation_months: z.number().int().nullable().optional(),
  exit_date: z.string().nullable().optional(),
  exit_reason: z.string().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  designation_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  brand_ids: z.array(z.string().uuid()).optional(),
  work_location: z.string().nullable().optional(),
  work_email: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_branch: z.string().nullable().optional(),
  bank_account_no: z.string().nullable().optional(),
  bank_routing: z.string().nullable().optional(),
  mfs_provider: z.string().nullable().optional(),
  mfs_number: z.string().nullable().optional(),
  gross_salary: z.number().nullable().optional(),
  currency: z.string().optional(),
  present_address: z.string().nullable().optional(),
  permanent_address: z.string().nullable().optional(),
  emergency_name: z.string().nullable().optional(),
  emergency_relation: z.string().nullable().optional(),
  emergency_phone: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

export const listEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    search: z.string().optional(),
    status: z.string().optional(),
    departmentId: z.string().optional(),
    designationId: z.string().optional(),
    employmentType: z.string().optional(),
    brandIds: z.array(z.string()).optional(),
    managerId: z.string().optional(),
    tag: z.string().optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 50;
    let q = context.supabase.from("hr_employees").select("*", { count: "exact" });
    if (data.search) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`full_name.ilike.${s},employee_code.ilike.${s},email.ilike.${s},phone.ilike.${s},nid.ilike.${s}`);
    }
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.departmentId && data.departmentId !== "all") q = q.eq("department_id", data.departmentId);
    if (data.designationId && data.designationId !== "all") q = q.eq("designation_id", data.designationId);
    if (data.employmentType && data.employmentType !== "all") q = q.eq("employment_type", data.employmentType);
    if (data.managerId && data.managerId !== "all") q = q.eq("manager_id", data.managerId);
    if (data.tag && data.tag !== "all") q = q.contains("tags", [data.tag]);
    if (data.brandIds && data.brandIds.length) {
      // Include rows scoped to one of these brands OR rows with no brand scoping (visible to all).
      const list = data.brandIds.map((b) => `"${b}"`).join(",");
      q = q.or(`brand_ids.ov.{${data.brandIds.join(",")}},brand_ids.is.null,brand_ids.eq.{}`);
      void list;
    }
    q = q.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return { rows: (rows ?? []) as HrEmployee[], total: count ?? 0 };
  });

export const getEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const [empRes, histRes, docsRes] = await Promise.all([
      context.supabase.from("hr_employees").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("hr_employment_history").select("*").eq("employee_id", data.id).order("event_date", { ascending: false }),
      context.supabase.from("hr_documents").select("*").eq("employee_id", data.id).order("created_at", { ascending: false }),
    ]);
    if (empRes.error) throw empRes.error;
    if (!empRes.data) throw new Error("Employee not found");
    return {
      employee: empRes.data as HrEmployee,
      history: histRes.data ?? [],
      documents: docsRes.data ?? [],
    };
  });

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => employeeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let code = data.employee_code;
    if (!code) {
      const { data: c, error: ce } = await context.supabase.rpc("hr_next_employee_code");
      if (ce) throw ce;
      code = c as string;
    }
    const payload: any = { ...data, employee_code: code, created_by: context.userId };
    if (payload.email === "") payload.email = null;
    delete payload.id;
    // Auto-link to auth user by email if user_id not provided.
    if (!payload.user_id && payload.email) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const match = list?.users?.find(
          (u: any) => u.email?.toLowerCase() === String(payload.email).toLowerCase(),
        );
        if (match) payload.user_id = match.id;
      } catch { /* ignore */ }
    }
    const { data: row, error } = await context.supabase
      .from("hr_employees")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    await context.supabase.from("hr_employment_history").insert({
      employee_id: row.id,
      event_type: "joined",
      event_date: row.joining_date,
      to_value: { status: row.status, department_id: row.department_id, designation_id: row.designation_id, gross_salary: row.gross_salary },
      created_by: context.userId,
    });
    return row as HrEmployee;
  });

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => employeeSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...rest } = data as any;
    if (rest.email === "") rest.email = null;
    const { data: prev } = await context.supabase.from("hr_employees").select("*").eq("id", id).maybeSingle();
    const { data: row, error } = await context.supabase
      .from("hr_employees")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (prev) {
      const changes: { event_type: string; from: any; to: any }[] = [];
      if (prev.gross_salary !== row.gross_salary) changes.push({ event_type: "salary_change", from: { gross_salary: prev.gross_salary }, to: { gross_salary: row.gross_salary } });
      if (prev.designation_id !== row.designation_id) changes.push({ event_type: "designation_change", from: { designation_id: prev.designation_id }, to: { designation_id: row.designation_id } });
      if (prev.department_id !== row.department_id) changes.push({ event_type: "department_change", from: { department_id: prev.department_id }, to: { department_id: row.department_id } });
      if (prev.status !== row.status && row.status === "terminated") changes.push({ event_type: "exit", from: { status: prev.status }, to: { status: row.status, exit_date: row.exit_date, exit_reason: row.exit_reason } });
      if (changes.length) {
        await context.supabase.from("hr_employment_history").insert(
          changes.map((c) => ({
            employee_id: id,
            event_type: c.event_type,
            event_date: new Date().toISOString().slice(0, 10),
            from_value: c.from,
            to_value: c.to,
            created_by: context.userId,
          })),
        );
      }
    }
    return row as HrEmployee;
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("hr_employees").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ================ KPIS ================ */
export const getHrKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HrKpis> => {
    await assertAccess(context.supabase, context.userId);
    const { data: emps, error } = await context.supabase
      .from("hr_employees")
      .select("id, full_name, status, joining_date, exit_date, date_of_birth, department_id, gross_salary")
      .limit(5000);
    if (error) throw error;
    const { data: depts } = await context.supabase.from("hr_departments").select("id, name");
    const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let active = 0, probation = 0, onLeave = 0, newThisMonth = 0, exitsThisMonth = 0, payroll = 0;
    const byDept = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const birthdays: HrKpis["upcomingBirthdays"] = [];
    const annivs: HrKpis["upcomingAnniversaries"] = [];
    const daysUntil = (m: number, d: number) => {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let target = new Date(now.getFullYear(), m, d);
      if (target.getTime() < today.getTime()) target = new Date(now.getFullYear() + 1, m, d);
      return Math.round((target.getTime() - today.getTime()) / 86400000);
    };
    for (const e of (emps ?? []) as any[]) {
      byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
      if (e.status === "active") active++;
      if (e.status === "probation") probation++;
      if (e.status === "on_leave") onLeave++;
      if (e.gross_salary && !["terminated","resigned","retired"].includes(e.status)) payroll += Number(e.gross_salary);
      if (e.joining_date && new Date(e.joining_date).getTime() >= monthStart) newThisMonth++;
      if (e.exit_date && new Date(e.exit_date).getTime() >= monthStart) exitsThisMonth++;
      if (e.department_id) {
        const name = deptMap.get(e.department_id) || "—";
        byDept.set(name, (byDept.get(name) ?? 0) + 1);
      }
      if (e.date_of_birth) {
        const dob = new Date(e.date_of_birth);
        const inDays = daysUntil(dob.getMonth(), dob.getDate());
        if (inDays <= 30) birthdays.push({ id: e.id, name: e.full_name, date: e.date_of_birth, in: inDays });
      }
      if (e.joining_date) {
        const jd = new Date(e.joining_date);
        const inDays = daysUntil(jd.getMonth(), jd.getDate());
        const years = now.getFullYear() - jd.getFullYear() + (inDays === 0 ? 0 : 0);
        if (inDays <= 30 && years >= 1) annivs.push({ id: e.id, name: e.full_name, years, date: e.joining_date, in: inDays });
      }
    }
    birthdays.sort((a, b) => a.in - b.in);
    annivs.sort((a, b) => a.in - b.in);
    return {
      headcount: (emps ?? []).length,
      active, probation, onLeave, newThisMonth, exitsThisMonth,
      totalMonthlyPayroll: payroll,
      byDepartment: Array.from(byDept.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
      upcomingBirthdays: birthdays.slice(0, 8),
      upcomingAnniversaries: annivs.slice(0, 8),
    };
  });

/* ================ SETTINGS ================ */
export const getHrSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("hr_settings").select("*").is("brand_id", null).maybeSingle();
    if (error) throw error;
    return data;
  });

export const updateHrSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid(),
    default_currency: z.string().optional(),
    weekly_off_days: z.array(z.number().int().min(0).max(6)).optional(),
    work_hours_per_day: z.number().min(0).max(24).optional(),
    probation_months: z.number().int().min(0).optional(),
    employee_code_prefix: z.string().min(1).optional(),
    employee_code_padding: z.number().int().min(1).max(10).optional(),
    fiscal_year_start_month: z.number().int().min(1).max(12).optional(),
    working_days_per_month: z.number().int().min(1).max(31).optional(),
    absent_deduction_enabled: z.boolean().optional(),
    late_consecutive_threshold: z.number().int().min(1).max(30).optional(),
    late_rate_per_min: z.number().min(0).optional(),
    overtime_enabled: z.boolean().optional(),
    overtime_rate_per_hour: z.number().min(0).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { id, ...rest } = data as any;
    const { data: row, error } = await context.supabase
      .from("hr_settings")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/* ================ BULK IMPORT ================ */
export const importEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    rows: z.array(z.object({
      full_name: z.string().min(1),
      email: z.string().optional(),
      phone: z.string().optional(),
      employee_code: z.string().optional(),
      department: z.string().optional(),
      designation: z.string().optional(),
      joining_date: z.string().optional(),
      gross_salary: z.union([z.number(), z.string()]).optional(),
      gender: z.string().optional(),
      status: z.string().optional(),
      nid: z.string().optional(),
      bank_account_no: z.string().optional(),
    })),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: depts } = await context.supabase.from("hr_departments").select("id, name");
    const { data: desigs } = await context.supabase.from("hr_designations").select("id, title");
    const deptMap = new Map<string, string>((depts ?? []).map((d: any) => [d.name.toLowerCase(), d.id]));
    const desigMap = new Map<string, string>((desigs ?? []).map((d: any) => [d.title.toLowerCase(), d.id]));

    let inserted = 0, failed = 0;
    const errors: string[] = [];
    for (const r of data.rows) {
      try {
        let code = r.employee_code;
        if (!code) {
          const { data: c } = await context.supabase.rpc("hr_next_employee_code");
          code = c as string;
        }
        const payload: any = {
          employee_code: code,
          full_name: r.full_name,
          email: r.email || null,
          phone: r.phone || null,
          nid: r.nid || null,
          bank_account_no: r.bank_account_no || null,
          joining_date: r.joining_date || new Date().toISOString().slice(0, 10),
          gross_salary: r.gross_salary ? Number(r.gross_salary) : null,
          gender: r.gender && ["male","female","other"].includes(r.gender.toLowerCase()) ? r.gender.toLowerCase() : null,
          status: r.status && ["active","probation","on_leave","suspended","terminated","resigned","retired"].includes(r.status.toLowerCase()) ? r.status.toLowerCase() : "active",
          department_id: r.department ? deptMap.get(r.department.toLowerCase()) ?? null : null,
          designation_id: r.designation ? desigMap.get(r.designation.toLowerCase()) ?? null : null,
          tags: ["imported"],
          created_by: context.userId,
        };
        const { error } = await context.supabase.from("hr_employees").insert(payload);
        if (error) { failed++; errors.push(`${r.full_name}: ${error.message}`); }
        else inserted++;
      } catch (e: any) {
        failed++;
        errors.push(`${r.full_name}: ${e.message}`);
      }
    }
    return { inserted, failed, errors: errors.slice(0, 20) };
  });