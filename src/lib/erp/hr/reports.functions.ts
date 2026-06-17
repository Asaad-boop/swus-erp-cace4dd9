import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAccess(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_hr_access", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error("HR access required");
}

/* ============ HEADCOUNT REPORT ============ */
export const headcountReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      groupBy: z.enum(["department", "designation", "employment_type", "status"]).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const groupBy = data.groupBy ?? "department";
    const [{ data: emps }, { data: depts }, { data: desigs }] = await Promise.all([
      context.supabase
        .from("hr_employees")
        .select("status, employment_type, department_id, designation_id"),
      context.supabase.from("hr_departments").select("id, name"),
      context.supabase.from("hr_designations").select("id, title"),
    ]);
    const dmap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
    const dsmap = new Map((desigs ?? []).map((d: any) => [d.id, d.title]));
    const counts = new Map<string, number>();
    for (const e of (emps ?? []) as any[]) {
      let key = "—";
      if (groupBy === "department") key = dmap.get(e.department_id) ?? "Unassigned";
      else if (groupBy === "designation") key = dsmap.get(e.designation_id) ?? "Unassigned";
      else if (groupBy === "employment_type") key = e.employment_type ?? "Unspecified";
      else key = e.status ?? "—";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  });

/* ============ ATTENDANCE REPORT ============ */
export const attendanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      from: z.string(),
      to: z.string(),
      employeeIds: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    let q = context.supabase
      .from("hr_attendance")
      .select("employee_id, status, late_min, ot_min, total_hours")
      .gte("date", data.from)
      .lte("date", data.to);
    if (data.employeeIds?.length) q = q.in("employee_id", data.employeeIds);
    const { data: rows, error } = await q;
    if (error) throw error;
    const { data: emps } = await context.supabase
      .from("hr_employees")
      .select("id, employee_code, full_name")
      .in(
        "id",
        data.employeeIds && data.employeeIds.length
          ? data.employeeIds
          : Array.from(new Set((rows ?? []).map((r: any) => r.employee_id))),
      );
    const eMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    const agg = new Map<string, any>();
    for (const r of (rows ?? []) as any[]) {
      if (!agg.has(r.employee_id)) {
        const e = eMap.get(r.employee_id);
        agg.set(r.employee_id, {
          employee_code: e?.employee_code ?? "",
          name: e?.full_name ?? "—",
          present: 0, late: 0, absent: 0, half_day: 0, leave: 0, ot_hours: 0, total_hours: 0,
        });
      }
      const a = agg.get(r.employee_id);
      if (r.status in a) a[r.status]++;
      a.ot_hours += Number(r.ot_min ?? 0) / 60;
      a.total_hours += Number(r.total_hours ?? 0);
    }
    return Array.from(agg.values());
  });

/* ============ LEAVE SUMMARY ============ */
export const leaveSummaryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ year: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const [{ data: bal }, { data: types }, { data: emps }] = await Promise.all([
      context.supabase.from("hr_leave_balances").select("*").eq("year", data.year),
      context.supabase.from("hr_leave_types").select("id, name, code"),
      context.supabase.from("hr_employees").select("id, employee_code, full_name"),
    ]);
    const tMap = new Map((types ?? []).map((t: any) => [t.id, t]));
    const eMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
    return (bal ?? []).map((b: any) => {
      const t = tMap.get(b.leave_type_id);
      const e = eMap.get(b.employee_id);
      return {
        employee_code: e?.employee_code ?? "",
        name: e?.full_name ?? "—",
        leave_type: t?.name ?? "—",
        allocated: Number(b.allocated ?? 0),
        carried: Number(b.carried ?? 0),
        used: Number(b.used ?? 0),
        encashed: Number(b.encashed ?? 0),
        remaining:
          Number(b.allocated ?? 0) + Number(b.carried ?? 0) - Number(b.used ?? 0) - Number(b.encashed ?? 0),
      };
    });
  });

/* ============ PAYROLL REPORT ============ */
export const payrollReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ year: z.number().int(), month: z.number().int().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    let runQ = context.supabase
      .from("hr_payroll_runs")
      .select("id, month, year")
      .eq("year", data.year);
    if (data.month) runQ = runQ.eq("month", data.month);
    const { data: runs, error } = await runQ;
    if (error) throw error;
    if (!runs?.length) return [];
    const { data: ps } = await context.supabase
      .from("hr_payslips")
      .select(
        "run_id, employee_id, gross, net_pay, payment_status, hr_employees(employee_code, full_name)",
      )
      .in("run_id", runs.map((r: any) => r.id));
    const runMap = new Map(runs.map((r: any) => [r.id, r]));
    return (ps ?? []).map((p: any) => ({
      year: runMap.get(p.run_id)?.year,
      month: runMap.get(p.run_id)?.month,
      employee_code: p.hr_employees?.employee_code ?? "",
      name: p.hr_employees?.full_name ?? "—",
      gross: Number(p.gross),
      net_pay: Number(p.net_pay),
      payment_status: p.payment_status,
    }));
  });

/* ============ DASHBOARD EXTRAS ============ */
export const getHrDashboardExtras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const from30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const [todayAtt, trendAtt, pendingLeaves, expiringDocs, leaveTypes, leaveReqs] = await Promise.all([
      context.supabase.from("hr_attendance").select("status").eq("date", today),
      context.supabase.from("hr_attendance").select("date, status").gte("date", from30).lte("date", today),
      context.supabase
        .from("hr_leave_requests")
        .select("id, employee_id, from_date, to_date, days, leave_type_id, hr_employees(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10),
      context.supabase
        .from("hr_documents")
        .select("id, employee_id, title, expiry_date")
        .gte("expiry_date", today)
        .lte("expiry_date", in30)
        .order("expiry_date")
        .limit(10),
      context.supabase.from("hr_leave_types").select("id, name, color"),
      context.supabase.from("hr_leave_requests").select("leave_type_id").eq("status", "approved"),
    ]);

    const todayCounts = { present: 0, late: 0, absent: 0, on_leave: 0 };
    for (const r of (todayAtt.data ?? []) as any[]) {
      if (r.status === "present") todayCounts.present++;
      else if (r.status === "late") todayCounts.late++;
      else if (r.status === "absent") todayCounts.absent++;
      else if (r.status === "leave") todayCounts.on_leave++;
    }

    const trendMap = new Map<string, number>();
    for (const r of (trendAtt.data ?? []) as any[]) {
      if (r.status === "present" || r.status === "late") {
        trendMap.set(r.date, (trendMap.get(r.date) ?? 0) + 1);
      }
    }
    const trend: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      trend.push({ date: d, count: trendMap.get(d) ?? 0 });
    }

    const ltMap = new Map((leaveTypes.data ?? []).map((t: any) => [t.id, t]));
    const leaveDist = new Map<string, { name: string; color: string; count: number }>();
    for (const r of (leaveReqs.data ?? []) as any[]) {
      const t = ltMap.get(r.leave_type_id);
      if (!t) continue;
      const cur = leaveDist.get(r.leave_type_id) ?? { name: t.name, color: t.color, count: 0 };
      cur.count++;
      leaveDist.set(r.leave_type_id, cur);
    }

    return {
      todayCounts,
      trend,
      pendingLeaves: pendingLeaves.data ?? [],
      expiringDocs: expiringDocs.data ?? [],
      leaveDistribution: Array.from(leaveDist.values()),
    };
  });