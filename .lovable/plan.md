## Advanced Accounting & Finance Module — Plan

Current state: ekta basic Finance page ache (Accounts, Transactions, Categories, simple P&L). Eta ke ekta proper SME-grade accounting suite e upgrade korbo — double-entry feel, multi-report, budgets, AR/AP, reconciliation, taxes, recurring, audit.

### 1. Module Structure (route split)

`/erp/finance` ke layout banabo with sub-routes (ekhon ekta page e shob — overload):

```
/erp/finance                → Overview Dashboard
/erp/finance/accounts       → Chart of Accounts (tree)
/erp/finance/transactions   → Journal / Ledger
/erp/finance/receivables    → AR (customer dues, COD pending)
/erp/finance/payables       → AP (supplier bills, payments)
/erp/finance/recurring      → Recurring entries (rent, salary, subscriptions)
/erp/finance/budgets        → Monthly budgets vs actuals
/erp/finance/reconciliation → Bank/MFS statement reconciliation
/erp/finance/taxes          → VAT/Tax tracking
/erp/finance/reports        → P&L, Balance Sheet, Cash Flow, Trial Balance
/erp/finance/settings       → Fiscal year, currency, opening balances, lock period
```

### 2. Overview Dashboard

- KPI cards: Cash on hand, This-month Revenue, Expense, Net Profit, AR outstanding, AP outstanding, COD in-transit
- Date range presets (Today / 7d / 30d / This month / Last month / This year / Custom)
- Charts: Revenue vs Expense (bar, last 12 months), Cash-flow trend (line), Expense by category (donut), Top 5 expense categories
- Quick actions: Add income / expense / transfer / bill / invoice
- Alerts: low cash account, overdue receivables, budget overrun, unreconciled items

### 3. Chart of Accounts (real accounting)

- Hierarchical accounts: Assets / Liabilities / Equity / Income / Expense (5 root types)
- Sub-accounts (e.g. Assets > Cash > bKash, Assets > Inventory, Liabilities > Supplier Payable)
- Each account: code, name, type, parent, currency, opening balance, is_active
- Tree view + drill-down ledger per account
- Soft-archive instead of delete

### 4. Transactions / Journal

- Double-entry support: every txn has debit & credit lines (even if UI shows simple "income/expense", backend writes balanced journal entries)
- Bulk import (CSV) with mapping
- Bulk edit/delete/categorize
- Attachments (receipt upload to Supabase Storage)
- Inline edit, undo, soft delete with audit trail
- Advanced filters: amount range, tag, attachment present, reconciled status, created-by user
- Saved filter views

### 5. Accounts Receivable (AR)

- Auto-pulls from `orders` (COD pending, partial payment, advance paid)
- Customer-wise outstanding aging buckets (0-7 / 8-15 / 16-30 / 30+ days)
- Record customer payment → auto-creates txn + updates order
- Send reminder (WhatsApp/SMS link) — UI only, hook for later
- Customer statement (PDF)

### 6. Accounts Payable (AP)

- Supplier bills (linked to `erp_suppliers` & inventory purchases)
- Bill → Payment workflow, partial payments
- Due date, aging buckets
- Auto-link Meta ads expense (already syncs) as AP
- Pay schedule view (this week / next week)

### 7. Recurring Entries

- Rules: amount, frequency (daily/weekly/monthly/yearly), next-run, end-date, auto-post toggle
- Daily cron auto-creates pending txns; user approves or auto-posts
- Examples: rent, internet, salary, SaaS subs

### 8. Budgets

- Per category, per month
- Actual vs Budget table with % used, color-coded
- Year-view heatmap

### 9. Bank/MFS Reconciliation

- Import statement CSV (bKash/Nagad/Bank)
- Auto-match by amount + date ± window
- Manual match UI; mark reconciled
- Unreconciled items list with action buttons

### 10. Tax Module

- VAT rate per product/category (already has tax fields)
- VAT collected (output) vs paid (input) report
- Period-wise VAT return summary (monthly/quarterly)
- Withholding tax (TDS) tracking on supplier payments

### 11. Reports (proper accounting set)

- **Profit & Loss** — by month/quarter/year, comparative (this period vs last)
- **Balance Sheet** — Assets = Liabilities + Equity, as-of date
- **Cash Flow Statement** — Operating / Investing / Financing
- **Trial Balance** — all accounts debit/credit
- **General Ledger** — per account, full transaction history
- **Aged Receivables / Payables**
- **Expense by Category / by Vendor**
- **Tax Summary**
- Every report: date filter, brand filter, PDF export, CSV export, print

### 12. Multi-currency (Phase 2, optional)

- Account currency (BDT default), USD/SAR support
- Exchange rate table, FX gain/loss auto-posting

### 13. Period Lock & Audit

