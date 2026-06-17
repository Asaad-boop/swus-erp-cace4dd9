## HRM Full Rebuild Plan

Existing 13 tables + 16 routes keep থাকবে। Schema additive only — কোনো column/table drop হবে না।

---

### Phase 0 — Foundation (1 migration + helpers)

**Migration 1: schema extensions + new tables + storage buckets**
- `hr_attendance` → add `check_in_time timestamptz`, `check_out_time timestamptz`, `break_start timestamptz`, `break_end timestamptz`, `check_in_lat numeric`, `check_in_lng numeric`, `check_out_lat numeric`, `check_out_lng numeric`, `selfie_url text`, `total_hours numeric`
- `hr_employees` → ensure `bank_name`, `bank_account_no` (already present per types) — add `bank_branch_code text` if missing; add `photo_url` index
- `hr_documents` → ensure cols: `employee_id`, `doc_type`, `file_url`, `file_name`, `expiry_date`, `uploaded_by`, `notes` (audit existing → add missing)
- `hr_employment_history` → ensure cols: `employee_id`, `event_type` (promotion/transfer/salary_revision/status_change), `from_value jsonb`, `to_value jsonb`, `effective_date`, `note`, `created_by`
- **NEW** `hr_payroll_runs(id, month int, year int, brand_id uuid null, status text default 'draft', total_gross numeric, total_net numeric, total_employees int, finalized_at, finalized_by, created_at, updated_at)` — unique(month, year, brand_id)
- **NEW** `hr_payslips(id, run_id fk, employee_id fk, basic numeric, allowances jsonb, deductions jsonb, gross numeric, net_pay numeric, payment_status text default 'pending', payment_method text, payment_ref text, paid_at, paid_by, snapshot jsonb /* employee info at time of run */, created_at, updated_at)` — unique(run_id, employee_id)
- GRANTs + RLS for both new tables: SELECT/INSERT/UPDATE/DELETE TO authenticated gated by `has_hr_access`; finalize/delete gated by `has_hr_admin`
- Storage buckets (via storage tool, separate calls): `hr-documents` (private), `hr-attendance-selfies` (private)
- RLS policies on `storage.objects` for both buckets: authenticated read/write within `hr_*` prefix

**Helpers**
- `src/lib/erp/hr/role-gate.ts` — client hook `useHrAccess()` wrapping `useCurrentRole` + `has_role('admin'|'operations')` rpc check
- `src/lib/erp/hr/storage.ts` — `uploadHrFile(bucket, path, file|blob)` + `getSignedUrl`
- `src/lib/erp/hr/excel.ts` — generic `exportToXlsx(rows, sheetName, filename)` using existing `xlsx` dep
- `src/lib/erp/hr/pdf.ts` — payslip rendered as printable HTML in a hidden iframe → `window.print()` (no new dep; matches existing `order-invoice.tsx` print pattern)

---

### Phase 1 — Employee Profile Tabs (rebuild `erp.hr.employees.$id.tsx`)

Tabbed shell using shadcn `Tabs`:
1. **Profile** — `EmployeeForm` (existing) + new `PhotoUpload` (uploads to `hr-documents/{id}/avatar.jpg`, writes `photo_url`)
2. **Employment** — dept/designation/manager/joining/type/status (subset of form)
3. **Salary** — basic, allowances JSON editor (house/transport/medical/other), deductions JSON (PF/tax/loan/other), gross + net preview — **admin/operations only**
4. **Documents** — list from `hr_documents`, upload dialog (type select + file + optional expiry), download via signed URL, delete (admin)
5. **History** — timeline from `hr_employment_history` + "Add entry" dialog (admin)
6. **Attendance Summary** — last 30 days grid (calendar heatmap, color by status)
7. **Leave Summary** — current year balance table (allocated/used/remaining per leave type)

**List upgrades (`erp.hr.employees.index.tsx`)**
- URL search params via TanStack Router `validateSearch` (dept, status, designation, q)
- Bulk select column + bulk actions menu: Deactivate, Change Department (dialog), Export CSV
- Avatar in first column
- Global search debounced 300ms

**New server fns** (`src/lib/erp/hr/employees.functions.ts` or extend `hr.functions.ts`)
- `bulkUpdateEmployees({ ids, patch })`, `exportEmployeesCsv` (returns rows)
- `getEmployeeSummary({ employeeId })` → returns last 30 days attendance + current year leave balances

---

### Phase 2 — Attendance Punch + GPS/Selfie

**New server fns** (`attendance.functions.ts` extend)
- `punchIn({ employeeId, lat?, lng?, selfieBase64? })` — uploads selfie to bucket, inserts/updates today's row, auto-status by shift start time + grace
- `punchBreak({ employeeId, action: 'start'|'end' })`
- `punchOut({ employeeId, lat?, lng? })` — sets out_time, computes total_hours
- `getTodayPunchStatus({ employeeIds })` — bulk fetch

**UI — `erp.hr.attendance.index.tsx`** keeps Manual mode, adds toggle:
- "Live Mode" view: rows per employee with [Check In] [Break Start/End] [Check Out] buttons, status badge (Not Started / In / On Break / Out), elapsed hours
- "Check In with Location" → `navigator.geolocation.getCurrentPosition`
- "Selfie Check In" dialog → `getUserMedia({ video: true })` → canvas snap → base64 → server fn

**Muster Roll (`erp.hr.attendance.muster.tsx`)**
- Columns: late count, absent count, OT hours (computed from rows)
- Click cell → dialog: punch in/out time, total hours, selfie thumbnail (signed URL), "Open in Maps" link (`https://maps.google.com/?q={lat},{lng}`)
- "Export Excel" button → full month grid via `exportToXlsx`

