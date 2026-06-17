## Goal
Brand switcher er upor pura app er dependency komano. Default e shob page e **shob brand er data** dekhabe. Brand selection only oi page er local filter ba create-time mandatory field hisebe kaj korbe.

## New Brand Model

### 1. Global behavior change
- Top header er `BrandSwitcher` thakbe, but default value = **"All Brands"**.
- Kono page ar `useBrandPicker` gate dekhabe na (no more "Please select a brand" blocker).
- `useBrand()` hook same thakbe, but pages eta read-only filter hisebe use korbe — gate hisebe na.

### 2. List / Read pages (default: all brands)
Eishob page e **brand column** thakbe table e + page-local brand filter dropdown (top-right):

- CRM (customers, list, details)
- Orders (list, web orders, incomplete)
- Inventory
- Suppliers
- Imports → Purchase Orders list
- Finance (accounts, transactions, journal, reports, etc.)
- HR (employees, attendance, leave)
- Marketing (campaigns, expenses, attribution)
- Reconciliation
- Courier
- Settings → Business / Invoice / Courier mapping (each brand er setting alada card hisebe dekhabe, ba page-local brand tab)
- Dashboard (already supports multi-brand, just polish)

Page-local filter er value local state — header er global brand ke override korbe na. URL search param `?brand=<id>` e persist korbe jate share/back kaj kore.

### 3. Create / Edit pages (brand mandatory)
Eishob form e top e ekta **"Brand *"** select field thakbe (required):

- New Order (`erp.orders.new.tsx`)
- New Purchase Order (`erp.imports.orders.new.tsx`)
- New Employee, New Supplier, New Product, New Campaign, New Account, New Transaction, etc.

Rules:
- Brand select na korleo onno field (name, phone, address, courier charge, items) fill kora jabe — disabled na.
- Submit button disabled jotokkhon na brand select kora.
- Default value: jodi header e single brand select thake, oita pre-fill; "All Brands" hole khali.
- Edit page e existing record er brand pre-selected + locked (change kora jabe na, ba alada "Transfer brand" action).

### 4. Components to add/change

**New shared components:**
- `src/components/erp/brand-filter.tsx` — page-local brand filter dropdown (controlled, "All" + brand list, URL sync optional).
- `src/components/erp/brand-select-field.tsx` — form field for create/edit, required variant, integrates with react-hook-form.

**Update:**
- `src/contexts/brand-context.tsx` — default `activeBrandId = "all"` (already supports it, ensure localStorage default).
- `src/components/erp/brand-picker-gate.tsx` — **delete** ba deprecate kore dibo. Jeshob page eta use korche, sheguloy `BrandFilter` (read pages) ba `BrandSelectField` (create pages) bosabo.
- `src/lib/erp/apply-brand-scope.ts` — already accepts `null/all`; ensure queries return multi-brand rows + include `brand_id` so column show kora jay.

### 5. Migration approach (phase-wise, to avoid breaking everything)

**Phase 1 — Infra (this turn):**
1. Create `BrandFilter` + `BrandSelectField` components.
2. Remove gate behavior from `useBrandPicker` (return null gate, still expose brandId for backward compat).
3. Ensure all list queries already pass through `applyBrandScope` with "all" support (audit).
4. Add `brand` column + page-local filter to: **CRM list, Orders list, Inventory, Suppliers, Purchase Orders list**.
5. Add mandatory `BrandSelectField` to: **New Order, New Purchase Order**.

**Phase 2 (next turn, after you confirm Phase 1 works):**
- Same treatment for Finance, HR, Marketing, Reconciliation pages.
- Settings page → per-brand tabs.

### 6. Out of scope (this turn)
- RLS / permission change — already brand-scoped via `has_brand_access`, unchanged.
- Bulk re-assign brand action.
- Backend schema change.

## Technical Notes
- `BrandFilter` URL param: use TanStack Router `useSearch` + `navigate({ search })`.
- `BrandSelectField` validation: zod `z.string().uuid({ message: "Brand select korun" })`.
- Edit pages: pass `lockedBrandId` prop to disable the select.
- Brand column in tables: use existing `BrandBadge` component (already exists).

## Files to Touch (Phase 1)
- create `src/components/erp/brand-filter.tsx`
- create `src/components/erp/brand-select-field.tsx`
- edit `src/components/erp/brand-picker-gate.tsx` (neuter gate)
- edit `src/contexts/brand-context.tsx` (confirm "all" default)
- edit `src/routes/_authenticated/erp.crm.index.tsx`
- edit `src/routes/_authenticated/erp.orders.list.tsx` (or index)
- edit `src/routes/_authenticated/erp.orders.new.tsx`
- edit `src/routes/_authenticated/erp.inventory.tsx`
- edit `src/routes/_authenticated/erp.suppliers.tsx`
- edit `src/routes/_authenticated/erp.imports.orders.index.tsx`
- edit `src/routes/_authenticated/erp.imports.orders.new.tsx`

## Question for you
1. Settings page e tumi ki chao: (a) per-brand **tab** (Brand A | Brand B), naki (b) ekta brand select kore tar setting dekhabe? Ami (a) suggest korchi — easier compare kora jay.
2. Edit page e brand **locked** thakbe (recommended) naki change kora jabe? Brand change korle order/transaction onno brand er hoye jay — accounting jhamela hoy.

Confirm korle Phase 1 implement kora shuru korbo.