- Settings: "Lock entries before YYYY-MM-DD" — prevents edits to closed periods
- Full audit log (who, what, when, before/after JSON) — table already partly exists
- Fiscal year start month config

### 14. Permissions

- `finance_viewer`, `finance_editor`, `finance_admin` roles via existing `user_roles` table
- Editor: create/edit own; Admin: lock period, delete, manage COA

### Technical Section

**Database migrations (new tables):**

- `erp_account_categories` (5 root types seed) — or extend `erp_accounts.account_type` enum to include asset/liability/equity
- `erp_accounts`: add `parent_id`, `code`, `currency`, `is_archived`
- `erp_journal_entries` (header) + `erp_journal_lines` (debit/credit lines) — replaces flat `erp_transactions` OR sits alongside as derived view
- `erp_bills` (AP), `erp_bill_payments`, `erp_bill_lines`
- `erp_invoices_ar` (or reuse `orders`) + `erp_ar_payments`
- `erp_recurring_rules`, `erp_recurring_runs`
- `erp_budgets` (brand_id, category_id, month, amount)
- `erp_reconciliations`, `erp_statement_imports`, `erp_statement_lines`
- `erp_tax_rates`, `erp_tax_entries`
- `erp_period_locks` (brand_id, locked_until)
- `erp_finance_attachments` (txn_id, storage_path)
- All with RLS + GRANT to `authenticated`, brand scoping via `has_role` / brand membership

**Server functions (`src/lib/erp/finance/*.functions.ts`):**

- `getDashboardKpis`, `getPL`, `getBalanceSheet`, `getCashFlow`, `getTrialBalance`, `getGeneralLedger`
- `createJournalEntry` (validates debit==credit)
- `recordARPayment`, `recordAPPayment`
- `runRecurringRules` (cron at `/api/public/cron.run-recurring`)
- `importStatementCsv`, `autoMatchReconciliation`
- `lockPeriod` (admin only)

**Reports & PDFs:**

- Server-side render via react-pdf OR client-side print stylesheet (Phase 1 = print stylesheet)
- CSV using existing helper

**Files to add (Phase 1 priority):**

1. New route layout `erp.finance.tsx` (with `<Outlet/>`) + sub-route files
2. `src/components/erp/finance/` — coa-tree, journal-form, bill-form, recurring-form, budget-grid, reconcile-table, report-* components
3. `src/hooks/erp/use-finance-*.ts`
4. Migrations as listed

### Rollout (phases)

- **Phase 1 (foundation):** Route split, Overview dashboard, Chart of Accounts tree, double-entry journal, P&L + Balance Sheet + Cash Flow + Trial Balance reports, Period lock, Attachments
- **Phase 2 (AR/AP):** Receivables (auto from orders), Payables (with supplier link + Meta ads link), aging
- **Phase 3 (automation):** Recurring entries + cron, Budgets, Reconciliation
- **Phase 4 (compliance):** Tax module, multi-currency, advanced audit

Phase 1 alone is significant — eta confirm korle ami migrations + Phase 1 build start korbo.  
Advanced Accounting & Finance Module — Safe Phase 1A Implementation

We already have a basic Finance page with Accounts, Transactions, Categories, and simple P&L. Now upgrade it into a proper SME-grade Accounting & Finance module, but implement safely and phase-wise.

## Critical Rules

1. Do not delete, rename, or break existing finance tables/pages.
2. Existing `erp_transactions`, `erp_accounts`, `erp_expense_categories`, suppliers, orders, inventory, courier data must remain working.
3. Add double-entry accounting alongside the existing system.
4. Existing simple income/expense/transfer flow should continue working.
5. All new finance data must be brand-scoped.
6. All new tables must have RLS enabled and proper policies for authenticated users.
7. Use existing user roles/permissions if available.
8. No mock/fake production data.
9. Every journal entry must be balanced: total debit = total credit.
10. Add soft delete / void / archive behavior instead of hard delete.
11. Add period lock so old closed entries cannot be edited.
12. Before making changes, generate a preflight report and then proceed with safe implementation.

---

# Goal

Convert `/erp/finance` from a single overloaded page into a proper finance module with sub-routes:

```txt
/erp/finance              → Finance Overview Dashboard
/erp/finance/accounts     → Chart of Accounts
/erp/finance/transactions → Journal / Ledger
/erp/finance/reports      → Accounting Reports
/erp/finance/settings     → Finance Settings

```

For now, only implement Phase 1A foundation. Do not build AR/AP, recurring, budgets, bank reconciliation, taxes, or multi-currency yet. Add placeholder cards for those future features.

---

# Phase 1A Scope

## 1. Finance Overview Dashboard

Create a clean dashboard with:

### KPI Cards

- Cash balance
- Bank/MFS balance
- This month revenue
- This month expense
- Net profit
- COD receivable if available from orders/courier data
- Supplier payable if available from supplier data

