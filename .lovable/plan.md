
# HR Module — Advanced Plan

ERP-er pasher ekta full HRM module. Existing pattern follow korbe: `src/routes/_authenticated/erp.hr.*`, `src/components/erp/hr/`, `src/lib/erp/hr/`, sidebar e notun "HR" section.

---

## 1. Scope (Sub-modules)

1. **Dashboard** — Headcount, today's attendance, pending leaves, upcoming birthdays/anniversaries, open positions, payroll due, attrition mini-charts.
2. **Employees (Directory)** — Profile, documents, employment history, salary structure, bank/NID/TIN, emergency contact, reporting manager. Multi-brand assignment (jeman CRM-er moto brand filter).
3. **Departments & Designations** — Tree view, head of department, headcount per dept.
4. **Attendance**
   - Daily punch in/out (manual + future biometric/API ready)
   - Shift management (general, night, rotating)
   - Geo-fenced / IP-restricted check-in (optional toggle)
   - Monthly muster roll, late/early/overtime auto-calc
   - Import from CSV/XLSX (biometric export)
5. **Leave Management**
   - Leave types (Casual, Sick, Earned, Maternity, Unpaid, Custom)
   - Yearly allocation + carry-forward + encashment rules
   - Apply / approve workflow (manager → HR)
   - Leave calendar (team view), holiday calendar (BD)
6. **Payroll**
   - Salary structure templates (Basic, HRA, Medical, Transport, Bonus, Allowances, Deductions)
   - Monthly payroll run: attendance + leave + OT + advance + tax → net pay
   - Payslip generate (PDF), bulk email
   - Bank disbursement file export (BD banks CSV)
   - Provident Fund, Tax (BD slab), Loan/Advance tracking
   - Bonus runs (Eid, festival, performance)
7. **Performance**
   - KPI / OKR setup per role
   - Review cycles (quarterly/yearly), 360° feedback
   - Rating, increment recommendation → feeds payroll
8. **Recruitment (ATS)**
   - Job posts (internal + public career page later)
   - Applicants pipeline (Applied → Screening → Interview → Offer → Hired/Rejected)
   - Interview scheduling, scorecards
   - Offer letter generate
9. **Onboarding / Offboarding**
   - Checklist templates (IT setup, document collection, training)
   - Exit checklist, F&F (full & final settlement), clearance
10. **Training & Development**
    - Training programs, attendees, completion tracking, certificates
11. **Assets & Loans**
    - Company asset assignment (laptop, phone, SIM)
    - Salary advance / loan with EMI auto-deduction in payroll
12. **Documents / Policies**
    - Policy library, employee acknowledgement tracking
    - Document expiry alerts (NID, passport, contract)
13. **Announcements** — Company-wide notice board with read receipts.
14. **Reports & Analytics**
    - Headcount trend, attrition, gender ratio, salary cost per brand/dept, attendance %, leave utilization, payroll cost trend, recruitment funnel
    - Export CSV/XLSX/PDF
15. **Settings**
    - Brand-wise HR config, shift, holiday, leave policy, payroll components, tax slab, approval chain, numbering sequences
    - Role-based access (HR Admin, HR Executive, Manager, Employee Self-Service)

---

## 2. Self-Service Portal (ESS)

Employee role pele ekta limited view:
- Nijer profile + payslip download
- Apply leave, view balance
- Punch in/out
- View team calendar
- Acknowledge policies
- Submit expense claim (later phase)

---

## 3. Database (Supabase) — New Tables

Naming: `hr_*`. Sob table-e `brand_id` (nullable for global), `created_at`, `updated_at`, RLS via `has_role` + brand permission.

