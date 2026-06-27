# Meta Dollar Purchase / Ad Account Funding System

Bro, eta boro feature — Finance + Marketing duitate connect korte hobe. Niche complete plan, approve korle ek ek kore build korbo.

## Scope

Manually-bought USD ke track korbo per Meta ad account, FIFO rate use kore actual BDT marketing cost calculate korbo, ar finance accounts (Cash/Bank/bKash etc.) theke outflow auto-deduct korbo.

## 1. Database (single migration)

Notun tables (`public` schema, RLS + GRANTs):

- **meta_dollar_purchases** — purchase_date, brand_id, ad_account_id (→ mkt_ad_accounts), usd_amount, usd_rate, bdt_amount (generated), fee_bdt, total_bdt (generated), paid_from_account_id (→ erp_accounts), payment_method, reference, supplier_name, note, attachment_url, status (draft/confirmed/cancelled), effective_rate (generated = total_bdt/usd_amount), confirmed_at, confirmed_by, created_by.
- **meta_ad_wallet_ledger** — ad_account_id, entry_date, entry_type (`purchase` | `spend` | `refund` | `adjustment` | `opening`), usd_amount (+/-), bdt_amount, rate_used, source_purchase_id (FIFO lot), source_spend_ref, balance_usd_after, note.
- **meta_fifo_lots** — ad_account_id, purchase_id, lot_date, usd_total, usd_remaining, effective_rate. (FIFO consumption tracking.)
- **finance_audit_log** — entity_type, entity_id, action, old_value jsonb, new_value jsonb, actor_id, created_at. (Reuse `erp_finance_audit` if compatible — check schema first.)

Reuse existing:

- `erp_accounts` (Cash/Bank/bKash/Nagad/Card) as Paid From.
- `mkt_ad_accounts` as Meta ad accounts.
- `erp_expense_categories` — seed: Meta Ad Balance / Prepaid Marketing, Meta Ads Expense, Bank Charge, Payment Processing Fee, FX Rate Difference, Refund/Adjustment.
- `erp_transactions` / `erp_journal_entries` for ledger postings.

DB functions:

- `confirm_meta_dollar_purchase(purchase_id)` — validates balance, creates FIFO lot, wallet ledger entry (+USD), debits Paid From account via `erp_transactions`, posts journal (Dr Prepaid Meta Balance + Bank Charge, Cr Cash/Bank), audit row.
- `cancel_meta_dollar_purchase(purchase_id)` — reverse entries if confirmed.
- `consume_meta_spend_fifo(ad_account_id, usd_spend, spend_date, ref)` — walks `meta_fifo_lots` oldest-first, computes weighted BDT, writes wallet ledger (-USD), creates Marketing Expense journal (Dr Meta Ads Expense, Cr Prepaid Meta Balance). Returns `{bdt_cost, lots_used[]}`. Fallback to latest `erp_fx_rates` USD→BDT if no remaining lot.
- Triggers: on `mkt_insights_daily` insert/update → call FIFO consume per ad account per day (idempotent via `spend_ref`).
- View: `meta_ad_wallet_summary` per ad_account — sums usd_purchased, bdt_paid, usd_spent, bdt_spent, usd_remaining, avg_effective_rate, latest_rate.

Settings flag in `erp_settings`: `meta_funding_mode` = `prepaid` (default) | `direct_expense`.

## 2. Server functions (`src/lib/erp/marketing/dollar-purchase.functions.ts`)

- `listDollarPurchasesFn` (filters: dateRange, brand, ad_account, paid_from, status)
- `createDollarPurchaseFn` (zod validated; status=draft)
- `updateDollarPurchaseFn` (only when draft)
- `confirmDollarPurchaseFn` → calls RPC
- `cancelDollarPurchaseFn` → calls RPC
- `getAdAccountWalletFn(adAccountId)` → summary + ledger + lots
- `dollarPurchaseReportsFn` (variant per report)

All `requireSupabaseAuth` + role check (admin/finance).

## 3. UI pages

**Finance**

- `erp.finance.dollar-purchase.tsx` — list + filters + summary KPI cards (Total USD, Total BDT, Avg Effective Rate, Wallet Balance, This Month Meta Spend, This Month Fees). Drawer/dialog for create/edit. Confirm/Cancel actions with reason.
- Add nav link under Finance → Expenses → "Meta Dollar Purchase".

**Marketing**

- `erp.marketing.ad-account-funding.tsx` — list of ad accounts with wallet summary cards; click → detail drawer showing lots (FIFO), ledger entries, funding history, avg effective rate, latest rate.
- Link from `erp.marketing.accounts.tsx` row → "Funding".