### Filters

- Brand filter
- Date range filter:
  - Today
  - Last 7 days
  - Last 30 days
  - This month
  - Last month
  - This year
  - Custom range

### Charts

- Revenue vs expense chart
- Expense by category
- Cash trend if data is reliable

### Quick Actions

- Add income
- Add expense
- Transfer money
- New journal entry

### Alerts

- Locked accounting period
- Unbalanced draft entries
- Low cash/bank account if possible

---

## 2. Chart of Accounts

Create a real accounting-style Chart of Accounts page.

Root account types:

```txt
Assets
Liabilities
Equity
Income
Expense

```

Each account should support:

- Account code
- Account name
- Account type
- Parent account
- Currency, default BDT
- Opening balance
- Normal balance: debit/credit
- Active/inactive
- Archive instead of delete
- Brand scope
- Current balance calculation

UI requirements:

- Tree view grouped by account type
- Search account
- Add/edit/archive account
- Click account to view account ledger

Seed default accounts per active brand.

Default COA:

```txt
1000 Assets
1100 Cash
1110 Office Cash
1120 Bank
1130 bKash
1140 Nagad
1200 Accounts Receivable
1210 Courier COD Receivable
1300 Inventory

2000 Liabilities
2100 Accounts Payable
2110 Supplier Payable
2200 Loan Payable

3000 Equity
3100 Owner Capital
3200 Owner Drawings
3300 Retained Earnings

4000 Income
4100 Sales Revenue
4200 Delivery Charge Income
4300 Other Income

5000 Expenses
5100 Product Cost / COGS
5200 Meta Ads Expense
5300 Courier Expense
5400 Packaging Expense
5500 Salary Expense
5600 Office Expense
5700 Refund & Return Loss
5800 Import / Shipping Expense

```

---

## 3. Double-Entry Journal / Ledger

Create new journal system alongside existing simple transactions.

### New journal entry must have:

- Entry number
- Brand
- Entry date
- Description
- Source type
- Source ID
- Status: draft / posted / void
- Created by
- Created at
- Updated at

### Journal lines must have:

- Account
- Debit amount
- Credit amount
- Description

Validation:

- Minimum 2 lines
- No negative debit/credit
- A line cannot have both debit and credit
- Total debit must equal total credit
- Cannot edit/delete posted entry inside locked period
- Void should reverse or mark entry void safely

UI:

- Journal list
- New journal form
- Debit/credit line table
- Live debit total and credit total
- Show imbalance warning
- Save disabled until balanced
- Filters by date, account, amount, source type, status, created by
- Attachment upload support

---

## 4. Simple Transaction Compatibility

Keep current simple finance workflow usable.

When user creates simple income/expense/transfer:

### Expense example:

```txt
Debit: Selected Expense Account
Credit: Selected Cash/Bank/MFS Account

```

### Income example:

```txt
Debit: Selected Cash/Bank/MFS Account
Credit: Selected Income Account

```

### Transfer example:

```txt
Debit: Destination Account
Credit: Source Account

```

If existing app still depends on `erp_transactions`, continue writing there too. But also create the matching journal entry.

Do not force non-accountant users to understand debit/credit in the simple form.

---

## 5. Reports

Build only these reports in Phase 1A:

### Profit & Loss

- Income
- Expenses
- Net profit
- Date filter
- Brand filter
- Comparative view optional

### Trial Balance

- Account
- Debit total
- Credit total
- Net balance
- Must show whether books are balanced

### Balance Sheet

- Assets
- Liabilities
- Equity
- As-of date filter
- Show accounting equation:

```txt
Assets = Liabilities + Equity

```

### General Ledger

- Account-wise full transaction history
- Opening balance
- Debit
- Credit
- Running balance
- Date filter
- Brand filter

Cash Flow report can remain placeholder unless accurate calculation is ready.

Each report should support:

- Date filter
- Brand filter
- Print view
- CSV export if existing helper is available

---

## 6. Finance Settings

Create finance settings page with:

- Base currency: BDT
- Fiscal year start month
- Period lock date
- Opening balance setup note
- Default accounts mapping:
  - Default cash account
  - Default bank account
  - Default sales account
  - Default expense account
  - Default courier receivable account
  - Default supplier payable account
- Admin-only dangerous actions

---

# Database Migration Requirements

Create non-destructive migrations.

## Add/extend tables safely

### `erp_chart_accounts`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `brand_id uuid not null`
- `code text not null`
- `name text not null`
- `account_type text not null check in ('asset','liability','equity','income','expense')`
- `parent_id uuid null references erp_chart_accounts(id)`
- `currency text default 'BDT'`
- `opening_balance numeric default 0`
- `normal_balance text not null check in ('debit','credit')`
- `is_active boolean default true`
- `is_archived boolean default false`
- `created_by uuid null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Add unique constraint:

```txt
unique(brand_id, code)