---

### Phase 3 — Shift Assignment

New section in Employee Profile → Employment tab: "Current Shift" + history of `hr_employee_shifts`, "Assign Shift" dialog (shift + effective_from).

New page `/erp/hr/shifts/assign` (file `erp.hr.shifts.assign.tsx`) added to sub-nav under Shifts:
- Table: all employees + current shift, bulk-assign by department
- New server fns: `assignShift`, `bulkAssignShiftByDepartment`, `getCurrentShifts`

---

### Phase 4 — Payroll (new route `/erp/hr/payroll`)

Files:
- `erp.hr.payroll.tsx` — layout (Outlet)
- `erp.hr.payroll.index.tsx` — list of runs (month/year/status/totals) + "New Run" button
- `erp.hr.payroll.$runId.tsx` — editable payslip table for the run
- `src/lib/erp/hr/payroll.functions.ts` — `listRuns`, `createRun({month, year})` (generates draft payslips from active employees + salary), `updatePayslip`, `finalizeRun` (locks status, stamps `finalized_at`), `markPayslipPaid({ id, method, ref })`, `getPayslip(id)`, `exportBankSheet(runId)` (xlsx: name | bank | account | amount)
- `payslip-pdf.tsx` component → printable HTML (company header from `app_settings`, employee snapshot, earnings/deductions tables, net pay, signature) → triggers `window.print()` in hidden iframe

Generation logic: pulls `gross_salary` from employee → splits into basic/allowances per `hr_settings` ratio (default 60% basic / 30% house / 5% transport / 5% medical) — editable per row.

Add "Payroll" link to `hr-subnav.tsx`.

---

### Phase 5 — Documents UI

Already covered as Profile → Documents tab (Phase 1). Server fns:
- `listEmployeeDocuments`, `uploadEmployeeDocument` (handles storage + row insert), `deleteEmployeeDocument` (admin), `getDocumentSignedUrl`
- Expiry alert: query in dashboard "Documents expiring soon" widget (expiry_date between today and +30d)

---

### Phase 6 — HR Reports (`/erp/hr/reports`)

New file `erp.hr.reports.tsx` with tabbed reports:
1. Headcount — group-by selector (dept/designation/type/status), bar chart + table
2. Attendance — date range + employee filter, computed counts
3. Leave Summary — year + employee filter, allocated/used/remaining
4. Payroll — month/year, per-employee paid amounts
5. Birthday & Anniversary — next 30 days

Each tab: "Export Excel" via `exportToXlsx`. Add "Reports" to `hr-subnav.tsx`.

Server fns in `src/lib/erp/hr/reports.functions.ts`.

---

### Phase 7 — Dashboard Upgrade (`erp.hr.index.tsx`)

Add KPI cards: Today's Present/Absent/Late/OnLeave (live from attendance + leave), Pending Leave Requests (with inline approve/reject), This-month Payroll Status, Documents Expiring Soon (count).

Charts:
- Attendance trend last 30 days — Recharts `LineChart` (existing dep)
- Leave type distribution — `PieChart`
- Keep dept-wise headcount bar

Widgets: "Birthdays this week", "Anniversaries this week" (separate from full 30-day list), Recent activity (last 5 from `activity_logs` filtered to HR tables).

New server fn `getHrDashboardExtras()` combining the above.

---

### Phase 8 — Role Gating

- `useHrAccess()` returns `{ canAccess, isAdmin, isOps, canSeeSalary, canApproveLeave, canMarkAttendance }`
- Components gate via early-return "Locked" card for non-permitted users
- Server fns already use `assertAccess`/`assertAdmin` — extend with `assertSalaryAccess` (admin or operations) for salary + payroll fns
- Add `has_role` RPC checks where needed (admin/operations roles already in `app_role` enum)

---

### Build Order (matches user's spec)

1. Migration + storage buckets + role helpers (Phase 0 + 8)
2. Employee profile tabs + list upgrades (Phase 1, includes Phase 5 Docs UI)
3. Attendance punch + GPS/selfie + muster upgrade (Phase 2)
4. Shift assignment (Phase 3)
5. Payroll module + PDF + bank sheet (Phase 4)
6. Reports page (Phase 6)
7. Dashboard upgrade (Phase 7)

---

### Technical Notes

- **PDF**: existing project uses print-based PDFs (`order-invoice.tsx`) — same pattern for payslips, no new dep
- **Excel**: `xlsx` (already installed) used for all exports
- **Selfie/Camera**: `getUserMedia` runs client-side only — wrap in client component, no SSR
- **GPS**: `navigator.geolocation` client-side, fail-soft if permission denied (still records punch)
- **Storage**: private buckets, all reads via signed URLs (1-hour TTL)
- **Brand scope**: HR explicitly global per user — no `applyBrandScope` on HR queries; payroll runs optionally tagged with brand_id for filtering
- **No data deletion**: all migrations additive; existing rows untouched
- **Realtime**: not added (out of scope)

---

### Deliverables (after build)

1. ✅/⚠️/❌ table per phase
2. Migration files created
3. Storage buckets created (`hr-documents`, `hr-attendance-selfies`)
4. Manual setup: none expected — camera/GPS permissions are per-user browser prompts; no API keys needed

---

### Open Questions Before Build

1. **Payroll basic/allowance split default** — confirm 60/30/5/5 or different ratio? (Stored in `hr_settings`, editable later)
2. **Selfie storage** — private bucket + signed URL (1h) OK, or public bucket for simpler muster viewing?
3. **Existing role values** — confirm `app_role` enum has `operations` value, or should I use only `admin` + custom check?
