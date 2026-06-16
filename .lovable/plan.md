## Goal
New PO page ke onek functional + clean banano — single page, inventory linked, percent-based payment, auto-cost flow.

---

## 1. New PO page — single page redesign (no 4-step wizard)

File: `src/routes/_authenticated/erp.imports.orders.new.tsx` — full rewrite.

Layout (one screen, scroll):
- **Top bar**: Back · Title · Brand · Draft chip · Save button (sticky)
- **Header card (compact)**: Order Date · **Cargo Agent (required)** · Supplier (optional) · Currency · FX Rate · Notes
- **Items section**: 
  - Each row: Picker (search existing inventory OR "+ Create new product"), Qty, Unit cost (foreign), Auto Subtotal
  - Picker uses a combobox listing products from `products` table for active brand. Selecting an existing product links `product_id`.
  - "+ Create new" → inline mini-form (name, SKU, optional category) creates product immediately via server fn, then auto-selects.
- **Cartons section**: same as now (carton list + per-item allocation grid), with auto-split. Mismatch warning inline.
- **Payment section (optional, supplier advance to cargo agent)**:
  - Amount input + **% input** (linked: typing % auto-fills amount; typing amount auto-fills %)
  - Quick chips: 30% / 50% / 70% / 100%
  - Wallet picker + after-balance preview
- **Sticky right sidebar**: live Grand total, units, cartons, weight, advance, due. (Keep current good sidebar.)
- Bottom: single **Create Purchase Order** button.

Validation: cargo_agent required, supplier optional, items ≥ 1 with name+qty+cost, allocation match.

---

## 2. Backend: support optional supplier + product_id linking

File: `src/lib/erp/imports/imports.functions.ts` (`createImportPo`)
- Make `supplier.id` optional in input schema.
- Items input: accept optional `product_id` per row (already in DB).

DB function `_imp_create_po` (Postgres) — check & update via migration:
- Allow `supplier_id` NULL.
- Persist `product_id` from item payload into `imp_po_items.product_id`.

Add a server fn `createProductQuick` for inline product creation (title, sku, brand_id, cost_price=0, stock=0, image placeholder), returning `{id, title}`.

---

## 3. Inventory: "Incoming" quantity display

DB: create SQL view `v_product_incoming`:
- For each `product_id` + `brand_id`: SUM(quantity) from `imp_po_items` JOIN `imp_purchase_orders` WHERE PO status NOT IN ('closed','cancelled') MINUS SUM(quantity_ok) from `imp_carton_items` for cartons already posted to inventory.

Frontend `src/hooks/erp/use-inventory-query.ts`:
- Join the view to product list; add `incoming` field on `ProductRow`.

`src/routes/_authenticated/erp.inventory.tsx`:
- Show "Incoming" column/badge next to stock (e.g. `In stock 12 · +50 incoming`).

---

## 4. Auto-cost & stock update on carton release/post

Already partially in `_imp_post_carton_to_inventory`. Verify + harden:
- When carton posted: per-piece final cost = `(carton.supplier_cost_bdt + shipping_charge_bdt + local_courier_bdt) / quantity_ok`, but allocated only to OK pieces (missing/damaged excluded from divisor — confirm current logic, fix if wrong).
- Update `products.cost_price` to **weighted moving average**: `((old_stock * old_cost) + (new_qty * new_cost)) / (old_stock + new_qty)`.
- Increment `products.stock` by `quantity_ok`.
- Insert `stock_movements` row (type=`po_receipt`, ref=carton id).

Migration: rewrite `_imp_post_carton_to_inventory` to do exactly this. Idempotent guard already exists.

---

## 5. Payment percent option (also on PO detail recordPayment)

Reuse the linked Amount↔Percent pattern in:
- New PO advance section.
- PO Detail page → "Record Payment" dialog (cargo agent bill).

Tiny `<AmountPercentInput total={..} value={amount} onChange={..}>` helper component.

---

## Technical notes

- View `v_product_incoming` permissions: `GRANT SELECT TO authenticated`.
- `createImportPo` Zod: `supplier: z.object({id: z.string()}).optional()`, `cargo_agent_id: z.string()` required.
- Add minimal `listProductsForPicker(brandId, search)` server fn returning `[{id, title, image, stock, cost_price}]` capped at 50.

---

## Files to change
- migration: alter `_imp_create_po` (supplier optional + persist product_id), rewrite `_imp_post_carton_to_inventory` (weighted cost), create view `v_product_incoming`.
- `src/lib/erp/imports/imports.functions.ts` — schema + new fns.
- `src/lib/erp/inventory.ts` / `use-inventory-query.ts` — incoming field.
- `src/routes/_authenticated/erp.imports.orders.new.tsx` — full rewrite single-page.
- `src/routes/_authenticated/erp.imports.orders.$orderId.tsx` — payment dialog percent input.
- `src/routes/_authenticated/erp.inventory.tsx` — incoming column.
- New: `src/components/erp/imports/product-picker.tsx`, `src/components/erp/amount-percent-input.tsx`.

Approve korle ami implement korte shuru korbo.