- `hr_employees` (employee_code, user_id?, name, dob, gender, joining_date, status, dept_id, designation_id, manager_id, brand_ids[], contact, nid, tin, bank_*, photo_url)
- `hr_departments`, `hr_designations`
- `hr_employment_history` (promotion, transfer, salary change)
- `hr_documents` (type, file_url, expiry_date)
- `hr_shifts`, `hr_employee_shifts`
- `hr_attendance` (date, in_time, out_time, source, status, late_min, ot_min)
- `hr_holidays`
- `hr_leave_types`, `hr_leave_balances`, `hr_leave_requests`
- `hr_salary_structures`, `hr_salary_components`, `hr_employee_salary`
- `hr_payroll_runs`, `hr_payslips`, `hr_payslip_lines`
- `hr_loans`, `hr_loan_repayments`
- `hr_kpis`, `hr_reviews`, `hr_review_scores`
- `hr_jobs`, `hr_applicants`, `hr_applicant_stages`, `hr_interviews`
- `hr_onboarding_templates`, `hr_onboarding_tasks`
- `hr_trainings`, `hr_training_attendees`
- `hr_assets`, `hr_asset_assignments`
- `hr_policies`, `hr_policy_acks`
- `hr_announcements`, `hr_announcement_reads`
- `hr_settings`

Migration-e GRANT + RLS + update_at trigger sob ekshathe.

---

## 4. Server Functions

`src/lib/erp/hr/*.functions.ts` — module-wise file:
- `employees.functions.ts`, `attendance.functions.ts`, `leave.functions.ts`, `payroll.functions.ts`, `recruitment.functions.ts`, `performance.functions.ts`, `reports.functions.ts`
- Sob `requireSupabaseAuth` + role check (HR roles)
- Payroll run = transactional: lock period, calculate, write payslips, mark paid

---

## 5. UI / Routes

```
erp.hr.tsx                    (layout + sidebar nav)
erp.hr.index.tsx              (dashboard)
erp.hr.employees.index.tsx
erp.hr.employees.$id.tsx      (tabs: Profile / Salary / Attendance / Leave / Documents / History)
erp.hr.employees.new.tsx
erp.hr.departments.tsx
erp.hr.attendance.index.tsx
erp.hr.attendance.muster.tsx
erp.hr.leave.index.tsx
erp.hr.leave.calendar.tsx
erp.hr.leave.policy.tsx
erp.hr.payroll.index.tsx
erp.hr.payroll.$runId.tsx
erp.hr.payroll.structures.tsx
erp.hr.performance.index.tsx
erp.hr.performance.$reviewId.tsx
erp.hr.recruitment.jobs.tsx
erp.hr.recruitment.applicants.tsx
erp.hr.onboarding.tsx
erp.hr.training.tsx
erp.hr.assets.tsx
erp.hr.documents.tsx
erp.hr.announcements.tsx
erp.hr.reports.tsx
erp.hr.settings.tsx
erp.hr.me.tsx                 (ESS - self portal)
```

Components: KPI cards (recharts), data tables with density toggle/sticky header/bulk actions (CRM-er moto reuse pattern), import dialog (CSV+XLSX), drawer-based detail panels, calendar (react-day-picker), Kanban for recruitment pipeline.

---

## 6. Permissions

User roles enum extend: `hr_admin`, `hr_manager`, `employee`. `has_role` + `staff_permissions` table use kore route-level + row-level gate.

---

## 7. Phased Delivery

Eto boro module ek shathe build kora risky. Recommended phases:

- **Phase 1 (foundation)** — Settings, Departments, Designations, Employees CRUD + import, Dashboard skeleton, Sidebar wiring, DB + roles.
- **Phase 2** — Attendance + Shifts + Holidays + Leave (types, balance, request workflow, calendar).
- **Phase 3** — Salary structures + Payroll run + Payslip PDF + Loans/advances.
- **Phase 4** — Performance (KPI/review) + Recruitment (ATS pipeline) + Onboarding.
- **Phase 5** — Training, Assets, Documents+expiry, Announcements, Policies.
- **Phase 6** — Reports/Analytics, ESS portal polish, exports, bulk actions, audit logs.

---

## Questions before I start

1. **Phase 1 theke shuru kori?** (recommended — incremental, testable) ba **full scaffolding ek shathe** (sob route+table create, then fill)?
2. **Payroll currency & tax** — BDT + Bangladesh tax slab assume korchhi, thik?
3. **ESS (self-service portal)** — employees ki same app-e login korbe (existing auth), naki shudhu HR staff use korbe ekhon?
4. **Brand scoping** — ekjon employee multiple brand e kaj korte pare (CRM-er moto multi-brand), naki ekta brand-e fixed?
