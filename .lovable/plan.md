## Goal

Finance & Accounting dashboard ke ekta complete "command center" baniye dewa — jekhane current capital, inventory value, profitability, account balances, receivables/payables, imports advance/due, recurring fixed costs — sob ekjaygay clean view e dekha jay.

## Current state

`/erp/finance` (overview) e already ache: today/range sales, cash/bank/mfs, COD receivable, AR due, supplier payable, expense by category, 12-month revenue vs expense, accounts list, recent transactions.

Onek kichu missing — Net Worth/Capital, Inventory valuation, Imports advance & due, Recurring schedule, upcoming dues calendar, P&L summary card, top expenses, cashflow trend.

## Plan: Restructure `/erp/finance` (overview) into 4-zone dashboard

### Zone 1 — Net Worth / Capital Snapshot (top hero strip)

4 large KPI cards:

- **Total Capital** = Cash + Bank + MFS + Inventory value + AR + COD receivable + Imports advance − Payables − Imports due
- **Liquid Cash** = Cash + Bank + MFS (sub-breakdown chip)
- **Inventory Value** = SUM(stock_qty × cost_price) across all warehouses
- **Net Receivable** = COD receivable + AR due + Imports advance − Supplier payable − Imports due

### Zone 2 — Profit & Loss Strip

- Range P&L: Revenue, COGS, Gross Profit, Operating Expense, **Net Profit** (with margin %)
- Mini sparkline: last 30 days net daily profit
- Refund/Return loss separate chip

### Zone 3 — Money Map (3 columns)

**Column A — Where my money is**

- Accounts list grouped: Cash / Bank / MFS with balances + totals
- Inventory value per brand mini-bar

**Column B — Money coming in**

- COD receivable (per courier breakdown: Pathao, Steadfast, etc.)
- AR due (customer-wise top 5)
- Imports advance paid (PO-wise top 5)
- Other income (range)

**Column C — Money going out**

- Supplier payable top 5
- Imports due top 5 (PO + ETA)
- Upcoming recurring (next 30 days, date-wise list) — uses `erp_recurring_rules.next_run`
- Top 5 expense categories (range)

### Zone 4 — Trends & Activity

- 12-month Revenue vs Expense vs Net Profit (line/bar combo)
- Expense donut by category
- Recent 10 transactions table (existing)
- Quick links row: Reconciliation, Journal, Reports, Budgets, Payables, Receivables, Recurring, FX

## New server function

`getFinanceOverview` — single server fn aggregating everything to avoid N round-trips:

```
{
  capital: { total, liquid, inventory, receivable, payable, breakdown },
  pnl: { revenue, cogs, gross, expense, net, margin, refundLoss, dailySeries[] },
  accounts: [...],
  inventoryByBrand: [...],
  receivables: { codByCourier[], arTop5[], importsAdvanceTop5[], otherIncome },
  payables: { supplierTop5[], importsDueTop5[], upcomingRecurring[], topExpenseCats[] },
  monthlySeries: [...],
  recentTxns: [...]
}
```

Live under `src/lib/erp/finance-overview.functions.ts` (server-side aggregation; respects brand scope via middleware).

## Inventory valuation

Query `products` + `product_variants` for `stock_qty * cost_price`. If no `cost_price`, fall back to last purchase price or 0; show warning chip "X products without cost".

## Imports advance & due

From `imp_purchase_orders` + `imp_payments`:

- Advance = SUM(paid) for PO status IN (draft, ordered, in_transit) — i.e. not received yet
- Due = (total − paid) for received POs not fully settled

## Recurring schedule

From `erp_recurring_rules` where `is_active=true AND next_run BETWEEN now AND now+30d`, ordered by `next_run` with amount + account.

## UI conventions

- Tailwind + existing shadcn `Card` components, semantic tokens only
- Number-heavy → tabular-nums, `fmtBdt()`
- Hover any KPI → tooltip with formula
- Each major card has "View details →" link to the dedicated sub-route

## Files

- **new**: `src/lib/erp/finance-overview.functions.ts`
- **edit**: `src/routes/_authenticated/erp.finance.index.tsx` — full rewrite using new server fn, new layout
- **edit (small)**: `src/lib/erp/finance.ts` — add helper formulas if needed

## Out of scope (later phases)

- Cash flow forecasting
- Multi-currency consolidation card
- Drill-down modal per KPI (link to sub-routes for now)
- Budget vs actual chart (already has `/budgets` route)

## Time

1 file new, 1 file heavy rewrite. Ek shot e shob shipping.  
  
koor and aro advance korte parle koro