# HRM Premium Redesign Plan

**Scope:** Visual only. No changes to routes, server functions, queries, mutations, or data shape. Only JSX/className/Tailwind, plus shared design tokens and small presentational helpers.

**Approach:** Foundation first, then page-by-page in phases. Each phase ships independently so you can review.

---

## Phase 0 — Design Foundation (shared, ~1 step)

Create reusable presentational primitives so every HR page is consistent and we don't repeat Tailwind soup:

- `src/components/erp/hr/ui/page-header.tsx` — title (24px semibold), subtitle, right-aligned action slot
- `src/components/erp/hr/ui/section-label.tsx` — 13px uppercase tracked muted label
- `src/components/erp/hr/ui/stat-card.tsx` — KPI card: label, big tabular number, trend chip, optional left-border accent color
- `src/components/erp/hr/ui/status-pill.tsx` — unified badge map (Present/Absent/Late/Leave/Draft/Finalized/Paid/Pending → matching bg/text)
- `src/components/erp/hr/ui/empty-state.tsx` — icon-in-rounded-tile + title + subtitle + optional CTA
- `src/components/erp/hr/ui/skeleton-row.tsx` / `skeleton-card.tsx` — pulse loaders matching table/card shape
- `src/components/erp/hr/ui/avatar.tsx` — 40/80 px avatar w/ initials fallback
- `src/components/erp/hr/ui/filter-bar.tsx` — pill-style inline filter container

Tokens via Tailwind utility classes per spec (indigo-600 primary, gray-50/100/200 borders, rounded-xl cards, shadow-sm → shadow-md hover, 150ms transitions). No global CSS rewrite — keep existing shadcn theme intact; new components compose on top.

**Note:** Existing shadcn `Card`, `Button`, `Badge`, `Table`, `Input` stay in use; new HR primitives wrap or extend them so we don't fork the design system.

---

## Phase 1 — HR Dashboard (`erp.hr.index.tsx`)

- 4-card KPI hero (Present / Absent / On Leave / Late) with left-border accent + trend chip
- Row 2: Pending Leaves (with inline approve/reject), Payroll Status (progress bar), Expiring Docs (alert)
- Charts: full-width attendance line, donut + horizontal bar row
- Bottom: Birthdays/Anniversaries + Recent Activity timeline

## Phase 2 — Employees list + profile

- `erp.hr.employees.index.tsx`: header + filter bar + inline stat chips + avatar table + bulk-action floating bar + empty state
- `erp.hr.employees.$id.tsx`: profile header card (80px avatar, quick-stats grid, edit menu) + sticky tab bar with icons; each tab content gets the new card treatment

## Phase 3 — Attendance

- `erp.hr.attendance.index.tsx`: Manual/Live pill toggle; Live = employee cards with context-aware actions; Manual = clean date-picker table
- `erp.hr.attendance.muster.tsx`: sticky-name column grid, colored cell chips, summary row/column, click-cell slide-over (Sheet) with punch + selfie

## Phase 4 — Leave

- `erp.hr.leave.index.tsx`: card-style requests with avatar, leave-type color band, status pill, inline approve/reject
- `erp.hr.leave.calendar.tsx`: clean month grid color-coded by leave type
- `erp.hr.leave.policy.tsx`: matches new card pattern

## Phase 5 — Payroll

- `erp.hr.payroll.index.tsx`: month-run cards (month, employee count, total, status, actions)
- `erp.hr.payroll.$runId.tsx`: data table with sticky summary footer (Gross / Deductions / Net), right-aligned tabular-nums, prominent Finalize with confirmation summary
- `payslip-print.tsx`: cleaner print layout

## Phase 6 — Reports

- `erp.hr.reports.tsx`: horizontal pill tabs, per-tab filter bar + chart + table, always-visible Export top-right

## Phase 7 — Shifts, Holidays, Departments, Designations

- `erp.hr.shifts.tsx`: card grid (name, time, grace, headcount, actions)
- `erp.hr.shifts.assign.tsx`: cleaner two-column layout
- `erp.hr.holidays.tsx`: month-grouped timeline list
- `erp.hr.departments.tsx` + `erp.hr.designations.tsx`: two-column side-by-side lists with employee-count badges

## Phase 8 — Polish pass

- Sub-nav (`hr-subnav.tsx`) restyle to match new header language
- Skeleton + empty states wired everywhere
- Micro-animations (hover lift, fade-in on mount via `animate-fade-in`)
- Final consistency sweep (button sizes, focus rings, spacing scale)

---

## Guardrails

- Zero changes to: server functions, query keys, mutations, route configs, table schemas, RLS, role gating logic
- Zero changes to props of existing server-bound components (form payloads identical)
- Existing `useHrAccess`, brand picker, role gates all preserved
- Build verified after each phase

## Build order

Phase 0 → 1 → 2 → 3 → 5 → 4 → 6 → 7 → 8 (Payroll before Leave because it's higher visual ROI for you).

## What I need from you

1. **Confirm phased delivery is OK** (each phase = one turn, you review and say "next"). Or do you want one mega-turn?
2. **Sub-nav styling:** keep current tab look or also restyle to underline-pill hybrid like Linear?
3. **Charts:** keep current Recharts setup, just restyle axes/tooltip/colors — correct?

Reply "go" + answers and I start Phase 0+1 together.  
**Phased delivery OK** — phase by phase koro, ami review korbo

1. **Sub-nav** — pill style (Linear er moto)
2. **Charts** — Recharts keep, just restyle

Phase 0 + 1 শুরু করো। 🚀

&nbsp;