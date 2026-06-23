# Staff Workspace — আলাদা Dashboard Plan

Owner-er ERP dashboard staff-der dorkar nei. Tader jonno `/me` ke ekta full **Employee Workspace** banabo — login korle direct etai khulbe, ar tader role/permission onujayi shob kaaj ekhanei thakbe.

## 1. Routing & Entry Flow

```
Login
  ├─ admin / backoffice role  → /erp (owner dashboard)
  └─ employee / staff only    → /me (workspace dashboard)
```

- `_authenticated/route.tsx` e already redirect ache — confirm korbo: jodi user-er kono backoffice role na thake, `/erp/*` block + `/me` te pathabe.
- `/me` ke ekhon ekta proper **layout route** banabo (`me.tsx` Outlet + sidebar/topbar shell), shob `me.*` child page er jonno.

## 2. Workspace Shell (নতুন look)

`/me` layout e thakbe:

- **Top bar**: company logo, greeting ("Salam, Rakib"), live clock, notification bell, profile menu (logout).
- **Left sidebar** (collapsible, mobile e bottom-nav): My Day, Attendance, Leave, Payslips, Documents, Performance, Profile. Sidebar items **permission onujayi filter** hobe (access matrix theke).
- **Main**: current page.

## 3. My Day (default `/me` page) — redesign

Ekta "kaaj shuru korar" hub:

- **Punch card** (hero) — boro check-in/out button, today's status, work hours timer, break toggle, location/IP shown.
- **Go to Workspace** card — check-in er por boro CTA (already ache).
- **Today's snapshot** — shift time, scheduled hours, late/early indicator.
- **My pending items** — leave request status, approval needed (if manager), unread announcement.
- **This week** — mini attendance strip (Mon–Sun dots), leave balance, upcoming holiday.
- **Quick actions** — Apply leave, View payslip, Update profile.

## 4. Sub-pages (already exist, polish)

| Route | Content |
|---|---|
| `/me/attendance` | Calendar + month summary + daily punch log |
| `/me/leave` | Balance cards + apply form + my requests timeline |
| `/me/payslips` | List of payslips, download PDF, YTD summary |
| `/me/performance` | Goals, reviews, KPI (jodi data thake; na thakle hide) |
| `/me/profile` | Read-only personal info + edit request |
| `/me/documents` (notun) | Offer letter, ID copies, contracts download |

## 5. Permission-driven Visibility

`src/lib/erp/access.ts` extend kore `me` workspace-er jonno feature flags:
- `me:attendance`, `me:leave`, `me:payslips`, `me:performance`, `me:documents`
- Manager role hole extra: `me:team-approvals` (team-er leave approve), `me:team-attendance`.

Sidebar + My Day cards eigulor presence onujayi render hobe.

## 6. Data dependencies

Shob existing table use korbe — notun migration lagbe na:
- `hr_employees`, `hr_attendance`, `hr_leave_requests`, `hr_leave_balances`, `hr_payslips`, `hr_documents`, `hr_shifts`, `hr_holidays`.
- RLS already user-scoped (`employee_id = auth.uid()` based) — verify korbo.

## 7. Visual direction

HR module-er moto same design tokens (`--hr-accent`, soft surfaces, rounded-2xl cards, subtle gradients). Owner ERP er moto data-heavy noy — **calm, personal, mobile-first**. Boro typography, bhalo spacing, smooth transitions.

## 8. Implementation order

1. `me.tsx` layout shell (sidebar + topbar + Outlet) + access-filtered nav.
2. `me.index.tsx` redesign — My Day hub.
3. Sub-pages ekta ekta kore polish (attendance → leave → payslips → profile → documents).
4. Manager extension (team approvals) — last e, jodi lage.
5. Login redirect + `/erp` block verify.

## Question

Step 1+2 (shell + My Day hub) diye start kori, naki age **manager role** add korbo jate manager-ra team approve korte pare? Ar `documents` page ekhon banabo na pore?
