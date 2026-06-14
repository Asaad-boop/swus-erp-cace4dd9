
# Inventory Module Upgrade Plan

## Problem
Tumi ERP notun setup korcho, kintu `orders` table-e onek purono order ache. Confirm korle stock minus hoy — tai existing data thekei stock e jhamela. Initial/opening stock set korar ekta proper way dorkar, plus inventory module ke advance ecommerce-grade banano dorkar.

## Part 1 — Initial / Opening Stock Setup (priority)

### Approach (recommended)
**Opening Stock entry** as a special stock movement (`reason = 'opening_stock'`).
- Already existing `adjust_product_stock` RPC ar `stock_movements` table reuse korbo.
- Notun reason add korbo: `opening_stock`.
- Ekta dedicated **"Set Opening Stock"** screen thakbe jekhane brand-wise sob product list — physical count input korle direct stock set hoye jabe (delta auto-calculate).

### Two modes
1. **Per-product quick set** — table inline input "Physical count" → "Set" button. System current stock theke delta ber kore movement insert korbe.
2. **Bulk import (CSV)** — product slug/SKU + opening qty. Preview → confirm → batch apply.

### Historical orders ki korbo?
3 options, user choose korbe:
- **(A) Ignore past orders** — opening stock = current physical count. Future order theke minus hobe. **Recommended**, simplest.
- **(B) Cutoff date** — ekta date set koro; oi date er age er confirmed orders stock impact korbe na (skip in trigger). Future orders normal.
- **(C) Backfill** — sob historical confirmed order er items diye stock recalculate. Risky, recommend kori na.

Plan: **Option A** default, with optional Option B (cutoff date in brand settings) for jara strict chay.

## Part 2 — Advanced Inventory Features

### Core upgrades
1. **Editable threshold inline** — table row e low_stock_threshold direct edit.
2. **SKU / Barcode field** — product-e add (migration), search & scan support.
3. **Cost price (purchase price)** — product per unit cost, profit calc + stock valuation.
4. **Stock valuation widget** — total stock × cost = inventory worth (per brand).
5. **Reorder point + reorder qty** — low stock alert auto-suggest "order N units".
6. **Variant-level stock** — `product_variants` table already ache; variant-wise stock movement support.
7. **Multi-warehouse / location** (optional, future) — `warehouses` table, stock per location. Skip for now or simple toggle.

### Operations & UX
8. **Bulk actions** — multi-select rows → bulk stock in/out, bulk threshold update, bulk activate/deactivate.
9. **Quick filters** — by category, by supplier, by tag, value range.
10. **Stock alerts dashboard widget** — ERP home e low/out count.
11. **Activity audit** — already movements ache; user name + avatar dekhabo, filter by user/date/reason.
12. **Print stock report (PDF)** — per brand, date range.
13. **Stock transfer** (multi-brand) — Brand A → Brand B transfer with paired movements.
14. **Supplier link on stock-in** — kon supplier theke ese6e, cost auto-fill, purchase entry-r songe link.

### Smart features
15. **Auto reorder suggestion** — low stock + sales velocity (last 30 days) = suggested PO qty.
16. **Stock aging report** — kon product koto din thekey shelf-e ache (slow movers).
17. **Sales velocity** — daily/weekly avg sell rate per product.
18. **Expected stockout date** — current stock ÷ velocity = X days left.
19. **Dead stock report** — 60+ days no sale.

## Part 3 — Suggested Build Order (phased)

**Phase 1 (immediate, this turn or next):**
- Migration: add `opening_stock` reason; add `cost_price`, `sku`, `barcode`, `reorder_point` columns to `products`.
- New tab: **"Opening Stock"** — bulk per-product physical count input + apply.
- Inline editable threshold in products tab.

**Phase 2:**
- Bulk actions, CSV import for opening stock, supplier-linked stock-in.
- Stock valuation card + dashboard widgets.

**Phase 3:**
- Sales velocity, reorder suggestion, dead stock, aging, transfer between brands.
- Variant-level movements.

## Questions for tumi
1. **Historical orders**: Option A (ignore, opening stock = today's count) ki ok? Naki cutoff date chao?
2. **Phase 1 e kon kon feature** tumi age chao? (Suggestion: Opening stock screen + cost_price + sku + inline threshold edit + stock valuation card)
3. **Multi-warehouse** kichu lagbe? (Akhon shudhu single location per brand?)
4. **Barcode scanner** support dorkar? (USB scanner = just input focus, ja already kaj korbe; mobile camera scanner = extra lib)

Tumi confirm korle Phase 1 implement kore felbo.
