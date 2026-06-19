## Import Landed Cost Workflow — Simplified

Existing flow (FX/freight/customs `LandedCostCard`, `imp_post_to_inventory` RPC) thakbe — kichu drop hobe na. Notun simplified shipping-weight + carton-receive flow additive add hobe.

---

### PHASE 0 — Migration (additive only)

`**imp_purchase_orders**` — add:

- `shipping_weight_kg numeric`
- `shipping_rate_per_kg numeric`
- `shipping_cost_bdt numeric` (manual override OR auto kg×rate)
- *(`other_charges_bdt` already ache — reuse)*

`**imp_cartons**` — add:

- `cost_share_bdt numeric` (auto-computed on save)
- *(`weight_kg` already ache — reuse)*

`**imp_carton_items**` — add:

- `received_qty integer`
- `damaged_qty integer NOT NULL DEFAULT 0`
- `usable_qty integer GENERATED ALWAYS AS (COALESCE(received_qty,0) - COALESCE(damaged_qty,0)) STORED`
- *(`quantity_expected`, `quantity_ok`, `quantity_damaged` already ache — touch korbo na, parallel column rakhbo)*

---

### PHASE 1 — Arrived BD: Shipping Cost Card

New component `ShippingCostCard` — `erp.imports.orders.$orderId.tsx` e render when `po.status === 'arrived_bd'`.

Fields: total weight (kg), rate (৳/kg), auto total = kg×rate, other charges. Save button → server fn `saveShippingCost({ po_id, shipping_weight_kg, shipping_rate_per_kg, other_charges_bdt })`. Triggers carton cost-share recompute.

---

### PHASE 2 — Carton Cost Split

Server fn `recomputeCartonCostShares(po_id)`:

- Read all cartons for PO + their `weight_kg`
- If sum(weight_kg) > 0 → `cost_share = (carton.weight / total_weight) × shipping_cost_bdt`
- Else → equal split: `shipping_cost_bdt / carton_count`
- Bulk update `imp_cartons.cost_share_bdt`

Carton list table: add inline weight input + show computed cost share. Save weight → trigger recompute.

---

### PHASE 3 — Carton Received: Quantity Check

New component `CartonReceiveDialog` (opened from carton row when stage allows). Per item row:

- Expected (read-only from `quantity_expected`)
- Received (input)
- Damaged (input)
- Usable (auto, generated col)

Server fn `saveCartonReceipt({ carton_id, items: [{po_item_id, received_qty, damaged_qty}] })` → upsert `imp_carton_items` rows.

---

### PHASE 4 — Landed Cost Summary

New component `LandedCostSummary` (per carton or per item):

```text
product_cost  = po_item.unit_cost_cny × po.fx_rate_cny_bdt
shipping_share = carton.cost_share_bdt / sum(usable_qty in carton)
other_share    = po.other_charges_bdt / sum(usable_qty in PO)
landed_cost    = product_cost + shipping_share + other_share
```

Computed client-side from already-loaded data. Shows breakdown card with usable/damaged counts.

---

### PHASE 5 — Post to Inventory

New server fn `postCartonReceiptToInventory({ carton_id })`:

1. Load carton items + PO + cost shares
2. For each item with `usable_qty > 0`: `supabase.rpc('adjust_stock_v2', { _delta: usable_qty, _unit_cost: landed_cost, _reason: 'import_receive', _source: 'import', _reference_type: 'imp_carton', _reference_id: carton_id, _idempotency_key: 'imp:'||carton_id||':'||po_item_id })`
3. For each with `damaged_qty > 0`: separate `adjust_stock_v2` call with `_delta: -damaged_qty` (only if previously posted) — OR just log to activity_log (skip negative if usable was the posted qty). **Pick:** log damaged to `activity_log` only (no negative stock movement — usable was never received as +ve in first place).
4. Mark carton `posted_at = now()`, status → 'in_stock'
5. WAC updates auto via existing trigger on `stock_movements`

Idempotent via `_idempotency_key`.

---

### Files

**New:**

- `supabase/migrations/<ts>_import_landed_cost_simplified.sql`
- `src/components/erp/imports/shipping-cost-card.tsx`
- `src/components/erp/imports/carton-receive-dialog.tsx`
- `src/components/erp/imports/landed-cost-summary.tsx`

**Edited:**

- `src/lib/erp/imports/imports.functions.ts` — add `saveShippingCost`, `recomputeCartonCostShares`, `saveCartonReceipt`, `postCartonReceiptToInventory`
- `src/routes/_authenticated/erp.imports.orders.$orderId.tsx` — mount ShippingCostCard + carton receive trigger + landed summary
- (carton list section in same route) — weight input column

**Untouched:** existing `LandedCostCard`, `imp_post_to_inventory` RPC, FX/freight/customs flow. New workflow runs parallel.

---

### Open question

Damaged qty handling — confirm: log only to `activity_log` (no stock movement, since damaged was never in usable count), OR also write a `damaged_import` movement with delta=0 for audit trail?

---

Confirm korle implement shuru korbo.  
**Confirm.** Damaged qty → `activity_log` only (no stock movement) ✅

Build শুরু করো। 🚀