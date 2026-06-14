## Incomplete Orders (Abandoned Checkout) Tab

Website checkout-e jara name/phone/address diyeche kintu order place koreni — tader ekta notun **"Incomplete"** tab e dekhabo Order List er moddhe. Eta `abandoned_carts` table theke ashbe (ja already exist kore). Staff chaile ekhan theke confirm korte parbe — confirm korle real order create hobe.

### Scope

1. **Notun "Incomplete" tab** Order Status Tabs strip e (orange/gray dot).
   - Count = `abandoned_carts` rows jegulo `is_converted = false` AND `customer_phone` non-empty AND current brand er.
   - Brand scope: `abandoned_carts` e direct `brand_id` nei, tai cart_items er prothom product theke brand resolve korbo (ba ekta brand_id column add korbo — recommended).

2. **Incomplete table view** (separate component, normal orders table noy):
   - Columns: Date, Customer Name, Phone, Address (city/district), Items count, Subtotal, Last Step, Actions
   - Row click → Drawer with full cart details + customer info
   - Actions: **Confirm → Order**, **Call**, **Delete**

3. **"Confirm to Order" flow**:
   - Server function `convertAbandonedCartToOrder({ cartId, brandId })`
   - Creates a real `orders` row with status = `confirmed`, source = `website`, all customer fields copied
   - Creates `order_items` from `cart_items` jsonb
   - Calls `mark_abandoned_cart_converted(cartId, newOrderId)`
   - Returns new order id → opens order drawer

4. **Filtering**:
   - Only show carts with phone length ≥ 10 AND at least 1 item
   - Sort by `updated_at DESC`
   - Old carts (>30 days, configurable) hide korbo by default

### Technical Details

**Schema change** (1 migration):
- `abandoned_carts.brand_id uuid` add (nullable, FK to brands). Backfill via cart_items[0].product_id → products.brand_id.
- Trigger: on insert/update of abandoned_carts, auto-set brand_id from first cart item's product.

**New files**:
- `src/lib/erp/abandoned-carts.functions.ts` — `listAbandonedCarts`, `convertAbandonedCartToOrder`, `deleteAbandonedCart`
- `src/components/erp/orders/incomplete-orders-table.tsx`
- `src/components/erp/orders/incomplete-cart-drawer.tsx`
- `src/hooks/erp/use-abandoned-carts-query.ts`

**Modified files**:
- `src/lib/erp/orders.ts` — add `"incomplete"` to `StatusTabKey`, add tab entry in `STATUS_TABS`
- `src/components/erp/orders/orders-status-tabs.tsx` — add dot color for incomplete
- `src/routes/_authenticated/erp.orders.list.tsx` — when active tab === "incomplete", render IncompleteOrdersTable instead of normal OrdersTable
- `src/hooks/erp/use-orders-query.ts` — add `useIncompleteCount` for tab badge

**RLS / Grants**:
- `abandoned_carts` already has policies; verify staff (admin/CS/ops) can SELECT/UPDATE/DELETE rows for their brand.
- Add policy if missing.

### Out of scope (next iteration)
- Auto-recovery emails/SMS to incomplete carts
- Funnel analytics (drop-off rate by step)
- Bulk confirm/delete actions

Confirm korle implement korbo.