## Goal

Product-er multiple color variant support — protita color-er nijoshto stock, jate inventory te color-wise stock dekha jay ar Purchase Order (local) ebong Imports (China PO) e color-wise quantity dewa jay.

## Approach

Existing `product_variants` table already ache (stock, reserved_stock, available_stock, weighted_avg_cost, sku) — eta-i color variant-er base hobe. Notun column add korbo `color_name` + `color_hex` + `image` (color-specific photo, optional). Tarpor product edit e ekta clean "Colors" section, inventory list e expandable color breakdown, ar PO/Import item rows e color picker.

## Scope — what gets built

### 1. Schema (migration)
- `product_variants` table e add: `color_name text`, `color_hex text`, `image text`, `sort_order int default 0`
- `local_po_items` e add: `variant_id uuid references product_variants(id)` (nullable, backward-compat)
- `imp_po_items` e add: `variant_id uuid references product_variants(id)` (nullable)
- `imp_carton_items` already variant aware kina check; na thakle `variant_id` add
- Receive flow update: local PO + import receive stock movement variant_id sathe likhbe (already partial support thakle just wire korbo)

### 2. Product Edit dialog — "Colors" tab
- `src/components/erp/inventory/product-edit-dialog.tsx` e existing form sections-er pashe notun **Colors** section
- Add color row: name (Red/Blue/...), color swatch picker (hex), optional photo upload, opening stock, low-stock threshold, SKU suffix auto
- Delete (soft via is_active=false jodi stock movements thake), reorder via drag handle
- Save: bulk upsert via server fn

### 3. Inventory list — color breakdown
- `erp.inventory.tsx` row expandable: jodi product-er variants ache, color swatches + per-color stock chip dekhabe ("🔴 Red 12 • 🔵 Blue 5")
- Filter: "has colors" toggle
- Low-stock alert per variant

### 4. Local Purchase Order (new + edit)
- `erp.purchase-orders.new.tsx` ItemDraft e `variants: { variant_id, qty }[]` add
- Product pick korar por jodi colors thake → row expand hoye color rows dekhabe with qty input + swatch
- Total qty = sum of color qty; cost x qty calc okay
- Receive flow color-wise stock add korbe

### 5. Import (China) PO
- `erp.imports.orders.new.tsx` item row e same color breakdown
- Carton allocation: kon carton e kon color koto — optional, default flat distribute
- Receive (carton-in) stock movement variant-aware

### 6. Reorder queue / low-stock
- Variant-level low-stock surface korbe (just label "Product — Red")

## Out of scope (this round)
- Size/material multi-axis variants (color-only ekhon)
- Web storefront-side color picker UI (frontend public site)
- Migrating historical movements to variants

## Technical notes
- Existing `recompute_reserved_stock` trigger variant_id already handle kore kina check kore tarpor migration
- All grants + RLS existing patterns follow
- Color hex validation: regex `^#[0-9a-fA-F]{6}$`

## Build order
1. Migration (schema + grants)
2. Server fns: `upsertProductColors`, update PO/import create+receive
3. Product edit Colors UI
4. Inventory list expand
5. Local PO color allocation UI
6. Imports PO color allocation UI
7. Smoke test each flow

Approve korle ami step-by-step build korbo, prottek major step-er por verify korbo.