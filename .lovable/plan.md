## Staff Self-Service Portal (My Workspace)

Staff der jonno alada ekta portal — login korar por nijer attendance, performance, payslip, leave shob ekta jaygai. Mobile-first design (boro touch targets, bottom nav), but desktop eo polished.

### Route: `/me` (Staff Portal)

Bortoman ERP `/erp/*` admin/manager der jonno. Staff der jonno alada layout `/me/*` — same auth, but stripped-down mobile-first shell.

```text
src/routes/_authenticated/me.tsx              ← shell (bottom nav mobile, sidebar desktop)
src/routes/_authenticated/me.index.tsx        ← Dashboard (today card, KPIs, quick punch)
src/routes/_authenticated/me.attendance.tsx   ← Monthly calendar + log
src/routes/_authenticated/me.leave.tsx        ← Balance, apply leave, history
src/routes/_authenticated/me.payslips.tsx     ← Salary, payslip history, YTD
src/routes/_authenticated/me.performance.tsx  ← KPIs, attendance %, punctuality, OT trend
src/routes/_authenticated/me.profile.tsx      ← Profile, bank, emergency contact (view-mostly)
```

Sidebar `/erp` te ekta "My Workspace" link, ar login er por staff (non-admin) hole `/me` te redirect.

### Dashboard (`/me`) — Mobile-First Hero

Boro **Punch Card** uporei:
- Live clock + greeting ("Shubho shokal, Rahim")
- Status pill: **Not checked in / Working / On break / Checked out**
- **One giant action button** that morphs by state:
  - Not in → "Check In" (green, gradient)
  - Working → "Start Break" (amber) + secondary "Check Out"
  - On break → "End Break" (blue)
  - Done → "✓ Done for today — 8h 12m"
- Sub-line: shift name, scheduled time, late/early warning
- Geo + selfie capture optional (uses existing `lat/lng/selfie_url` on punchIn)

Niche 4-up KPI grid:
- This week hours / target
- Late count this month
- Leave balance (sum)
- This month earnings (gross prorated)

Aro niche:
- "Recent activity" timeline (last 5 punches)
- "Upcoming" — holidays, approved leaves, payday

### Performance (`/me/performance`)

- Attendance % (last 30/90 days) — ring chart
- Punctuality score — `(present - late) / present`
- Total work hours trend — sparkline (last 8 weeks)
- OT hours trend
- Leave usage vs balance — stacked bar
- Streak: "12 days on-time in a row"

Shob existing `hr_attendance` theke aggregate — notun table lagbe na.

### Attendance (`/me/attendance`)

- Month calendar grid — protita din color-coded (present/late/absent/leave/holiday)
- Tap kore din-er details: in/out time, work hrs, late min, break
- Export own CSV

### Leave (`/me/leave`)

- Balance cards per leave type
- "Apply Leave" sheet (existing `hr_leave_requests` use)
- History list with status badges

### Payslips (`/me/payslips`)

- Current month salary breakdown (basic + allowances - deductions)
- Past payslips list — tap to view full printable (reuse `payslip-print.tsx`)
- YTD totals: earnings, deductions, net

### Profile (`/me/profile`)

Read-mostly. Photo, contact, bank, emergency. Edit request flow ekhon scope nai — admin via HR korbe.

### Server functions (notun)

`src/lib/erp/hr/me.functions.ts`:
- `getMyEmployee()` → current user er `hr_employees` row (user_id match)
- `getMyToday()` → today's attendance + active shift + status
- `getMyDashboardStats()` → week hrs, month late, leave balance sum, month earnings estimate
- `getMyAttendanceMonth({ ym })` → calendar data
- `getMyPerformance({ days })` → metrics
- `getMyPayslips()` / `getMyPayslip({ id })`
- `getMyLeaveBalances()` / `getMyLeaveRequests()`

Existing `punchIn/punchOut/punchBreak` reuse — but `assertAccess` (has_hr_access) e self-punch allow korar jonno ekta tweak: jodi `employee_id` er `user_id === context.userId` hoy, tahole access lagbe na. Eta migration noy, function patch.

### Mobile UX detail

- `me.tsx` shell e bottom tab bar (md:hidden) — Home/Attendance/Leave/Payslip/Profile (5 icons)
- Desktop e left rail (hidden md:flex)
- Sticky top: brand + bell + avatar
- Safe-area padding (`pb-[env(safe-area-inset-bottom)]`)
- Buttons min 48px tap, font ~16px (no zoom)
- Pull-to-refresh feel via prominent refresh on dashboard

### Auth/role

- Existing `_authenticated` gate already protects — additional check: must have an `hr_employees` row linked to `user_id`. Na thakle "Contact HR to link your account" empty state.
- Admin/manager o `/me` use korte parbe nijer data dekhar jonno.

### Verification

- DB query confirmed: `hr_employees.user_id` exists, `hr_attendance` e break_start/break_end ace, punch functions ready.
- No new tables/migrations needed. Pure new routes + 1 server-function file + small punch.functions.ts patch.

### What I'll build now

1. `me.functions.ts` (all read fns)
2. Patch `punch.functions.ts` self-access
3. `me.tsx` shell with mobile bottom nav + desktop rail
4. `me.index.tsx` dashboard with hero punch card
5. `me.attendance.tsx`, `me.leave.tsx`, `me.payslips.tsx`, `me.performance.tsx`, `me.profile.tsx`
6. Sidebar link in `/erp` → "My Workspace"

Performance / leave / payslip page gula data thakle full render, na thakle clean empty state (per your rule).