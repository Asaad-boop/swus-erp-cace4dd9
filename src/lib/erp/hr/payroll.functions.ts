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

function sumValues(o: Record<string, number> | null | undefined): number {
  if (!o) return 0;
  return Object.values(o).reduce((a, b) => a + Number(b || 0), 0);
}

function deriveSalary(emp: any) {
  const gross = Number(emp.gross_salary ?? 0);
  const s = emp.salary_structure ?? {};
  // Use explicit structure if any non-zero value present, else derive 60/30/5/5
  const hasStruct =
    Number(s.basic ?? 0) > 0 ||
    sumValues(s.allowances) > 0 ||
    sumValues(s.deductions) > 0;
  if (hasStruct) {
    return {
      basic: Number(s.basic ?? 0),
      allowances: s.allowances ?? {},
      deductions: s.deductions ?? {},
    };
  }
  return {
    basic: Math.round(gross * 0.6),
    allowances: {
      house: Math.round(gross * 0.3),
      transport: Math.round(gross * 0.05),
      medical: Math.round(gross * 0.05),
      other: 0,
    },
    deductions: { pf: 0, tax: 0, loan: 0, other: 0 },
  };
}

function computeTotals(payslips: any[]) {
  let total_gross = 0;
  let total_net = 0;
  for (const p of payslips) {
    total_gross += Number(p.gross || 0);
    total_net += Number(p.net_pay || 0);
  }
  return { total_gross, total_net, total_employees: payslips.length };
}

/* ==================== RUNS ==================== */
export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("hr_payroll_runs")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2000).max(2100),
      brand_id: z.string().uuid().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    let exQ = context.supabase
      .from("hr_payroll_runs")
      .select("id")
      .eq("year", data.year)
      .eq("month", data.month);
    exQ = data.brand_id ? exQ.eq("brand_id", data.brand_id) : exQ.is("brand_id", null);
    const { data: existing } = await exQ.maybeSingle();
    if (existing) throw new Error("Payroll run for this month already exists");

    const { data: emps, error: ee } = await context.supabase
      .from("hr_employees")
      .select("*")
      .in("status", ["active", "probation", "on_leave"]);
    if (ee) throw ee;

    const { data: run, error: re } = await context.supabase
      .from("hr_payroll_runs")
      .insert({
        month: data.month,
        year: data.year,
        brand_id: data.brand_id ?? null,
        status: "draft",
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (re) throw re;

    const payslips = (emps ?? []).map((e: any) => {
      const s = deriveSalary(e);
      const allowSum = sumValues(s.allowances);
      const dedSum = sumValues(s.deductions);
      const gross = s.basic + allowSum;
      const net_pay = gross - dedSum;
      return {
        run_id: run.id,
        employee_id: e.id,
        basic: s.basic,
        allowances: s.allowances,
        deductions: s.deductions,
        gross,
        net_pay,
        snapshot: {
          employee_code: e.employee_code,
          full_name: e.full_name,
          department_id: e.department_id,
          designation_id: e.designation_id,
          bank_name: e.bank_name,
          bank_account_no: e.bank_account_no,
        },
      };
    });
    if (payslips.length) {
      const { error: pe } = await context.supabase.from("hr_payslips").insert(payslips);
      if (pe) throw pe;
    }
    const totals = computeTotals(payslips);
    await context.supabase.from("hr_payroll_runs").update(totals).eq("id", run.id);
    return { ...run, ...totals };
  });

export const getPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const [runRes, payRes, deptRes, desigRes] = await Promise.all([
      context.supabase.from("hr_payroll_runs").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("hr_payslips")
        .select("*, hr_employees(employee_code, full_name, department_id, designation_id, bank_name, bank_account_no)")
        .eq("run_id", data.id),
      context.supabase.from("hr_departments").select("id, name"),
      context.supabase.from("hr_designations").select("id, title"),
    ]);
    if (runRes.error) throw runRes.error;
    if (!runRes.data) throw new Error("Run not found");
    return {
      run: runRes.data,
      payslips: payRes.data ?? [],
      departments: deptRes.data ?? [],
      designations: desigRes.data ?? [],
    };
  });

