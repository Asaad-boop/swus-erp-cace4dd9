## Goal

Tomar dewa full spec ke ja already ache (Phase 1–4: COA, Journal, AR/AP, Budget, Recurring, Reconciliation, Tax, FX, Audit) tar upor build kore ekta **complete Finance OS** banano — Owner Dashboard, Wallets, Cashbook, Expense Mgmt, COD Settlement, Import Costing, Payroll, Owner/Loan tracking, ebong 20+ report.

Eta boro kaj — 6 ta phase e bhag korlam jate test korte paro step by step. Tumi shudhu "phase 5 koro" bolle phase 5 implement hobe.

---

## Phase 5 — Finance Dashboard + Brand Filter

Owner-er ek nojore dekhar jonno landing page.

**KPI cards** (date range + brand filter `HobbyShop / Toyora / All`):
- Today Sales (confirmed + delivered, brand wise)
- Cash in Hand (sum of Cash accounts)
- Bank Balance (sum of Bank accounts)
- bKash + Nagad Balance (MFS)
- Courier COD Receivable (Pathao + Steadfast outstanding)
- Supplier Payable (open AP bills)
- Total Expense (range)
- Net Profit (revenue − COGS − expense)
- Refund/Damage Loss

**Charts:**
- 12-month revenue vs expense bar
- Expense breakdown donut (category wise)
- Top 5 cash accounts horizontal bar
- Recent 10 transactions feed

**Files:** rewrite `erp.finance.index.tsx`, add `dashboard-kpi.tsx`, `dashboard-charts.tsx`, RPC `get_finance_dashboard(brand, from, to)`.

---

## Phase 6 — Wallets / Accounts Hub + Transfers

- Account types tag: `cash / bank / mfs / courier_wallet / equity / loan`
- Opening balance setter (creates one-time journal entry)
- Balance transfer wizard (Cash → Bank, bKash → Bank) — auto double-entry
- Account-wise statement (running balance ledger)
- Balance mismatch checker (system vs manual count)

**Files:** new `erp.finance.wallets.tsx`, `transfer-dialog.tsx`, `account-statement.tsx`. Extend `erp_accounts` with `wallet_type` enum + `opening_balance`.

---

## Phase 7 — Cashbook + Expense Categories Tree

Daily entry-er main page (already partially `erp.finance.simple.tsx` ache — etake upgrade).

- Unified entry form: Income / Expense / Transfer / Supplier Payment / Courier Settlement / Refund / Owner Draw / Owner Investment
- Pre-seeded expense category tree (Marketing → Meta Ads / Google / TikTok / Influencer; Office → Rent/Internet/etc; Staff → Salary/Bonus; Delivery → Packaging/Carton; Import → Product Cost/Shipping/Customs)
- Attachment upload (Supabase Storage `finance-attachments` bucket)
- Expense approval flow (draft → pending → approved → posted)
- Filter: date / brand / account / category / type / search
- CSV export

**Files:** rewrite `erp.finance.simple.tsx` → `erp.finance.cashbook.tsx`, new `expense-approval.tsx`, migration for `erp_expense_categories` tree seed + `approval_status` column.

---

## Phase 8 — Courier COD Settlement + Auto Sales Hook

**Auto journal entries from order events** (trigger on `orders.status` change):

| Event | Entry |
|---|---|
| Confirmed | Dr AR 1200 / Cr Sales 4100 + Dr COGS 5100 / Cr Inventory 1300 |
| Shipped (COD) | Dr Courier COD 1210 / Cr AR 1200 |
| Paid online | Dr bKash/Bank / Cr AR 1200 |
| Cancelled | reverse |
| Returned | Dr Sales Return / Cr AR + reverse COGS |

**Courier Settlement page:**
- CSV import (Pathao / Steadfast statement)
- Auto-match by consignment_id ↔ `courier_shipments.tracking_code`
- Show: Total COD / Courier Charge / Return Charge / Net Received
- Settlement post: Dr Bank + Dr Courier Charge / Cr Courier COD Receivable
- Unmatched orders list
- Courier due report

**Files:** new `erp.finance.cod-settlement.tsx`, `cod-import-dialog.tsx`, trigger function `auto_post_order_journal()`, RPC `match_cod_statement()`.

---

## Phase 9 — Import Costing + Supplier Ledger + Payroll

**Import Lots (landed cost):**
- Lot create: name, supplier, products[qty, unit_cost], extra_costs[shipping, agent_fee, customs, transport]
- Auto allocate extra cost proportionally → `landed_cost_per_unit`
- Push landed cost to `products.cost_price`
- Lot-wise profit report

**Supplier Ledger** (upgrade existing payables):
- Supplier statement: Purchase / Paid / Due / Advance
- Advance payment tracking
- Payment history

**Payroll:**
- Staff master (link to `auth.users`)
- Monthly salary structure (basic + allowance)
- Advance salary, bonus, commission, deduction
- Salary payment → expense entry from selected account
- Staff ledger

**Files:** `erp.finance.import-lots.tsx`, `import-lot-form.tsx`, `erp.finance.payroll.tsx`, migrations: `erp_import_lots`, `erp_import_lot_items`, `erp_import_lot_costs`, `erp_staff`, `erp_payroll`.

---

## Phase 10 — Owner/Investor/Loan + Advanced Reports

**Owner/Investor/Loan tracking:**
- Owner investment / withdrawal entries
- Investor: investment + monthly profit share payment ledger
- Loan: principal received, repayment schedule, due reminder

**Advanced Reports (each as printable + CSV):**
1. Cashbook Report
2. Account Statement
3. Expense Report (category drill-down)
4. Sales Report
5. P&L (already exists — add brand/product/campaign/staff filter)
6. Courier COD Due
7. Supplier Due
8. Customer Refund Report
9. Product Profit Report (sales − landed cost)
10. Daily Closing Report
11. Brand-wise Profit
12. Campaign-wise Profit (link with marketing)
13. Courier-wise Delivery Cost
14. Return Loss Report
15. Staff Cost vs Performance
16. Import Lot Profitability
17. Monthly Balance Sheet
18. Cash Flow Statement (Operating/Investing/Financing)
19. VAT/Tax export (already exists — polish)
20. Customer Statement PDF

**Files:** `erp.finance.owner.tsx`, `erp.finance.loans.tsx`, `erp.finance.reports.*` per report, shared `report-shell.tsx`, RPCs per report.

---

## Technical Notes

- **Tech**: TanStack Start server fns, Supabase RPC + RLS, `has_role('admin'|'finance_admin'|'finance_editor'|'finance_viewer')`, react-query, recharts.
- **Order → Journal auto-posting**: Postgres trigger on `orders` table. Idempotent (one journal entry per `(order_id, event_type)`).
- **Currency**: BDT base, FX module already exists.
- **Period lock**: already enforced — new entries check `erp_period_locks`.
- **Audit**: every change continues logging to `erp_finance_audit`.

---

## Approach

Phase 5 chhoto, fast win (dashboard). Phase 6–7 daily-use foundation. Phase 8 sob theke critical (auto journal from orders) — ekhane bug holey ledger noshto hobe, tai test heavy. Phase 9–10 polish.

**Bolo kon phase shuru korbo — `phase 5` likhle ami direct implement shuru korbo.**
