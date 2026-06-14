
## Goal
Order List e bulk select kore "Sync Courier Status" button. Pathao + Steadfast direct API theke per-order live status enbe, preview dialog e ERP status mapping dekhabe (per-row editable), confirm korle bulk apply hobe.

## Identifier strategy (kivabe match korbo)
Per order following priority te courier identifier resolve hobe:

1. **`courier_shipments` table** e existing record thakle → `consignment_id` + `provider` use kore direct track API call.
2. **`orders.tracking_number` + `courier_name`** thakle → setei track call.
3. **Steadfast specifically** → `invoice_no` diye `/status_by_invoice` fallback.
4. **Eta kichu na thakle** → row dekhabe "No tracking — paste consignment ID" inline input. User paste korle live fetch.

Phone-only purono order er jonno: Phase 2 e alada "Phone history matcher" dialog (boltobo separately). Eta Phase 1 e nai.

## Status mapping (editable)
Default mapping (constants file):

```text
Pathao:
  Delivered / Partial Delivered          → delivered / partial_delivered
  Pickup_Requested / Pickup / Pickup_Failed → ready_to_ship
  At_Sorting_HUB / In_Transit / On_Delivery → shipped
  Hold                                    → on_hold
  Delivery_Failed / Return / Returned     → returned
  Cancelled                               → cancelled

Steadfast:
  delivered                  → delivered
  partial_delivered          → partial_delivered
  in_review / pending        → ready_to_ship
  in_transit / hold          → shipped
  delivery_failed / cancelled / returned → returned/cancelled
  unknown / unknown_approval → on_hold
```

Settings page (`erp.settings.tsx`) e ekta "Courier Status Mapping" card add hobe — `erp_settings.courier_status_mapping jsonb` column theke load/save, per-brand. Mapping editor table format e: courier status text + dropdown to ERP status. Phase 1 e default ship korbo, settings card next phase e add korbo (default constants prothome built-in thakbe, kaj korbe).

## UI flow

1. Orders list page e checkbox diye order select.
2. Bulk Actions popover → "Courier Services" section → naya button **"Sync Courier Status"** (disabled icon ta remove).
3. Click hole new `CourierStatusSyncDialog` open. Dialog er upore: spinner + progress (X / Y fetched).
4. Server fn `syncCourierStatusFn` selected orderIds[] niye return korbe array of:
   ```
   { order_id, invoice_no, customer, phone, current_status,
     provider, identifier, fetched_status, mapped_status,
     ok, error }
   ```
5. Dialog table:
   - Order (invoice + name)
   - Current status badge → arrow → **Editable dropdown** (proposed mapped status, all ERP statuses)
   - Courier raw status (small muted text)
   - Checkbox per row (default checked if `mapped_status != current_status` and `ok`)
   - Error row: red, "No tracking" → inline input for consignment ID + "Fetch" button.
6. Footer: "Apply X updates" button → loops `transition_order_status` RPC for each checked row → toast + invalidate queries + close.

## Files to add / edit

**New:**
- `src/lib/erp/courier-sync.functions.ts` — `syncCourierStatusFn` (server fn). Loops orderIds, resolves identifier per priority, calls Pathao `track()` or Steadfast `trackByCid/Invoice`, normalizes raw status string, applies default mapping.
- `src/lib/erp/courier-status-mapping.ts` — pure mapping constants + `mapCourierStatus(provider, raw)` helper. Client-safe (used by dialog too for re-mapping when user edits).
- `src/components/erp/orders/courier-status-sync-dialog.tsx` — the preview dialog.

**Edit:**
- `src/components/erp/orders/orders-bulk-actions.tsx` — add real "Sync Courier Status" action with `onSyncCourier` prop, remove the disabled placeholder.
- `src/routes/_authenticated/erp.orders.list.tsx` — wire state + dialog mount, pass selected ids and rows.

## Technical notes

- Server fn rate-limits: batch of 4 parallel calls (mirror of `fetchCourierHistoryFn`).
- For each shipment row uniquely identified by `order_id`, pick latest one (`order_by created_at desc, limit 1`).
- Pathao status field path: `response.data.order_status` or `status` string. Normalize lowercase + underscore.
- Steadfast status field: `response.delivery_status`.
- Errors per-order surfaced inline; one failure doesn't break others.
- `transition_order_status` already enforces auth + logs history — reuse it.
- No DB migration needed Phase 1 (mapping is hard-coded default). Settings editor + jsonb column comes Phase 2.

## Out of scope (Phase 2, alada plan)
## Phase 2 — DONE
- Editable mapping UI: `src/components/erp/settings/courier-mapping-settings.tsx`, saves to `erp_settings.config.courier_status_mapping` (per-brand). Sync fn + cron + webhook all load brand overrides.
- Phone-based historical matcher: `src/components/erp/orders/phone-history-sync-dialog.tsx`. Uses existing `fetchCourierHistoryFn`. Suggests status from delivered/cancelled counts.
- Auto-sync cron: `src/routes/api/public/cron/sync-courier.ts`, hourly pg_cron job `auto-sync-courier-status`, processes ready_to_ship/shipped/in_transit orders.
- Pathao webhook: `src/routes/api/public/webhook/pathao.ts`. Configure at Pathao with URL `https://swus-erp.lovable.app/api/public/webhook/pathao`, signature header `X-PATHAO-Signature` = env `PATHAO_WEBHOOK_SECRET` (default `f3992ecc-...`).
