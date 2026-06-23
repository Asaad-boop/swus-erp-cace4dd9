## HR module — full UI redesign + functional polish

Scope: HR only (Finance, Inventory baki gula ei plane nai). 22 ta HR route file already ache, real data wired with `hr_*` tables. Kaj holo design language unify kora + functional gap fill kora, structure bhanga noy.

### Notun HR design direction

Finance er moto generic card-grid noy. HR er nijer ekta identity dibo:

- **Palette:** existing `--background/--foreground/--primary` semantic tokens. HR-specific accents:
  - `--hr-present` (emerald), `--hr-absent` (rose), `--hr-leave` (amber), `--hr-off` (slate) — attendance/leave status er jonno
  - `--gradient-hr-hero` — overview hero te subtle gradient
- **Typography hierarchy:** page header e boro display number (today's headcount, attendance %), tar niche dense data
- **Layout primitive:** new `HrPageShell` component — sticky page header (title + breadcrumb + primary action + filter row) + content area. Sob page eta use korbe → instant consistency.
- **Data display:** `HrStatTile` (compact KPI), `HrPersonRow` (avatar + name + designation + status pill), `HrStatusPill` (Present/Absent/Leave/Late color-coded)

### Page-by-page kaj

```text
1. /erp/hr  (Overview)
   - Hero strip: aaj ke present, on leave, absent, late — boro numbers
   - Today's attendance mini-grid (department-wise %)
   - Upcoming: holidays (next 30d), birthdays (this month), pending leave requests
   - Quick actions: Add employee · Mark attendance · Create payroll run

2. /erp/hr/employees
   - Redesigned list: avatar grid view toggle (card/table)
   - Filter rail: department · designation · status · join date
   - Bulk actions, CSV import button polish

3. /erp/hr/employees/$id  (Profile)
   - Tabbed profile: Overview · Job · Attendance · Leave · Payroll · Documents
   - Hero card: avatar + name + designation + employment status pill + quick contact

4. /erp/hr/attendance  (index + muster)
   - Day view: live present/absent counter top, then department-grouped person rows with check-in/out time + late badge
   - Muster (monthly grid): cleaner cell colors using new status tokens, sticky employee column, month-picker in header

5. /erp/hr/leave  (index + calendar + policy)
   - Index: request inbox style — pending top, approved/rejected tabs, approve/reject inline
   - Calendar: month grid, leave blocks color-coded by type
   - Policy: leave types as cards with balance formula visible

6. /erp/hr/payroll  (index + run detail)
   - Index: payroll runs timeline, status pills, gross/net totals
   - Run detail: payslip table with filter, bulk approve/lock, export

7. /erp/hr/shifts (+ assign)
   - Shift cards (time bands visualized as a 24h bar)
   - Assign: drag-free simple flow — pick employees, pick shift, date range

8. /erp/hr/departments, /designations, /holidays
   - Compact CRUD with new shell, inline edit dialogs

9. /erp/hr/reports
   - Report cards grid: Attendance summary · Leave usage · Payroll cost · Headcount trend — each opens a focused report view

10. /erp/hr/settings
    - Sectioned settings: Working hours · Late policy · Leave year · Payroll cycle · Notifications
```

### Implementation order

1. **Foundation (1 batch):** `HrPageShell`, `HrStatTile`, `HrPersonRow`, `HrStatusPill`, status tokens in `src/styles.css`, sub-nav refresh.
2. **Overview + Employees list + Profile** — high-traffic pages first.
3. **Attendance (day + muster)** — most data-dense, biggest visual win.
4. **Leave (index + calendar + policy).**
5. **Payroll (index + run detail).**
6. **Shifts, Departments, Designations, Holidays, Reports, Settings** — short pages, batched.

### Non-goals

- Database schema, RLS, server functions — untouched
- Finance, Inventory, Sales, Marketing modules — untouched
- Sidebar structure — untouched (HR entries already correct)

### Verification

Each batch er por: build pass + Playwright screenshot of redesigned page at 1280×1800 + console error scan. Empty-state guards: data na thakle card/section hide hobe (user rule).

### Estimate

~5-6 turn lagbe pura HR shesh korte. Foundation + first 2 pages ekshathe first turn e diye dibo, tarpor incremental.
