# Finance Module — Cleanup & Simplification Plan

## Current State (audit)

Finance e onek route ache, kintu onek age theke already redirect stub hoye gache (7 line):
- `finance/audit` → dollar-purchase (redirect)
- `finance/fx` → settings?tab=fx (redirect)
- `finance/brand-profitability`, `finance/cod-remittance`, `finance/payables`, `finance/reconciliation`, `finance/recurring`, `finance/simple` — sob already redirect stub.

Active heavy pages:
- `finance/index` (632 lines) — Overview/Dashboard
- `finance/reports` (745) — Reports
- `finance/dollar-purchase` (518), `accounts` (301), `taxes` (324), `budgets` (170)
- Layouts: `journal`, `receivables` (AR/AP), `wallets`, `settings`, `product-profitability`

Nav tabs (current): Overview, Chart of Accounts, Wallets, Journal, AR/AP, Dollar Purchase, Budgets, Taxes, Profitability, Reports, Settings → **11 tabs**, scroll lage.

## Problems
1. 11 top tabs — beshi, cognitive load high.
2. 8+ orphan redirect route files clutter create kortece (codebase noise, route tree size).
3. Overview + Reports overlap — duplicate KPI/charts likely.
4. Wallets + Chart of Accounts conceptually overlap (account list).
5. Dollar Purchase Finance-er moddhe ase, kintu Marketing-eo Ad Funding ache — link mismatch.

## Proposed Simplification

### 1. Delete dead redirect files (8 files)
Already nav theke unreachable, just clutter:
- `erp.finance.audit.tsx`, `erp.finance.fx.tsx`, `erp.finance.brand-profitability.tsx`, `erp.finance.cod-remittance.tsx`, `erp.finance.payables.tsx`, `erp.finance.reconciliation.tsx`, `erp.finance.recurring.tsx`, `erp.finance.simple.tsx`

Old links jodi kothao thake (sidebar/menu), update kore proper destination e pathabo.

### 2. Consolidate nav from 11 → 7 tabs
```text
Overview │ Accounts │ Journal │ AR/AP │ Dollar Purchase │ Reports │ Settings
```
- **Merge "Wallets" into "Accounts"** — wallets = cash/bank accounts subset. Accounts page e ekta "Wallets" filter chip.
- **Move "Budgets" + "Taxes" + "Profitability" into Reports** as sub-tabs — egulo reporting/planning views, alada top-level dorker nai.
- **Settings** unchanged.

### 3. Overview page trim
632 lines → target ~300. Duplicate cards (already Reports e ache) remove, keep:
- Cash position (per wallet)
- This month: Revenue, Expense, Net
- AR/AP outstanding
- Recent transactions (10)
- Quick actions (New transaction, New bill, Transfer)

### 4. Keep as-is (useful, not bloated)
- Journal, AR/AP, Dollar Purchase, Settings — already clean layouts.
- Components in `src/components/erp/finance/` — sob actively used (verify on apply).

## Out of scope
- Backend tables/RPC change na — pure UI/nav restructure.
- Dollar Purchase FIFO logic untouched.
- Reports tab er internal sub-pages restructure korbo na (just budgets/taxes/profitability accommodate).

## Risk
Low. Redirect files delete korle direct URL hit korle 404 dekhabe — acceptable, ora already nav theke hidden.

Approve korle implement kori.