export const updatePayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      id: z.string().uuid(),
      basic: z.number(),
      allowances: z.record(z.string(), z.number()),
      deductions: z.record(z.string(), z.number()),
      notes: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: cur } = await context.supabase
      .from("hr_payslips")
      .select("run_id, hr_payroll_runs(status)")
      .eq("id", data.id)
      .maybeSingle();
    if ((cur as any)?.hr_payroll_runs?.status === "finalized") {
      throw new Error("Run is finalized — cannot edit");
    }
    const gross = Number(data.basic) + sumValues(data.allowances);
    const net_pay = gross - sumValues(data.deductions);
    const { error } = await context.supabase
      .from("hr_payslips")
      .update({
        basic: data.basic,
        allowances: data.allowances,
        deductions: data.deductions,
        gross,
        net_pay,
        notes: data.notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    // recompute run totals
    if (cur?.run_id) {
      const { data: ps } = await context.supabase
        .from("hr_payslips")
        .select("gross, net_pay")
        .eq("run_id", cur.run_id);
      const totals = computeTotals(ps ?? []);
      await context.supabase.from("hr_payroll_runs").update(totals).eq("id", cur.run_id);
    }
    return { ok: true };
  });

export const finalizePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("hr_payroll_runs")
      .update({ status: "finalized", finalized_at: new Date().toISOString(), finalized_by: context.userId })
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) throw error;
    return { ok: true };
  });

export const deletePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: run } = await context.supabase
      .from("hr_payroll_runs")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (run?.status === "finalized") throw new Error("Cannot delete a finalized run");
    const { error } = await context.supabase.from("hr_payroll_runs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const markPayslipPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      id: z.string().uuid(),
      payment_status: z.enum(["pending", "paid", "partial", "cancelled"]),
      payment_method: z.string().nullable().optional(),
      payment_ref: z.string().nullable().optional(),
      paid_at: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("hr_payslips")
      .update({
        payment_status: data.payment_status,
        payment_method: data.payment_method ?? null,
        payment_ref: data.payment_ref ?? null,
        paid_at: data.paid_at ?? (data.payment_status === "paid" ? new Date().toISOString() : null),
        paid_by: data.payment_status === "paid" ? context.userId : null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getPayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: ps, error } = await context.supabase
      .from("hr_payslips")
      .select(
        "*, hr_payroll_runs(month, year), hr_employees(employee_code, full_name, designation_id, department_id, joining_date, bank_name, bank_account_no)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!ps) throw new Error("Payslip not found");
    const [{ data: depts }, { data: desigs }] = await Promise.all([
      context.supabase.from("hr_departments").select("id, name"),
      context.supabase.from("hr_designations").select("id, title"),
    ]);
    return {
      payslip: ps,
      departments: depts ?? [],
      designations: desigs ?? [],
    };
  });

/* ==================== PAYROLL SUMMARY FOR DASHBOARD ==================== */
export const getCurrentMonthPayrollStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const now = new Date();
    const { data: run } = await context.supabase
      .from("hr_payroll_runs")
      .select("id, status, total_gross, total_net, total_employees")
      .eq("year", now.getFullYear())
      .eq("month", now.getMonth() + 1)
      .is("brand_id", null)
      .maybeSingle();
    if (!run) return { exists: false, status: null, paid: 0, pending: 0 };
    const { data: ps } = await context.supabase
      .from("hr_payslips")
      .select("payment_status")
      .eq("run_id", run.id);
    const paid = (ps ?? []).filter((p: any) => p.payment_status === "paid").length;
    const pending = (ps ?? []).filter((p: any) => p.payment_status !== "paid").length;
    return { exists: true, ...run, paid, pending };
  });