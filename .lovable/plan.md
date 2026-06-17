## Goal
Ekhon "All brands" select korle bhalo lots of jaiga e action button disabled/non-functional hoye jay (Add Income/Expense, Transfer, New Account, New Category, Orders list khali, etc.). Eta fix korbo — All-brands mode e read view sob brand er data show korbe, ar create/edit dialog gulo ekta brand picker dekhabe.

## Approach (high level)

**1. Read side (lists, totals) — sob brand er data dekhabo**
- `useAccounts`, `useCategories`, `useTransactions`, wallets query gulo `brandIds: string[]` accept korbe; `.in("brand_id", brandIds)` use korbe.
- Pages: `erp.finance.simple`, `erp.finance.wallets`, `erp.orders.web/list` etc. — `brandIds` pass korbe.
- Tables e All-brands mode hole ekta "Brand" column add korbo (chhoto badge), jate kon brand er entry shoja bujha jay.
- Total/sum row gulo sob brand jure aggregate hobe.

**2. Write side (dialogs) — brand picker add korbo**
- `TransactionForm`, `AccountForm`, `TransferDialog`, Category add form, etc. — props e `brands: Brand[]` ar `defaultBrandId` pathabo.
- All-brands mode (brandId null + brands.length > 1) hole dialog er upore ekta required **Brand** select field dekhabo. Single-brand mode e oi select hide thakbe (current behavior).
- Submit time e selected brand id use kore insert hobe.

**3. Brand context unchanged**
- `useBrand()` already `brandIds`, `isAllBrands`, `brands` expose kore — oigulo i use korbo, notun API lagbe na.

## Files to touch (Finance scope — first batch)

1. `src/hooks/erp/use-finance-query.ts` — hooks ke `brandIds: string[]` based kora.
2. `src/components/erp/finance/transaction-form.tsx` — optional brand picker.
3. `src/components/erp/finance/account-form.tsx` — optional brand picker.
4. `src/components/erp/finance/transfer-dialog.tsx` — optional brand picker.
5. `src/routes/_authenticated/erp.finance.simple.tsx` — `brandIds` use, brand column show, dialogs e brands pass.
6. `src/routes/_authenticated/erp.finance.wallets.tsx` — same treatment.

## Next batches (alada turn e korbo, jate ek shathe onek file e bug na hoy)
- **Orders pages** (`erp.orders.web`, `erp.orders.list`, `erp.orders.new`) — All-brands read enable, new order er jonno brand picker.
- **Marketing** (campaigns, expenses, attribution) — same pattern.
- **Imports** (settings, orders, reports) — same pattern.
- **Finance er baki page gulo** (recurring, taxes, reconciliation, journal, payables, receivables, budgets, fx, audit, accounts, brand-profitability, product-profitability, reports, settings).

## Technical notes
- Brand picker UI: shadcn `<Select>` + `<Label>Brand *</Label>`, dialog body er top e, required.
- Settings rakhbo: dialog open hoyle, jodi `defaultBrandId` thake (single brand mode) shei brand auto-select; nahole user manually pick korbe.
- Backend RLS already brand-scoped — koi place a query change lagbe na, shudhu client side filter `.eq` theke `.in` hobe.

## Out of scope (ei turn e)
- New backend RPC/migration.
- Brand-profitability/cross-brand reports refactor.
- Auto "split across brands" logic for transfer/expense — single brand i select korte hobe transaction wise.

Confirm korle prothome Finance scope ta complete kore dekhabo, tarpor Orders → Marketing → Imports → baki Finance ei kromone egochhi.