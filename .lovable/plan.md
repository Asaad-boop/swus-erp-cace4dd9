## Finance Rebuild — Phase 1

Boro rebuild, tai plan die confirm nichhi. Constraint: `orders` read-only. Prottek step-e verify output dibo.

### Pre-drop audit (grep result)


| Table                                                                                                                                                                                                                                                                                | Callers found                                                                                                 | Verdict                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `erp_bill_payments`, `erp_ar_payments`, `erp_supplier_payments`, `erp_recurring_runs`, `erp_bills`, `erp_budgets`, `erp_tax_entries`, `erp_recurring_rules`, `erp_reconciliation_runs`, `erp_reconciliation_rows`, `erp_statement_imports`, `erp_return_cases`, `erp_exchange_cases` | 0 src references                                                                                              | Safe drop                                                                                                                                                                 |
| `erp_period_locks`                                                                                                                                                                                                                                                                   | `src/components/erp/finance/pages/settings.tsx` (Settings → Period Locks section: load/upsert/delete)         | Live but never used in P&L guards — drop table + remove Settings section (whole "Period Lock" card)                                                                       |
| `erp_statement_lines`                                                                                                                                                                                                                                                                | `src/components/erp/finance/pages/reconciliation.tsx` (bank statement import + list)                          | Feature-e use holo, tobe eta bank-statement reconciliation, oi puro page-e (import + rows) drop kora dorkar. Confirm koro: puro "Bank Reconciliation" page tao off korbo? |
| `erp_product_expense_allocations`                                                                                                                                                                                                                                                    | dialog + `marketing/campaigns.functions.ts`:399 + `marketing/sync.server.ts`:584,643 (marketing writes these) | Marketing writers-o remove korte hobe; product-profitability page theke dialog import + button remove                                                                     |
| `useProfitLoss` hook                                                                                                                                                                                                                                                                 | `src/components/erp/finance/pages/simple.tsx` (Quick Entry P&L card)                                          | Migrate to new canonical RPC, then delete hook                                                                                                                            |
| `bd-charges.ts`                                                                                                                                                                                                                                                                      | 0                                                                                                             | Delete                                                                                                                                                                    |


### Step A — Cleanup migration

Single migration (reversible: structure `pg_dump`-style CREATE saved in migration comment):

- DROP TABLE (CASCADE) for all Safe-drop list + `erp_period_locks`, `erp_statement_lines`, `erp_statement_imports`, `erp_product_expense_allocations`.
- Code removals in same batch:
  - delete `src/lib/erp/bd-charges.ts`
  - delete `src/components/erp/finance/product-expense-allocation-dialog.tsx`
  - remove `ProductExpenseAllocation` import + dialog + trigger button from `pages/product-profitability.tsx`
  - remove marketing writer blocks (`campaigns.functions.ts:~399`, `sync.server.ts:~584,643`) — just skip the allocation insert, keep transaction insert
  - remove Period Lock card from `pages/settings.tsx`
  - reconciliation.tsx bank-statement section: **awaiting your confirm** before touching
  - `useProfitLoss` — replace call sites first (Step B), then delete

### Step B — Canonical P&L RPC

Repurpose `erp_profit_loss` (cleaner: already brand+date signature, already used by hook). New body:

```text
Revenue:
  SUM CASE
    WHEN return_type='full_return' THEN 0
    WHEN return_type='partial_return' THEN total - partial_amount
    ELSE total
  END
  FROM orders WHERE brand_id=$1 AND delivery_date BETWEEN $2 AND $3
             AND status IN ('delivered','completed')

COGS:
  SUM(debit) FROM erp_journal_lines jl
  JOIN erp_journal_entries je ON je.id=jl.entry_id
  JOIN erp_chart_accounts ca ON ca.id=jl.account_id
  WHERE ca.account_type='cogs' AND je.brand_id=$1
    AND je.entry_date BETWEEN $2 AND $3

OpEx:
  SUM(amount) FROM erp_transactions t
  LEFT JOIN erp_expense_categories c ON c.id=t.category_id
  WHERE t.brand_id=$1 AND t.txn_type='expense'
    AND t.transaction_date BETWEEN $2 AND $3
    AND COALESCE(c.excluded_from_pnl,false)=false
  GROUP BY category → expense_by_category jsonb

Returns: { revenue, cogs, gross_profit, opex_total, expense_by_category, net_profit, delivered_orders }
```

Callers migrated to this single RPC:

1. `/finance` index (`getFinanceOverview` → drop JS heuristic `revenue × totalCost/totalPrice`, call RPC)
2. `/finance/reports` P&L tab (`get_pl_v2` → replace with new RPC; keep `get_pl_v2` alive till both switched, then drop)
3. `/finance/product-profitability` — page-level totals from RPC; per-SKU rows still from `sku-pnl.functions.ts` but rollup line matches RPC
4. `useProfitLoss` hook → thin wrapper, then remove after Simple page swap

