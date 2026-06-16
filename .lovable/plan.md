## Goal

Brand switcher e **"All Brands"** option add — eta default thakbe. User chaile ek brand select kore filter korte parbe. Reports / orders / inventory — sob jaiga te all-mode e dui brand combined data dekhabe. Settings (per-brand jegula) all-mode e disabled / brand-picker prompt dekhabe.

## Foundation (Phase 0 — ekhonkar turn)

1. **`brand-context.tsx`**
   - `activeBrandId` `"all" | string` hobe. Default `"all"`.
   - Notun field: `isAllBrands: boolean`, `brandIds: string[]` (all hole sob active brand id, ek brand hole `[id]`).
   - `activeBrand` `Brand | null` thakbe (all hole null).

2. **`brand-switcher.tsx`**
   - Top e "🌐 All Brands" item, tarpor separator, tarpor brand list.
   - Trigger label: all hole "All Brands (2)", noyle brand name.

## Phase 1 — Reports & Read-only lists (highest value, low risk)

Pattern: `if (isAllBrands) { .in("brand_id", brandIds) } else { .eq("brand_id", activeBrand.id) }` + table e brand badge column.

Pages:
- `erp.index.tsx` (dashboard)
- `erp.finance.index.tsx` (already has scope toggle — switcher-er sathe wire)
- `erp.finance.brand-profitability.tsx` (all hole per-brand breakdown table)
- `erp.finance.product-profitability.tsx`
- `erp.finance.journal/payables/receivables/audit/reports.tsx`
- `erp.imports.reports.tsx`
- `erp.marketing.rollup.tsx`, `erp.marketing.index.tsx`
- `erp.inventory.tsx` (read-only view)

## Phase 2 — Orders & Imports lists

Pages with create flow — list e all, kintu **create dialog/form e brand picker required** when all-mode:
- `erp.orders.list.tsx`, `erp.orders.web.tsx`, `erp.orders.new.tsx`
- `erp.imports.orders.index.tsx`, `erp.imports.orders.new.tsx`
- `erp.suppliers.tsx`

Bulk dialogs (`bulk-print-dialog`, `phone-history-sync-dialog`, etc.): brand info per-order theke nibe, all-mode e kaaj korbe.

## Phase 3 — Settings (per-brand only)

Settings pages (`business-settings`, `invoice-settings`, `courier-mapping-settings`, `pathao-settings`, `steadfast-settings`) per-brand. All-mode e:
- Top e inline brand picker dekhabo (current `setActiveBrandId` use kore)
- Settings page nijei brand select korte bolbe — global switcher untouched.

## Out of scope

- Cross-brand data merge for unique constraints (e.g. SKU collision) — ekhono per-brand thakche.
- Multi-currency aggregation — already handled by FX rates jeta ache.

## Rollout

Aaj turn e: **Phase 0 + Phase 1 finance.index, brand-profitability, dashboard** korbo (sob theke beshi use hoy). Verify korar por baki gulo phase-wise.

## Technical notes

- Storage key `erp.activeBrandId` reuse, value `"all"` save hobe.
- `enabled: !!activeBrand?.id` -> `enabled: isAllBrands || !!activeBrand?.id`.
- React Query keys e `activeBrand?.id ?? "all"` use kore cache split rakhbo.
- Settings page gulo te shortcut: if `isAllBrands` => render `<SelectBrandPrompt />` with inline brand list.