**Reports** (add tabs in `erp.finance.reports.tsx` + marketing reports):

- Meta Dollar Purchase, Ad Account Funding, Spend vs Fund Added, Rate Difference, Marketing Expense BDT, Brand-wise Meta, Campaign/adset/ad spend BDT, Account-wise outflow.

**Components**

- `<DollarPurchaseDialog>` with attachment upload (Supabase storage bucket `finance-attachments`).
- `<AdAccountWalletCard>`, `<FifoLotTable>`, `<FundingLedgerTable>`.

## 4. Marketing sync integration

Update `src/lib/erp/marketing/sync.server.ts` & `performance.functions.ts`:

- When writing `mkt_insights_daily.spend_usd`, also call `consume_meta_spend_fifo` to derive `spend_bdt_actual` (store in new column `spend_bdt_fifo`).
- SKU P&L / dashboard / profitability now uses `spend_bdt_fifo` when present, else falls back to `erp_fx_rates`-based conversion (current behavior).

## 5. Validation & Audit

- Zod: usd_amount > 0, usd_rate > 0, ad_account & paid_from required.
- Insufficient balance guard unless `erp_settings.allow_negative_account = true`.
- Confirmed entries: edit blocked → must create reversal/adjustment.
- All confirm/cancel/edit actions logged to `erp_finance_audit` (or new `finance_audit_log`).

## 6. Storage

Bucket `finance-attachments` (private) for receipt uploads. RLS: authenticated read/write within own brand scope.

## Build order

1. Migration (tables + RPCs + seed categories + storage bucket) — needs your approval.
2. Server functions + types.
3. Finance Dollar Purchase page + dialog.
4. Marketing Ad Account Funding page.
5. Sync integration (FIFO consumption on insights).
6. Reports.
7. Audit log UI in existing `erp.finance.audit.tsx`.

## Tech notes

- FIFO calc in Postgres `plpgsql` for atomicity.
- Generated columns for `bdt_amount`, `total_bdt`, `effective_rate`.
- Realtime: enable `meta_dollar_purchases`, `meta_ad_wallet_ledger` publications for live KPI updates.
- BDT formatting via existing `formatBDT` util; USD via `Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})`.

---

Approve korle migration die start korbo. Kono part chhoto/boro korte chao, ba mode (prepaid vs direct expense) default ulto chao — bolo.  
Approved. Start with Step 1 migration, but before coding, apply these important corrections:

1. Default mode must stay `prepaid`, not direct expense.
  - Dollar purchase = Meta Ad Balance / Prepaid Marketing
  - Actual Meta spend = Meta Ads Expense
  - Transaction fee = Bank Charge / Payment Processing Fee
2. Do not create duplicate audit table if `erp_finance_audit` already exists and is compatible. First check existing finance audit schema, then reuse it. Only create `finance_audit_log` if no compatible table exists.
3. FIFO spend consumption must be fully idempotent.  
On `mkt_insights_daily` insert/update, do not blindly call FIFO every time, because spend may update multiple times and double consume wallet balance.  
Add a table like `meta_spend_consumptions` with unique key:
  - ad_account_id
  - insight_date
  - campaign_id/adset_id/ad_id or insight row id
  - spend_ref
  Store:
  - usd_spend_recorded
  - usd_consumed
  - bdt_cost
  - lots_used jsonb
  - created_at / updated_at
  If spend increases, consume only the delta.  
  Example: previous spend $10, new spend $15 → consume only $5.  
  If spend decreases, create reversal/adjustment logic instead of double-consuming.
4. `brand_id` should be nullable because some Meta ad accounts may be shared across All Brands. Brand-wise allocation can be done later from campaign/product/order attribution.
5. Confirmed dollar purchase must not be editable. Any correction must create reverse/adjustment entry with audit log.
6. If FIFO lot balance is missing but Meta spend exists, fallback to `erp_fx_rates` but mark it clearly as `estimated_bdt_cost = true` or `conversion_source = fx_fallback`.
7. Add wallet summary view with:
  - total_usd_purchased
  - total_bdt_paid
  - total_usd_spent
  - total_bdt_spent
  - remaining_usd
  - avg_effective_rate
  - latest_purchase_rate
  - estimated/fallback spend amount
8. Add account balance validation:  
Cannot confirm purchase if selected Cash/Bank/bKash account has insufficient balance, unless `allow_negative_account = true`.

After these corrections, start with the single migration:

- tables
- RPC functions
- generated columns
- seed categories
- storage bucket
- RLS
- grants
- realtime publication

Then send me the migration summary before moving to server functions.  
