# ERP Login + Role-Based Dashboard Plan

## Idea review (short answer)

Bro, idea ta solid — **practical and standard ERP pattern**. Two jinis ektu refine kortesi:

1. **Username diye login** — Supabase Auth shudhu email/phone support kore, raw username na. Solution: ekta `username` column profiles e rakhi, login form e user "username or email" type korle frontend e username → email resolve kore tarpor Supabase signIn call hobe. Clean, no hack.
2. **My Workspace (`/me`) admin der jonno off** — agree, but **fully remove na kore** admin der jonno hide kori (sidebar/redirect level e). Karon kichu admin nijer payslip/leave dekhte chaibe future e. Just default landing `/erp` rakhbo, `/me` link hide.

Baki sob — admin dashboard e side check-in/out widget, staff der dedicated operational dashboard (packed today, pending orders, attendance, live performance) — exactly right direction.

---

## Scope

### 1. Login UX upgrade (`/auth`)

- Single field: **"Username or Email"** + Password.
- Resolver: if input contains `@` → use as email; else lookup `profiles.username` → fetch email → `signInWithPassword`.
- Add `username` column to `profiles` (unique, nullable for legacy). Settings → Profile e edit option.
- "Remember me" + better error messages (Banglish).
- Forgot password link intact.

### 2. Role detection & routing

- Already exists: `useCurrentRole` + `user_roles` table. Reuse.
- Post-login redirect logic:
  - `admin` / `hr_admin` / `operations` → `/erp` (admin command center)
  - `employee` / `warehouse_staff` / `packer` / `customer_service` → `/erp` but renders **Staff Dashboard** (already built: `staff-dashboard.tsx`)
  - `/me` route — sidebar link only for non-admins.

### 3. Admin Dashboard — Attendance Side Widget

Add a compact **AttendancePunchCard** component on `/erp` (admin view), top-right column:

- Shows: today's status (Not punched / Working since 9:42 AM / On break / Done — 8h 12m).
- Buttons: **Check In** → **Start Break / End Break** → **Check Out**.
- Uses existing `punchIn`, `punchBreak`, `punchOut` server fns from `src/lib/erp/hr/punch.functions.ts`.
- Auto-resolves employee_id from current user (`hr_employees.user_id = auth.uid()`).
- Live timer (mm:ss ticking), late warning if past shift start.
- Geolocation optional (browser prompt, skippable).

### 4. Staff Dashboard upgrade (`staff-dashboard.tsx`)

Already exists with scoped KPIs. Add:

- **Attendance card** (same `AttendancePunchCard` component, reused).
- **Today's Packing**: count from `orders` where `packaged_by = me AND DATE(packaged_at) = today`.
- **My Pending Queue**: orders `assigned_to = me AND status IN ('new','confirmed')`.
- **Live Performance** strip: today vs 7-day avg (packs/hr, orders handled).
- Quick actions: "Start Packing", "Mark Dispatched", "Request Leave".
- Hide all financial/profit cards (already done).

### 5. Sidebar & shell adjustments

- `erp-sidebar.tsx`: hide "My Workspace" link for admins; show prominently for staff at top.
- Header: show punch status pill (green dot "Checked in 2h 14m") — click opens widget.

### 6. First-login onboarding

- If user has no `hr_employees` row linked → admin sees a banner "Link your employee profile to enable attendance". Staff sees a friendly setup screen instead of error.

---

## Technical details

**Files to create:**

- `src/components/erp/hr/attendance-punch-card.tsx` — reusable widget (admin + staff).
- `src/lib/erp/hr/me-punch.functions.ts` — `getMyPunchToday()` server fn returning today's row + active shift for current user (wraps existing punch fns).

**Files to modify:**

- `src/routes/auth.tsx` — username-or-email resolver, polish UI.
- `src/routes/_authenticated/erp.index.tsx` — mount `AttendancePunchCard` in sidebar column (admin) + route staff to staff dashboard (already partly done).
- `src/components/erp/staff-dashboard.tsx` — add punch card + packing/perf cards.
- `src/components/erp/erp-sidebar.tsx` — conditional "My Workspace" visibility.
- `src/components/erp/header-quick-actions.tsx` — add punch status pill.

**DB migration:**

- `ALTER TABLE profiles ADD COLUMN username text UNIQUE;`
- Index + grant (existing pattern).
- RPC `resolve_login_email(p_identifier text) RETURNS text` — security definer, returns email for given username (used by login form via anon-allowed RPC; rate-limit aware).

**Reused (no changes):**

- `punchIn` / `punchBreak` / `punchOut` / `getTodayPunchStatus` server fns.
- `useCurrentRole` hook.
- `hr_employees`, `hr_attendance`, `hr_shifts` tables.

---

## Out of scope (ask before adding)

- Face recognition / selfie mandatory.
- IP/geo-fence enforcement (only soft capture).
- Mobile app / PWA install prompt.
- 2FA on login.

---

## Rollout order

1. DB migration (username + RPC).
2. Login form upgrade.
3. AttendancePunchCard component.
4. Mount on admin dashboard + staff dashboard.
5. Sidebar/header polish.
6. Test with one admin + one staff account.

Idea ta approve korle ami order anusare implement shuru korbo. Kichu change/add korte chaile bolun.  
alada me lagbe na 