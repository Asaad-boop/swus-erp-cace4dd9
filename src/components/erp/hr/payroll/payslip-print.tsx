import { printHtml, fmtBdt } from "@/lib/erp/hr/pdf";

const ALLOW_LABELS: Record<string, string> = {
  house: "House Allowance",
  transport: "Transport Allowance",
  medical: "Medical Allowance",
  food: "Food Allowance",
  mobile: "Mobile Allowance",
  overtime: "Overtime",
  other: "Other",
};
const DED_LABELS: Record<string, string> = {
  pf: "Provident Fund",
  tax: "Tax",
  loan: "Loan",
  absent: "Absent Deduction",
  late: "Late Deduction",
  other: "Other",
};

export function printPayslip(args: {
  companyName: string;
  companyAddress?: string;
  payslip: any;
  departments: { id: string; name: string }[];
  designations: { id: string; title: string }[];
}) {
  const { payslip: p, companyName, departments, designations } = args;
  const emp = p.hr_employees ?? p.snapshot ?? {};
  const run = p.hr_payroll_runs ?? {};
  const dept = departments.find((d) => d.id === emp.department_id)?.name ?? "";
  const desig = designations.find((d) => d.id === emp.designation_id)?.title ?? "";
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const period = run.year ? `${MONTHS[run.month - 1]} ${run.year}` : "—";

  const allow = p.allowances ?? {};
  const ded = p.deductions ?? {};
  const otMin = Number(p.overtime_total_minutes ?? 0);
  const absentDays = Number(p.absent_days ?? 0);
  const lateMin = Number(p.late_total_minutes ?? 0);

  const earningRow = (label: string, amt: number) =>
    `<tr><td>${label}</td><td class="right">${fmtBdt(amt)}</td></tr>`;

  const earningsRows = [
    earningRow("Basic Salary", Number(p.basic) || 0),
    ...Object.entries(allow)
      .filter(([k]) => k !== "overtime")
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => earningRow(ALLOW_LABELS[k] ?? k.replace(/_/g, " "), Number(v))),
  ];
  if (Number(allow.overtime ?? p.overtime_earning ?? 0) > 0 || otMin > 0) {
    const hrs = Math.floor(otMin / 60); const mins = otMin % 60;
    const label = `Overtime${otMin ? ` (${hrs}h${mins ? ` ${mins}m` : ""})` : ""}`;
    earningsRows.push(earningRow(label, Number(allow.overtime ?? p.overtime_earning ?? 0)));
  }

  const deductionsRows = Object.entries(ded)
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => {
      let label = DED_LABELS[k] ?? k.replace(/_/g, " ");
      if (k === "absent" && absentDays > 0) label = `Absent Deduction (${absentDays} day${absentDays > 1 ? "s" : ""})`;
      if (k === "late" && lateMin > 0) label = `Late Deduction (${lateMin} min)`;
      return earningRow(label, Number(v));
    });

  const html = `
    <div class="header">
      <div>
        <h1>${companyName}</h1>
        ${args.companyAddress ? `<div class="muted">${args.companyAddress}</div>` : ""}
      </div>
      <div class="right">
        <h2>Payslip</h2>
        <div class="muted">${period}</div>
      </div>
    </div>
    <table style="margin-bottom:12px">
      <tr><th style="width:120px">Employee</th><td>${emp.full_name ?? "—"}</td><th style="width:120px">Code</th><td>${emp.employee_code ?? "—"}</td></tr>
      <tr><th>Designation</th><td>${desig}</td><th>Department</th><td>${dept}</td></tr>
      <tr><th>Bank</th><td>${emp.bank_name ?? "—"}</td><th>Account</th><td>${emp.bank_account_no ?? "—"}</td></tr>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px">
      <div>
        <h3>Earnings</h3>
        <table>
          <tr><th>Item</th><th class="right">Amount</th></tr>
          ${earningsRows.join("")}
          <tr class="totals"><td><strong>Gross Earnings</strong></td><td class="right"><strong>${fmtBdt(p.gross)}</strong></td></tr>
        </table>
      </div>
      <div>
        <h3>Deductions</h3>
        <table>
          <tr><th>Item</th><th class="right">Amount</th></tr>
          ${deductionsRows.join("") || `<tr><td class="muted">No deductions</td><td></td></tr>`}
          <tr class="totals"><td><strong>Total Deductions</strong></td><td class="right"><strong>${fmtBdt(p.gross - p.net_pay)}</strong></td></tr>
        </table>
      </div>
    </div>
    <table>
      <tr class="totals"><th style="font-size:1.1em">NET PAY</th><td class="right" style="font-size:1.6em;color:#0a7c3a;font-weight:bold">${fmtBdt(p.net_pay)}</td></tr>
    </table>
    <div class="sig">
      <div>Prepared By</div>
      <div>Approved By</div>
      <div>Received By</div>
    </div>
    <div class="muted" style="margin-top:24px;font-size:11px">This is a computer-generated payslip and does not require a signature unless required by policy.</div>
  `;
  printHtml(html, { title: `Payslip — ${emp.full_name} — ${period}` });
}