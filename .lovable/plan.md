## Dispatch Module Plan

New route `/erp/dispatch` for scan-driven order fulfillment pipeline (Pending → Packed → Ready → Shipped).

### Files to create

1. **`src/routes/_authenticated/erp.dispatch.tsx`** — main page
   - Top bar with counts (45 pending / 12 packed / 8 ready / 3 shipped today)
   - Scan input (always focused) with 3 mode pills: PACK / READY / SHIP
   - Result feedback card (green success / red error, auto-dismiss 3s)
   - 3-column pipeline (Pending | Packed | Ready) with order cards
   - Buttons: Summary slide-over, Print Batch modal, Camera scan
   - Supabase Realtime subscription on `orders` table → invalidate query

2. **`src/components/erp/dispatch/scan-input.tsx`** — scan input box with HID listener (rapid keydown + Enter)

3. **`src/components/erp/dispatch/camera-scanner.tsx`** — getUserMedia + jsQR loop @ 100ms (dynamic import jsQR)

4. **`src/components/erp/dispatch/dispatch-summary.tsx`** — slide-over panel (Sheet) with counts, courier breakdown, top products, CSV export

5. **`src/components/erp/dispatch/batch-print-dialog.tsx`** — select orders + print type (Invoice / Picking List / Both)

6. **`src/components/erp/dispatch/picking-list-print.tsx`** — new printable layout (checkbox + SKU + qty per order)

7. **`src/lib/erp/audio-feedback.ts`** — Web Audio API beeps (success / error / ship)

### Files to modify

- **`src/components/erp/erp-sidebar.tsx`** — add `{ to: "/erp/dispatch", label: "Dispatch", icon: Truck }` to Operations (right after Courier). Use a different icon for Dispatch (PackageCheck) since Courier already uses Truck.

### Technical decisions

- **Status mapping**:
  - PENDING column: `status IN ('confirmed','processing','packaging','ready_to_pack')`
  - PACKED column: `status = 'packed'`
  - READY column: `status = 'ready_to_ship'`
  - SHIPPED today: `status = 'shipped' AND updated_at >= today`
- **Scan transitions** (use existing `transition_order_status` RPC):
  - PACK mode: requires status in pending set → `'packed'`
  - READY mode: requires `'packed'` → `'ready_to_ship'`
  - SHIP mode: requires `'ready_to_ship'` → call `pathaoBookOrderAutoFn` → status becomes `'shipped'` via Pathao booking flow
- **Brand scope**: `applyBrandScope(query, brandIds)` on every orders query.
- **Realtime**: `supabase.channel('dispatch-orders').on('postgres_changes', { table: 'orders' }).subscribe()` inside `useEffect`, invalidate React Query.
- **Order lookup**: scan input matches `invoice_no` OR last 8 chars of `id` (UUID prefix shown in spec like `#9F6FD2C9`).
- **Dependencies**: `bun add jsqr` for camera QR decoding.

### Reuse

- `transition_order_status` RPC
- `pathaoBookOrderAutoFn` server function
- `PrintableInvoice` component (in `order-invoice.tsx`)
- `useBrand` + `applyBrandScope`
- shadcn `Sheet`, `Dialog`, `Button`, `Card`, `Badge`

### Out of scope

- Editing `_authenticated/erp.orders.list.tsx` or other pages
- Modifying `transition_order_status` RPC or any DB schema
- Real-time courier webhook changes