### Step C — COD receivable single source

`getFinanceOverview` COD calc → read from `erp_cod_remittances` + reconciliation-derived `orders.net_collected` (already SET-idempotent). Formula:
`cod_outstanding = SUM(orders.total where cod & shipped & not delivered) − SUM(orders.net_collected where reconciled)`
Same one used on Overview + Receivables page.

### Step D — Product expense allocations

Covered in Step A (drop table + dialog + marketing writers). COGS will come from `products.cost_price` via journal in Phase 2.

### Verification after each step

Same brand + same date range (owner picks), print before/after:

- Overview net profit
- Reports P&L tab net profit
- Product-profitability page total
Target: teenta same number.

### Confirmations needed before I start

1. `erp_statement_lines` + puro Bank Reconciliation page (`pages/reconciliation.tsx`) drop korbo? (Ha/Na)
2. `get_pl_v2` RPC drop korbo naki temporarily rakhbo? (Recommend: Step B end-e drop)
3. Verify-er jonno kon brand + date range use korbo?  
  
Confirm proceed with full Step A–D, নিচের correction গুলো সহ।
  #### Step A — Cleanup (as proposed, confirmed)
  - Safe-drop list (১৩ table, ০ references) — drop করো
  - `erp_period_locks` — table drop + Settings থেকে Period Lock card সরাও
  - `erp_statement_lines` + পুরো Bank Reconciliation page (`pages/reconciliation.tsx`) — **drop করো** (confirmed)
  - `erp_product_expense_allocations` + dialog + marketing writer blocks (`campaigns.functions.ts:399`, `sync.server.ts:584,643`) — drop করো, marketing-এর transaction insert অংশ রেখে দাও, শুধু allocation-insert অংশ সরাও
  - `bd-charges.ts` — delete
  - `useProfitLoss` hook — Step B শেষে caller migrate করে delete
  #### Step B — Canonical P&L RPC (corrected)
  Repurpose `erp_profit_loss`:
  text
  ```text
  Revenue:
    SUM CASE
      WHEN return_type='full_return' THEN 0
      WHEN return_type='partial_return' THEN total - partial_amount
      ELSE total
    END
    FROM orders WHERE brand_id=$1 AND delivered_at::date BETWEEN $2 AND $3
      AND status IN ('delivered','completed','partial_delivered','partial_return','exchange','paid_return')

  COGS:
    SUM(oi.quantity * p.cost_price) FROM order_items oi
    JOIN orders o ON o.id=oi.order_id
    JOIN products p ON p.id=oi.product_id
    WHERE o.brand_id=$1 AND o.delivered_at::date BETWEEN $2 AND $3
      AND o.status IN ('delivered','completed','partial_delivered','partial_return','exchange','paid_return')
    -- Also return: count of matching order_items where p.cost_price IS NULL OR 0, as `items_missing_cost_data`

  OpEx: (অপরিবর্তিত, আগের প্রস্তাব অনুযায়ী)

  Returns: { revenue, cogs, items_missing_cost_data, gross_profit, opex_total, expense_by_category, net_profit, delivered_orders }
  ```
  **Correction reason**: `delivery_date` column নাই (`delivered_at` ব্যবহার করো)। `account_type='cogs'` কোনো account নাই — import journal আসলে asset/liability posting (purchase-side), expense recognition না, তাই COGS journal থেকে না, `products.cost_price × order_items.quantity` থেকে আসবে। এটা এখন অসম্পূর্ণ থাকবে (৮৯% product-এ cost_price নাই) — `items_missing_cost_data` count দিয়ে সেটা transparent flag করো, silent ভুল সংখ্যা না দেখিয়ে।
  **Pre-check required**: `apply_settlement_variance_action` RPC (COD review-queue dropdown) — এটা কি `orders.return_type` + `partial_amount` set করে "Partial return"/"Exchange" বাছলে? Confirm করো, না করলে এই migration-এই যোগ করো — নাহলে উপরের revenue CASE logic কখনো trigger হবে না।
  Caller migration: `/finance` index, `/finance/reports` P&L tab, `/finance/product-profitability` rollup — সব এই RPC-এ।
  #### Step C — COD receivable single source (as proposed, unchanged)
  `getFinanceOverview` COD calc → `erp_cod_remittances` + `orders.net_collected` থেকে পড়বে।
  #### Verification
  Brand: HobbyShop। Range: `2026-06-01` → `2026-07-10`। Before/after net profit — Overview, Reports P&L, Product-profitability তিনটাই same number দেখাচ্ছে কিনা দেখাও। `items_missing_cost_data` count-ও রিপোর্ট করো।
  **Constraint**: orders table read-only। Migration reversible। Push-এর আগে summary।