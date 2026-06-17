# Brand UX Simplification Plan

## Goal
Brand switching ke simple kora. Default e sob page e **dui brand er data ekshathe** dekhabe. Prottek row/card e ekta **brand badge/tag** thakbe (e.g. "Hobby Shop" / "Toyara") jate bujha jay konta kar. User chaile uporer brand switcher diye filter korte parbe — kintu default thakbe "All Brands".

## Behavior Changes

### 1. Default = All Brands (everywhere)
- App load e default active brand = `all` (already supported in `brand-context`, but localStorage e purono single brand thakte pare).
- First-time load e localStorage e kichu na thakle "all" set hobe (already correct). Jodi user explicitly switch kore, sheta remember hobe.
- **`useBrandPicker` gate component remove/bypass**: Je sob page e currently "single brand required" bole gate dekhay (PO create, imports, etc.), shegula ke **optional** kora hobe. Default = all brands; user ekta specific brand pick korte parbe form er bhitor theke.

### 2. List pages e Brand Badge
Notun ekta chhoto component: `<BrandBadge brandId={...} />` — color-coded chip (Hobby Shop = ek color, Toyara = arek color, brand er logo/initial soho).

Apply korbo eishob list/table e:
- **Orders list** (`erp.orders.list.tsx` / `orders-table.tsx`) — order row e brand badge column
- **Imports / Purchase Orders list** — PO row e brand badge
- **Inventory** — product row e brand badge
- **Finance transactions / journal** — entry te brand badge
- **Reconciliation overview & invoice rows** — matched order er brand badge
- **Marketing campaigns** — campaign row e brand badge
- **Suppliers / Cargo agents** (jodi brand-scoped hoy)
- **Abandoned carts**

### 3. Brand Switcher = Filter only
- Top-right er `BrandSwitcher` already ache. Default "All Brands" thakbe.
- Ekta brand select korle shudhu shei brand er data dekhabe (current behavior, just default change).
- Visual hint: jokhon "All Brands" mode e, switcher er pashe chhoto text "Showing all brands" — clarity er jonno.

### 4. Create/New forms e Brand Selector inline
Je sob form e ekta specific brand dorkar (Purchase Order, New Order, New Campaign, etc.):
- Gate diye block korar bodole, **form er bhitor ekta "Brand" dropdown** thakbe.
- Default: active brand (jodi single select kora thake), nahole user ke pick korte hobe (required field, but inline — alada page block na).
- PO er khetre: user chaile "applies to both brands" option o pabe (jodi brand-agnostic PO support kora ache schema te — check kore decide korbo; na thakle just required brand picker).

## Technical Details

### Files to add
- `src/components/erp/brand-badge.tsx` — reusable badge: brand name + color (color brand record theke ba deterministic hash).

### Files to edit (high level)
- `src/contexts/brand-context.tsx` — confirm default = "all" when no localStorage entry; add a derived `brandColorMap`.
- `src/components/erp/brand-picker-gate.tsx` — relax: instead of full-page gate, expose a lightweight `<BrandPickerInline />` for forms.
- `src/components/erp/orders/orders-table.tsx` — add Brand column with `<BrandBadge />`.
- `src/components/erp/orders/incomplete-orders-table.tsx` — same.
- `src/routes/_authenticated/erp.imports.orders.index.tsx` + `.new.tsx` — add badge to list, inline brand picker in new-PO form.
- `src/routes/_authenticated/erp.inventory.tsx` — badge column.
- `src/routes/_authenticated/erp.finance.journal.tsx` + transactions list — badge column.
- `src/routes/_authenticated/erp.marketing.campaigns.index.tsx` — badge column.
- `src/routes/_authenticated/erp.reconciliation.invoice.tsx` & `.index.tsx` — badge on matched rows.
- `src/components/erp/erp-sidebar.tsx` ba header (`erp.tsx`) — small "All Brands" hint label beside switcher.

### Data fetching
- Already `useOrdersQuery` ityadi `brandIds` filter support kore via `apply-brand-scope`. "All" mode e shob brand er data ashe — that's exactly what we want. No backend change needed.
- Brand info join: orders/POs/etc. e already `brand_id` ache. List queries e brand name/slug join kora lagbe (jodi na already ashche). `BrandBadge` `brandId` nibe ar `useBrand()` theke local brands array theke name+color resolve korbe — kono extra query lagbe na.

### Color assignment
- Brand record e `logo_url` ache but no `color` column. Deterministic color: brand id/slug theke hash → pre-defined palette theke ekta color pick. (Future: brands table e `color` column add kora jay; ekhon skip.)

## Out of Scope (ei plan e nai)
- Brand-level permission (user ke specific brand e restrict kora).
- "Multi-brand PO" schema change — jodi user explicitly chay, alada turn e.
- Brand wise dashboard split (already ache via switcher).

## Verify
- Build pass + preview e Orders list e dui brand er order ekshathe, prottek e badge.
- PO new form e brand dropdown inline, gate page nai.
- Brand switcher e Hobby Shop select korle shudhu Hobby Shop, Toyara select korle shudhu Toyara, "All Brands" e dui-i.

Confirm korle implement kori. Kono particular page priority diye start korte chao (e.g. age Orders + Imports, baki gula porer turn)?