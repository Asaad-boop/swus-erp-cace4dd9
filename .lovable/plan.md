## Product Combo (Bundle) System

Combo = ekta "parent" product jeta multiple child products/variants ke bundle kore ekta SKU te bikri kore. Order hole child products er stock automatically kome, cost/profit accurate hoy.

### 1. Database

New table `product_combo_items`:
- `id`, `combo_product_id` (FK → products), `child_product_id` (FK → products), `child_variant_id` (FK → product_variants, nullable), `quantity` (int, default 1), `created_at`

Add `is_combo boolean default false` column to `products` table.

RLS: authenticated read + brand-scoped write (existing pattern follow korbe).

Helper view `v_combo_cost`: combo_product_id → sum(child.cost_price × qty) → real COGS.

### 2. Combo builder UI (Inventory page)

Product edit dialog e notun tab **"Combo Items"** (only visible jodi `is_combo = true`):
- Toggle: "This is a combo/bundle product"
- Product picker (search) → add child product + variant + qty
- Table: child image, title, variant, qty, unit cost, line cost, remove
- Auto-calculated: total cost, suggested price, margin %
- Save button → upsert `product_combo_items`

### 3. Stock behavior

Combo product er nijer `stock` count na — display koro **min(child.stock / qty)** as "buildable units". Inventory list e combo row e badge "COMBO" + buildable count.

### 4. Order flow (bill korar somoy)

Jokhon combo product order e add hoy:
- Order item e combo product save hoy (as usual, with combo price)
- **Reserve/deduct stock** — combo er nijer stock na kome, prottek child product/variant er stock `qty × order_qty` kore kome
- `reserve_stock` / `commit_stock` RPC gulote combo detect korle child items er upor loop kore
- Stock movement e note: "Combo: {parent_title}"

### 5. Order details display

Order details page e combo line er niche small "includes:" list — jei child products bundle e ache, quantity soho.

### 6. Cost / P&L

COGS calculation combo hole → `v_combo_cost` theke real cost use hobe (not combo product er own cost_price). Marketing SKU-PnL o correct thakbe.

---

### Technical details

- Migration: `product_combo_items` table + `is_combo` column + `v_combo_cost` view + update `reserve_stock`/`commit_stock`/`release_stock` RPCs to expand combos.
- New component: `src/components/erp/inventory/combo-items-editor.tsx`
- Edit `product-edit-dialog.tsx` — add "Combo" tab
- Edit `erp.orders.$orderId.tsx` — show child breakdown for combo items
- Edit inventory list — show COMBO badge + buildable count

Approve korle migration diye start korbo.
