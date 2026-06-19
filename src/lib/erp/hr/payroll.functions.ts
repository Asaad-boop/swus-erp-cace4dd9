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

/* ============ Finance journal helpers (additive) ============ */
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

async function isPayrollAutopostEnabled(supabase: any, brandId: string | null): Promise<boolean> {
  const key = `finance:payroll_autopost:${brandId ?? "global"}`;
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data?.value) return true; // default ON
  try {
    const v = JSON.parse(data.value);
    return v !== false;
  } catch { return true; }
}

async function findOrCreateChartAccount(
  supabase: any,
  brandId: string,
  userId: string,
  opts: { namePatterns: string[]; type: "asset" | "liability" | "expense" | "income" | "equity"; fallbackName: string; fallbackCode: string },
): Promise<string | null> {
  // search active first
  for (const pat of opts.namePatterns) {
    const { data } = await supabase
      .from("erp_chart_accounts")
      .select("id")
      .eq("brand_id", brandId)
      .eq("account_type", opts.type)
      .eq("is_archived", false)
      .ilike("name", pat)
      .limit(1);
    if (data && data.length) return data[0].id;
  }
  const normal = opts.type === "asset" || opts.type === "expense" ? "debit" : "credit";
  const { data: created, error } = await supabase
    .from("erp_chart_accounts")
    .insert({
      brand_id: brandId,
      code: opts.fallbackCode,
      name: opts.fallbackName,
      account_type: opts.type,
      normal_balance: normal,
      is_active: true,
      is_archived: false,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return null;
  return created.id;
}

async function logActivity(supabase: any, userId: string, entityType: string, entityId: string, action: string, details: any) {
  try {
    await supabase.from("activity_log").insert({
      entity_type: entityType,
      entity_id: entityId,
      action,
      details,
      performed_by: userId,
    });
  } catch { /* swallow */ }
}

async function postPayrollJournal(supabase: any, userId: string, runId: string): Promise<{ posted: boolean; entry_id?: string; reason?: string }> {
  // Load run
  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, brand_id, month, year, finalized_at, total_gross, total_net, total_employees")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return { posted: false, reason: "run not found" };
  if (!run.brand_id) return { posted: false, reason: "run has no brand_id" };

  // Idempotency
  const { data: existing } = await supabase
    .from("erp_journal_entries")
    .select("id")
    .eq("source_type", "payroll_run")
    .eq("source_id", runId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { posted: true, entry_id: existing.id };

  // Sum tax/PF from payslips deductions jsonb
  const { data: slips } = await supabase
    .from("hr_payslips")
    .select("deductions")
    .eq("run_id", runId);
  let totalTax = 0, totalPf = 0;
  for (const s of (slips ?? []) as any[]) {
    const d = s.deductions ?? {};
    totalTax += Number(d.tax ?? 0);
    totalPf += Number(d.pf ?? 0);
  }

  // Net payable line = total_net (already gross - all deductions). Journal:
  // DR Salary Expense = total_gross
  // CR Salary Payable = total_net
  // CR Tax Payable    = totalTax (if > 0)
  // CR PF Payable     = totalPf  (if > 0)
  // CR Other Deductions Payable = (gross - net - tax - pf)  — to keep balanced if other deductions exist
  const gross = Number(run.total_gross ?? 0);
  const net = Number(run.total_net ?? 0);
  const otherDed = Math.max(0, gross - net - totalTax - totalPf);

  const salaryExpenseId = await findOrCreateChartAccount(supabase, run.brand_id, userId, {
    namePatterns: ["%salary%", "%salaries%", "%wages%"],
    type: "expense",
    fallbackName: "Salary Expense",
    fallbackCode: "6100",
  });
  const salaryPayableId = await findOrCreateChartAccount(supabase, run.brand_id, userId, {
    namePatterns: ["%salary payable%", "%wages payable%", "%salaries payable%"],
    type: "liability",
    fallbackName: "Salary Payable",
    fallbackCode: "2100",
  });
  if (!salaryExpenseId || !salaryPayableId) return { posted: false, reason: "could not resolve salary accounts" };

  const lines: any[] = [
    { account_id: salaryExpenseId, debit: gross, credit: 0, description: `Gross salary — ${run.total_employees ?? 0} employees` },
    { account_id: salaryPayableId, debit: 0, credit: net, description: "Net salary payable" },
  ];

  if (totalTax > 0) {
    const taxPayableId = await findOrCreateChartAccount(supabase, run.brand_id, userId, {
      namePatterns: ["%tax payable%", "%income tax payable%"],
      type: "liability",
      fallbackName: "Tax Payable",
      fallbackCode: "2200",
    });
    if (taxPayableId) lines.push({ account_id: taxPayableId, debit: 0, credit: totalTax, description: "Income tax withheld" });
  }
  if (totalPf > 0) {
    const pfPayableId = await findOrCreateChartAccount(supabase, run.brand_id, userId, {
      namePatterns: ["%pf payable%", "%provident fund payable%", "%provident fund%"],
      type: "liability",
      fallbackName: "PF Payable",
      fallbackCode: "2300",
    });
    if (pfPayableId) lines.push({ account_id: pfPayableId, debit: 0, credit: totalPf, description: "Provident fund payable" });
  }
  if (otherDed > 0) {
    const otherPayableId = await findOrCreateChartAccount(supabase, run.brand_id, userId, {
      namePatterns: ["%other deductions payable%", "%payroll deductions payable%"],
      type: "liability",
      fallbackName: "Payroll Deductions Payable",
      fallbackCode: "2400",
    });
    if (otherPayableId) lines.push({ account_id: otherPayableId, debit: 0, credit: otherDed, description: "Other deductions" });
  }

  const monthName = MONTH_NAMES[(run.month ?? 1) - 1];
  const entryDate = (run.finalized_at ? new Date(run.finalized_at) : new Date()).toISOString().slice(0, 10);

  const { data: jeId, error } = await supabase.rpc("create_journal_entry", {
    _brand_id: run.brand_id,
    _entry_date: entryDate,
    _description: `Payroll — ${monthName} ${run.year}`,
    _lines: lines,
    _source_type: "payroll_run",
    _source_id: runId,
    _status: "posted",
  });
  if (error) return { posted: false, reason: error.message };
  return { posted: true, entry_id: jeId as string };
}

async function postPayslipPaymentJournal(
  supabase: any,
  userId: string,
  payslipId: string,
  paymentMethod: string | null,
): Promise<{ posted: boolean; reason?: string }> {
  if (!paymentMethod) return { posted: false, reason: "no payment method" };

  const { data: ps } = await supabase
    .from("hr_payslips")
    .select("id, run_id, net_pay, paid_at, snapshot, hr_employees(full_name), hr_payroll_runs(brand_id, month, year)")
    .eq("id", payslipId)
    .maybeSingle();
  if (!ps) return { posted: false, reason: "payslip not found" };
  const brandId = (ps as any).hr_payroll_runs?.brand_id ?? null;
  if (!brandId) return { posted: false, reason: "no brand" };

  // Idempotency
  const { data: existing } = await supabase
    .from("erp_journal_entries")
    .select("id")
    .eq("source_type", "payslip_payment")
    .eq("source_id", payslipId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { posted: true };

  const salaryPayableId = await findOrCreateChartAccount(supabase, brandId, userId, {
    namePatterns: ["%salary payable%", "%wages payable%", "%salaries payable%"],
    type: "liability",
    fallbackName: "Salary Payable",
    fallbackCode: "2100",
  });

  const methodPatterns: Record<string, { patterns: string[]; fallbackName: string; fallbackCode: string }> = {
    bkash: { patterns: ["%bkash%"], fallbackName: "bKash Wallet", fallbackCode: "1110" },
    nagad: { patterns: ["%nagad%"], fallbackName: "Nagad Wallet", fallbackCode: "1111" },
    rocket: { patterns: ["%rocket%"], fallbackName: "Rocket Wallet", fallbackCode: "1112" },
    bank: { patterns: ["%bank%"], fallbackName: "Bank Account", fallbackCode: "1120" },
    cash: { patterns: ["%cash in hand%", "%cash%"], fallbackName: "Cash in Hand", fallbackCode: "1100" },
  };
  const cfg = methodPatterns[paymentMethod.toLowerCase()] ?? methodPatterns.cash;
  const walletId = await findOrCreateChartAccount(supabase, brandId, userId, {
    namePatterns: cfg.patterns,
    type: "asset",
    fallbackName: cfg.fallbackName,
    fallbackCode: cfg.fallbackCode,
  });
  if (!salaryPayableId || !walletId) return { posted: false, reason: "missing accounts" };

  const amount = Number((ps as any).net_pay ?? 0);
  if (amount <= 0) return { posted: false, reason: "zero amount" };

  const empName = (ps as any).hr_employees?.full_name ?? (ps as any).snapshot?.full_name ?? "Employee";
  const runMeta = (ps as any).hr_payroll_runs;
  const monthName = runMeta?.month ? MONTH_NAMES[runMeta.month - 1] : "";
  const entryDate = ((ps as any).paid_at ? new Date((ps as any).paid_at) : new Date()).toISOString().slice(0, 10);

  const { error } = await supabase.rpc("create_journal_entry", {
    _brand_id: brandId,
    _entry_date: entryDate,
    _description: `Salary paid — ${empName}${monthName ? ` — ${monthName} ${runMeta?.year ?? ""}` : ""}`,
    _lines: [
      { account_id: salaryPayableId, debit: amount, credit: 0, description: "Clear salary payable" },
      { account_id: walletId, debit: 0, credit: amount, description: `Paid via ${paymentMethod}` },
    ],
    _source_type: "payslip_payment",
    _source_id: payslipId,
    _status: "posted",
  });
  if (error) return { posted: false, reason: error.message };
  return { posted: true };
}

/* ============ Attendance-based calculations ============ */
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

async function loadPayrollSettings(supabase: any) {
  const { data } = await supabase
    .from("hr_settings")
    .select("working_days_per_month, absent_deduction_enabled, late_consecutive_threshold, late_rate_per_min, overtime_enabled, overtime_rate_per_hour")
    .is("brand_id", null)
    .maybeSingle();
  return {
    working_days_per_month: Number(data?.working_days_per_month ?? 26),
    absent_deduction_enabled: data?.absent_deduction_enabled ?? true,
    late_consecutive_threshold: Number(data?.late_consecutive_threshold ?? 3),
    late_rate_per_min: Number(data?.late_rate_per_min ?? 50),
    overtime_enabled: data?.overtime_enabled ?? true,
    overtime_rate_per_hour: Number(data?.overtime_rate_per_hour ?? 100),
  };
}

async function computeAttendanceImpact(
  supabase: any,
  employeeId: string,
  year: number,
  month: number,
  settings: Awaited<ReturnType<typeof loadPayrollSettings>>,
  monthlyBasic: number,
) {
  const mm = String(month).padStart(2, "0");
  const last = String(daysInMonth(year, month)).padStart(2, "0");
  const from = `${year}-${mm}-01`;
  const to = `${year}-${mm}-${last}`;

  const { data: rows } = await supabase
    .from("hr_attendance")
    .select("id, date, status, late_min, ot_min")
    .eq("employee_id", employeeId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  const list = (rows ?? []) as any[];
  let absent_days = 0;
  let late_total_minutes = 0;
  let overtime_total_minutes = 0;
  let late_deductible_minutes = 0;
  let streak = 0;
  const updates: Array<{ id: string; consecutive_late_count: number; deduction_amount: number; overtime_amount: number }> = [];

  const perDaySalary = settings.working_days_per_month > 0 ? monthlyBasic / settings.working_days_per_month : 0;

  for (const r of list) {
    const lateMin = Number(r.late_min || 0);
    const otMin = Number(r.ot_min || 0);
    const status = r.status;

    if (status === "absent") { absent_days += 1; streak = 0; }
    else if (lateMin > 0 || status === "late") { streak += 1; late_total_minutes += lateMin; }
    else if (status === "present" || status === "half_day") { streak = 0; }

    overtime_total_minutes += otMin;

    let dayLateDed = 0;
    if (settings.late_rate_per_min > 0 && (lateMin > 0 || status === "late") && streak >= settings.late_consecutive_threshold) {
      dayLateDed = lateMin * settings.late_rate_per_min;
      late_deductible_minutes += lateMin;
    }
    const dayAbsentDed = status === "absent" && settings.absent_deduction_enabled ? perDaySalary : 0;
    const dayOtEarn = settings.overtime_enabled ? (otMin / 60) * settings.overtime_rate_per_hour : 0;

    updates.push({
      id: r.id,
      consecutive_late_count: streak,
      deduction_amount: Math.round((dayLateDed + dayAbsentDed) * 100) / 100,
      overtime_amount: Math.round(dayOtEarn * 100) / 100,
    });
  }

  const absent_deduction = settings.absent_deduction_enabled
    ? Math.round(absent_days * perDaySalary * 100) / 100 : 0;
  const late_deduction = Math.round(late_deductible_minutes * settings.late_rate_per_min * 100) / 100;
  const overtime_earning = settings.overtime_enabled
    ? Math.round((overtime_total_minutes / 60) * settings.overtime_rate_per_hour * 100) / 100 : 0;

  // persist per-day calc back to attendance rows (idempotent)
  for (const u of updates) {
    await supabase.from("hr_attendance").update({
      consecutive_late_count: u.consecutive_late_count,
      deduction_amount: u.deduction_amount,
      overtime_amount: u.overtime_amount,
    }).eq("id", u.id);
  }

  return {
    absent_days,
    late_total_minutes,
    overtime_total_minutes,
    absent_deduction,
    late_deduction,
    overtime_earning,
  };
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
    // Attendance-based deductions + OT
    const settings = await loadPayrollSettings(context.supabase);
    const enriched: any[] = [];
    for (let i = 0; i < (emps ?? []).length; i++) {
      const e = (emps as any[])[i];
      const base = payslips[i];
      const impact = await computeAttendanceImpact(
        context.supabase, e.id, data.year, data.month, settings, Number(base.basic) || 0,
      );
      const allowances = { ...base.allowances, overtime: impact.overtime_earning };
      const deductions = { ...base.deductions, absent: impact.absent_deduction, late: impact.late_deduction };
      const allowSum = sumValues(allowances);
      const dedSum = sumValues(deductions);
      const gross = Number(base.basic) + allowSum;
      const net_pay = gross - dedSum;
      const total_earnings_breakdown = { basic: Number(base.basic), ...base.allowances, overtime: impact.overtime_earning };
      const total_deductions_breakdown = { ...base.deductions, absent: impact.absent_deduction, late: impact.late_deduction };
      enriched.push({
        ...base,
        allowances,
        deductions,
        gross,
        net_pay,
        absent_days: impact.absent_days,
        late_total_minutes: impact.late_total_minutes,
        overtime_total_minutes: impact.overtime_total_minutes,
        absent_deduction: impact.absent_deduction,
        late_deduction: impact.late_deduction,
        overtime_earning: impact.overtime_earning,
        total_earnings_breakdown,
        total_deductions_breakdown,
      });
    }
    if (enriched.length) {
      const { error: pe } = await context.supabase.from("hr_payslips").insert(enriched);
      if (pe) throw pe;
    }
    const totals = computeTotals(enriched);
    await context.supabase.from("hr_payroll_runs").update(totals).eq("id", run.id);
    return { ...run, ...totals };
  });

export const getPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const [runRes, payRes, deptRes, desigRes, jeRes] = await Promise.all([
      context.supabase.from("hr_payroll_runs").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("hr_payslips")
        .select("*, hr_employees(employee_code, full_name, department_id, designation_id, bank_name, bank_account_no)")
        .eq("run_id", data.id),
      context.supabase.from("hr_departments").select("id, name"),
      context.supabase.from("hr_designations").select("id, title"),
      context.supabase
        .from("erp_journal_entries")
        .select("id, entry_no, entry_date, status")
        .eq("source_type", "payroll_run")
        .eq("source_id", data.id)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    if (runRes.error) throw runRes.error;
    if (!runRes.data) throw new Error("Run not found");
    return {
      run: runRes.data,
      payslips: payRes.data ?? [],
      departments: deptRes.data ?? [],
      designations: desigRes.data ?? [],
      journal_entry: jeRes.data ?? null,
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
    const allow = data.allowances ?? {};
    const ded = data.deductions ?? {};
    const total_earnings_breakdown = { basic: Number(data.basic), ...allow };
    const total_deductions_breakdown = { ...ded };
    const { error } = await context.supabase
      .from("hr_payslips")
      .update({
        basic: data.basic,
        allowances: data.allowances,
        deductions: data.deductions,
        gross,
        net_pay,
        total_earnings_breakdown,
        total_deductions_breakdown,
        overtime_earning: Number(allow.overtime ?? 0),
        absent_deduction: Number(ded.absent ?? 0),
        late_deduction: Number(ded.late ?? 0),
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
    // Fail-soft journal autopost
    let journal: { posted: boolean; entry_id?: string; reason?: string } = { posted: false };
    try {
      const { data: run } = await context.supabase
        .from("hr_payroll_runs")
        .select("brand_id")
        .eq("id", data.id)
        .maybeSingle();
      const autopost = await isPayrollAutopostEnabled(context.supabase, run?.brand_id ?? null);
      if (autopost) {
        journal = await postPayrollJournal(context.supabase, context.userId, data.id);
        if (!journal.posted) {
          await logActivity(context.supabase, context.userId, "hr_payroll_run", data.id,
            "journal_autopost_failed", { reason: journal.reason });
        }
      } else {
        journal = { posted: false, reason: "autopost disabled" };
      }
    } catch (e: any) {
      journal = { posted: false, reason: e?.message ?? "unknown error" };
      await logActivity(context.supabase, context.userId, "hr_payroll_run", data.id,
        "journal_autopost_failed", { reason: journal.reason });
    }
    return { ok: true, journal };
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
    let journal: { posted: boolean; reason?: string } = { posted: false };
    if (data.payment_status === "paid") {
      try {
        // brand from the run
        const { data: ps } = await context.supabase
          .from("hr_payslips")
          .select("hr_payroll_runs(brand_id)")
          .eq("id", data.id)
          .maybeSingle();
        const brandId = (ps as any)?.hr_payroll_runs?.brand_id ?? null;
        const autopost = await isPayrollAutopostEnabled(context.supabase, brandId);
        if (autopost) {
          journal = await postPayslipPaymentJournal(context.supabase, context.userId, data.id, data.payment_method ?? null);
          if (!journal.posted) {
            await logActivity(context.supabase, context.userId, "hr_payslip", data.id,
              "payment_journal_failed", { reason: journal.reason });
          }
        }
      } catch (e: any) {
        journal = { posted: false, reason: e?.message ?? "unknown error" };
        await logActivity(context.supabase, context.userId, "hr_payslip", data.id,
          "payment_journal_failed", { reason: journal.reason });
      }
    }
    return { ok: true, journal };
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