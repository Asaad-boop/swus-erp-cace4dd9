## Goal

Marketing module-এর সব ছড়ানো page (dashboard, campaigns, SKU P&L, attribution, rollup, ad-funding, expenses, sync, meta-reports, accounts) কে একটা **unified command center** এ রূপান্তর করা — যেখানে "কি এখন করা দরকার" prominent থাকবে, spend → campaign → SKU → finance flow একটানা follow করা যাবে, আর HobbyShop vs Toyora combined/split view পরিষ্কার হবে।

Backend/schema/sync pipeline unchanged। শুধু UI, layout, navigation, presentation।

---

## New Information Architecture

পুরনো ৪-hub top nav (Overview / Ad Spend / Campaigns / Settings) + ১০+ sub-tabs → **৩-pane single workspace**:

```text
┌─────────────────────────────────────────────────────────────┐
│ Header: Brand switcher [All | HobbyShop | Toyora]           │
│         Date range (advanced picker)  ·  Sync status pill   │
├──────────────┬──────────────────────────────┬───────────────┤
│              │                              │               │
│  LEFT RAIL   │      MAIN CANVAS             │  RIGHT RAIL   │
│  (nav +      │      (contextual view)       │  (Action      │
│   filters)   │                              │   Inbox)      │
│              │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

### Left rail — 5 sections (replaces 4 hubs + 10 sub-tabs)

1. **Pulse** — today/week/month KPIs, ROAS reality check, top movers
2. **Campaigns** — list + drill-in (merges: campaigns, rollup, attribution)
3. **Products** — SKU P&L, reorder signals from ad performance
4. **Money** — dollar purchase, ad-account funding ledger, manual expenses, FIFO consumption log (merged finance view)
5. **Settings** — accounts, brand mapping, sync log, meta reports

### Right rail — Action Inbox (always visible, persistent across all sections)

Live-updating list of "needs your attention":

- 🔴 Sync stopped >2h  (linked to sync log + retry button)
- 🟡 N campaigns brand-unassigned  (inline brand picker)
- 🟡 N attribution candidates pending review  (jump to attribution)
- 🟡 M campaigns over daily budget  (jump to campaign)
- 🔵 Dollar wallet low (<$50)  (jump to dollar purchase)
- 🔵 New Meta account detected (jump to accounts)

This is the fix for pain point #2 — silent failures আর কখনো ৭ দিন unnoticed যাবে না।

---

## Brand Toggle (pain point #3)

Header-এ segmented control: **All / HobbyShop / Toyora**

- **All** = combined view, per-brand mini-split shown inline in every KPI card ("৳120K [HS ৳80K · TY ৳40K]")
- **HobbyShop / Toyora** = filtered everywhere, tables auto-scope, orange banner reminding scope is filtered
- Selection persists in URL (`?brand=hobbyshop`) — shareable

---

## Pulse view (redesigned dashboard)

Merged into 4 focused strips (currently 5+ scattered cards):

1. **Today strip** — Spend / Revenue / Real ROAS / Orders / CPO (compact, live 5-min refresh badge)
2. **ROAS Reality Check** — Meta vs Confirmed vs Delivered, side-by-side with big deltas
3. **Top Movers** — 3 best + 3 worst campaigns this week (real ROAS-based) with sparkline
4. **Business Rollup** — Today | This Week | This Month totals (net profit after ad spend)

Removed clutter: budget pacing moves inside Campaigns list (contextual, not on dashboard).

---

## Campaigns view (merged)

Single scrollable table replaces 3 pages (campaigns / rollup / attribution):

- Columns: Name · Brand · Status · Spend · Real Revenue · Real ROAS · Delivered · Budget% · Action
- Row expand → shows attributed orders, linked SKUs, budget pacing bar, per-day chart
- Inline filter chips: Active | Paused | Unassigned brand | Over budget | Underperforming
- Bulk actions: assign brand, mark for review

Attribution "unmatched orders" becomes a **filter chip** + inline resolver on the same table, not a separate page।

---

## Products view (SKU P&L, redesigned)

Table + hero card layout:

- Top: "Best ROAS SKU this week" + "Worst ROAS SKU (candidates to pause)" hero cards
- Below: sortable SKU table with ad-attributed revenue, COGS, delivered profit, ROAS, reorder hint

---

## Money view (finance side of marketing)

3 tabs inside single page:

- **Dollar Wallet** — balance, purchase history, FIFO lots (existing dollar-purchase page)
- **Ad Account Funding** — ledger (existing ad-account-funding page)
- **Manual Expenses** — form + list (existing expenses page)

Header shows unified: total $ available, total spent this month, unallocated balance।

---

## Settings view

3 tabs:

- **Ad Accounts** — existing accounts page + brand mapping
- **Sync Health** — sync log with visual health timeline (green/yellow/red dots per day per account)
- **Meta Reports** — existing meta-reports page

---

## Technical section

### Route changes (file-based)

Keep existing route files as-is (no URL breakage), but repurpose `erp.marketing.tsx` layout to render new 3-pane shell. Sub-routes render inside `<Outlet />` of main canvas:

```text
erp.marketing.tsx              → new 3-pane layout (brand switcher, right rail, left rail)
erp.marketing.index.tsx        → Pulse view (redesigned dashboard)
erp.marketing.campaigns.*      → Campaigns view (merged rollup + attribution UI)
erp.marketing.sku-pnl.tsx      → Products view (redesigned)
erp.marketing.money.tsx        → NEW — wraps dollar-purchase / funding / expenses in tabs
erp.marketing.settings.tsx     → NEW — wraps accounts / sync / meta-reports in tabs
```

Old routes (`rollup`, `attribution`, `expenses`, `ad-account-funding`, `sync`, `meta-reports`, `accounts`) keep working as redirects into the new tabbed pages so bookmarks/external links don't break.

### New components

- `src/components/erp/marketing/_shell/marketing-shell.tsx` — 3-pane layout
- `src/components/erp/marketing/_shell/brand-switcher-header.tsx` — brand toggle + date range + sync pill
- `src/components/erp/marketing/_shell/left-rail.tsx` — 5-section nav
- `src/components/erp/marketing/_shell/action-inbox.tsx` — right rail live tasks
- `src/components/erp/marketing/pulse/*` — 4 dashboard strips
- `src/components/erp/marketing/campaigns/unified-table.tsx` — merged campaigns/rollup/attribution table
- `src/components/erp/marketing/products/sku-pnl-hero.tsx` — best/worst hero cards
- `src/components/erp/marketing/money/money-tabs.tsx`
- `src/components/erp/marketing/settings/sync-health-timeline.tsx`

### Server functions

No new server functions unless needed for the Action Inbox aggregator:

- `src/lib/erp/marketing/action-inbox.functions.ts` — single server fn returning `{ syncHealth, unassignedCampaigns, pendingAttribution, overBudget, walletLow }` in one round-trip (avoid N queries from right rail)

Reuses all existing functions (`getDashboardSummary`, campaigns fn, sku-pnl fn, etc.) — pure UI reorganization।

### Design tokens

Reuse existing ERP tokens (Meta-blue `#1877F2` accent, gray-100 borders, rounded-xl cards) — consistent with rest of ERP। No new palette।

### Brand filter propagation

Existing `brand-context.tsx` already provides brandId globally। Extend to support "all" mode + URL sync via `useSearch({from: '/_authenticated/erp/marketing'})`.

---

## Phased delivery

1. **Phase 1 — Shell** (breaks nothing, additive)
  - New 3-pane layout in `erp.marketing.tsx`
  - Brand switcher header + Action Inbox right rail (with real data)
  - Left rail with 5 sections routing to existing pages unchanged
  - **Ship-able as-is** — user gets action inbox + brand toggle immediately
2. **Phase 2 — Pulse redesign** — new dashboard replaces `erp.marketing.index.tsx`
3. **Phase 3 — Campaigns merge** — unified table combining campaigns/rollup/attribution
4. **Phase 4 — Products, Money, Settings** — remaining view consolidations + old-route redirects

Each phase is independently shippable; no big-bang cutover।

---

## Out of scope (explicitly)

- Backend/sync logic changes
- New data sources (Google/TikTok) — Meta only
- Schema changes
- `meta_dollar_purchases` and dollar-purchase pipeline (untouched per prior constraint)
- New attribution algorithm — UI presents existing candidates only
- **Approved — proceed with Phase 1 (Shell)**, কিন্তু implement করার আগে এই ২টা confirm করো:
  1. **Products/Campaigns profit columns** — যেসব order-item-এর product `cost_price` missing, সেই row/aggregate-এ visible flag (badge/tooltip: "cost data incomplete") দেখাও, silent-wrong-number না।
  2. **Single canonical calculation source** — Pulse (dashboard), Campaigns, Products — এই তিন জায়গায় "Real ROAS"/"delivered profit" **একই logic/function** থেকে আসছে কিনা confirm করো। যদি dashboard/campaigns/sku-pnl-এর existing function-গুলো আলাদা আলাদা calculation করে (Finance module-এ যেমন পেয়েছিলাম), সেটা প্রথমে **এক জায়গায় consolidate** করো, তারপর UI বানাও — নাহলে সুন্দর UI-তে ভুল/inconsistent সংখ্যা দেখাবে।
  Confirm এই দুটো হলে Phase 1 (3-pane shell + Action Inbox + brand switcher) শুরু করো। Push-এর আগে summary।