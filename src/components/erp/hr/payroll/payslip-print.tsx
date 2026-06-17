import { printHtml, fmtBdt } from "@/lib/erp/hr/pdf";

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

  const rows = (obj: Record<string, number>) =>
    Object.entries(obj)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `<tr><td style="text-transform:capitalize">${k}</td><td class="right">${fmtBdt(Number(v))}</td></tr>`)
      .join("");

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
          <tr><th>Component</th><th class="right">Amount</th></tr>
          <tr><td>Basic</td><td class="right">${fmtBdt(p.basic)}</td></tr>
          ${rows(allow)}
          <tr class="totals"><td>Gross</td><td class="right">${fmtBdt(p.gross)}</td></tr>
        </table>
      </div>
      <div>
        <h3>Deductions</h3>
        <table>
          <tr><th>Component</th><th class="right">Amount</th></tr>
          ${rows(ded) || `<tr><td class="muted">No deductions</td><td></td></tr>`}
          <tr class="totals"><td>Total Deductions</td><td class="right">${fmtBdt(p.gross - p.net_pay)}</td></tr>
        </table>
      </div>
    </div>
    <table>
      <tr class="totals"><th>Net Pay</th><td class="right" style="font-size:1.4em;color:#0a7c3a">${fmtBdt(p.net_pay)}</td></tr>
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