```

### `erp_journal_entries`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `brand_id uuid not null`
- `entry_no text not null`
- `entry_date date not null`
- `source_type text null`
- `source_id uuid null`
- `description text null`
- `status text default 'posted' check in ('draft','posted','void')`
- `is_locked boolean default false`
- `created_by uuid null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- `deleted_at timestamptz null`

Add unique constraint:

```txt
unique(brand_id, entry_no)

```

### `erp_journal_lines`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `brand_id uuid not null`
- `journal_entry_id uuid not null references erp_journal_entries(id) on delete cascade`
- `account_id uuid not null references erp_chart_accounts(id)`
- `debit numeric default 0`
- `credit numeric default 0`
- `description text null`
- `created_at timestamptz default now()`

Add check:

```txt
(debit >= 0 and credit >= 0)

```

### `erp_period_locks`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `brand_id uuid not null`
- `locked_until date not null`
- `locked_by uuid null`
- `reason text null`
- `created_at timestamptz default now()`

### `erp_finance_attachments`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `brand_id uuid not null`
- `journal_entry_id uuid null references erp_journal_entries(id)`
- `transaction_id uuid null`
- `file_name text null`
- `storage_path text not null`
- `mime_type text null`
- `size_bytes bigint null`
- `uploaded_by uuid null`
- `created_at timestamptz default now()`

---

# Database Functions / RPC

Create secure functions:

## `create_journal_entry`

Responsibilities:

- Validate brand access
- Validate period lock
- Validate minimum 2 lines
- Validate debit total equals credit total
- Validate account belongs to same brand
- Insert journal entry and journal lines atomically
- Return created journal entry

## `get_profit_and_loss`

Input:

- brand_id
- date_from
- date_to

Output:

- income accounts
- expense accounts
- total income
- total expense
- net profit

## `get_trial_balance`

Input:

- brand_id
- as_of_date

Output:

- account code
- account name
- account type
- debit total
- credit total
- net balance

## `get_balance_sheet`

Input:

- brand_id
- as_of_date

Output:

- assets
- liabilities
- equity
- totals
- balance check

## `get_general_ledger`

Input:

- brand_id
- account_id
- date_from
- date_to

Output:

- journal entry date
- entry no
- description
- debit
- credit
- running balance

---

# RLS & Permissions

Enable RLS on all new tables.

Use existing brand membership / role function if available. If not, follow existing ERP RLS pattern.

Roles:

- `finance_viewer`: read only
- `finance_editor`: create/edit unlocked entries
- `finance_admin`: manage chart of accounts, lock period, void/archive entries

Admins/super admins can manage all finance data within assigned brand.

---

# File Structure

Add components under:

```txt
src/components/erp/finance/

```

Suggested components:

- `FinanceLayout`
- `FinanceKpiCards`
- `FinanceDateFilter`
- `ChartOfAccountsTree`
- `AccountForm`
- `JournalEntryForm`
- `JournalLinesTable`
- `JournalList`
- `ProfitLossReport`
- `TrialBalanceReport`
- `BalanceSheetReport`
- `GeneralLedgerReport`
- `FinanceSettingsForm`

Add hooks under:

```txt
src/hooks/erp/

```

Suggested hooks:

- `use-finance-dashboard`
- `use-chart-accounts`
- `use-journal-entries`
- `use-finance-reports`
- `use-finance-settings`

---

# UI/UX Requirements

Design should be clean, premium, and ERP-friendly.

Use:

- Card-based dashboard
- Table with filters
- Sticky report filter bar
- Empty states
- Loading skeletons
- Error states
- Mobile-friendly where possible
- Clear badges for draft/posted/void/locked
- No overcrowded single page

Finance should be easy for non-accountant staff but powerful for owner/admin.

---

# Preflight Report Required

Before final implementation, show a preflight report:

1. Existing finance-related tables found
2. Existing columns found
3. Existing finance routes found
4. Migration plan
5. RLS plan
6. Compatibility plan with old `erp_transactions`
7. Risks found
8. Exact files to create/edit
9. Confirmation that no destructive changes will be made

Then proceed with Phase 1A implementation only.

---

# Acceptance Criteria

Phase 1A is complete only if:

1. `/erp/finance` route works as overview dashboard.
2. Finance sub-route layout works.
3. Chart of Accounts page works with seeded accounts.
4. Journal entry creation works and blocks unbalanced entries.
5. Simple income/expense/transfer still works.
6. Journal entries are brand-scoped.
7. RLS is enabled.
8. P&L report works.
9. Trial Balance report works.
10. Balance Sheet report works.
11. General Ledger works.
12. Period lock blocks old entry edits.
13. Existing finance data/pages are not broken.
14. No mock data is shown in production pages.

Implement only Phase 1A now.