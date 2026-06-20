## Marketing Module — Premium UI Redesign Plan

**Scope:** Visual-only redesign of 6 Marketing pages. Zero logic / query / server-function changes. Routes, data shapes, props — all preserved.

---

### Design System (shared, applied first)

Create `src/components/erp/marketing/_ui/` with reusable primitives — used across all 6 pages so styling stays consistent and changes propagate.

- `MktPageHeader.tsx` — 56px header (title left, actions right, border-b)
- `MktKpiCard.tsx` — icon + label + big number + sub + trend arrow
- `MktDecisionBadge.tsx` — scale/monitor/optimize/kill colored pill
- `MktStatusBadge.tsx` — active/paused/deleted dot + label
- `MktBudgetBadge.tsx` — on-track / near-limit / over-budget (pulse)
- `MktEmptyState.tsx` — icon-in-blue-circle + title + subtitle + CTA
- `MktSkeleton.tsx` — content-shape skeletons (card, row, chart)
- `MktSubtypeBadge.tsx` — expense subtype color map

Tailwind tokens used: existing semantic tokens + the spec hexes (Meta blue `#1877F2`, emerald `#10B981`, amber `#F59E0B`, red `#EF4444`, purple `#8B5CF6`). No `tailwind.config.js` edits — colors applied as inline `bg-[#1877F2]` only where semantic tokens don't fit; prefer existing `bg-emerald-50` / `text-emerald-700` etc.

The marketing tab strip in `erp.marketing.tsx` gets the pill style (active = Meta blue) — same pattern as HR redesign.

---

### Page-by-page changes (visual only)

**1. `erp.marketing.index.tsx` — Dashboard**
- Header: title + date-range + Sync Now + last synced
- Today's strip: 6 KPI cards (existing data: spend, revenue, real ROAS, orders, CPO, conv-rate)
- ROAS Reality Check card (Meta / Confirmed / Delivered side by side, already wired)
- Charts row: Spend vs Revenue line (7d) + Top-5 ROAS horizontal bar
- Decision Buckets: 4 click-to-filter cards (already wired — restyle)
- Budget Pacing: summary strip + compact per-campaign cards with pulse on over
- Campaign table at bottom (compact, decision badge, click → detail)

**2. `erp.marketing.campaigns.index.tsx` — Campaigns list**
- Header + KPI strip (Total Spend / Revenue / Avg ROAS / Active count)
- Filter bar (search + status + decision + date)
- **Switch from table → grid of campaign cards** (status dot, decision badge, dual currency spend, real vs meta ROAS, View Detail link)

**3. `erp.marketing.campaigns.$campaignId.tsx` — Campaign detail**
- Header card with inline metrics
- 2/3 + 1/3 split: left = perf chart + Linked Products table (margin color); right = Campaign Info + Ad Sets list
- Existing `LinkedProductsCard`, search dialog, link/unlink fns untouched — just restyle wrapper

**4. `erp.marketing.sku-pnl.tsx` — SKU P&L**
- Summary cards (already present — restyle)
- Premium table: inline margin progress-bar, sticky totals row, expandable rows show campaign breakdown per SKU (uses already-fetched `adSpendByProduct` data — purely presentational)
- Unallocated amber card below table with "Go to Campaigns" CTA

**5. `erp.marketing.expenses.tsx` — Manual expenses**
- Per-subtype KPI strip (6 cards, click-to-filter — restyle existing)
- Table: type badge colored, product/campaign chips
- Add Expense form moved to slide-over (Sheet) with pill type-selector

**6. `erp.marketing.attribution.tsx` — Attribution**
- Stats strip (attributed / unattributed / attribution rate %)
- Table with confidence badge column

---

### Global patterns
- Card: `rounded-xl border-gray-100 shadow-sm hover:shadow-md transition-all`
- Card hover lift: `hover:-translate-y-px`
- Loading: shape-matched skeletons (not generic spinners)
- Animations: `animate-fade-in` on data load, `animate-pulse` on over-budget, smooth `transition-[width]` on budget bars

---

### Out of scope (per "no logic changes")
- No new server fns, no schema changes, no query shape changes
- No data added — if a card has no data, it stays hidden (per memory rule)
- Route paths unchanged
- All existing handlers, dialogs, mutations wired as-is

---

### Order of execution
1. Build `_ui/` primitives
2. Restyle tab strip (`erp.marketing.tsx`)
3. Dashboard → Campaigns list → Campaign detail → SKU P&L → Expenses → Attribution
4. Visual smoke-test each page via Playwright screenshot

Estimated ~8–10 file edits + 8 new primitive files. ~1 implementation pass per page.

**Confirm to proceed, or tell me which pages to prioritise / drop.**