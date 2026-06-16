# Product/SKU Profitability Report — Build Plan

Eta boro feature. Tomar spec exact follow korbo, kintu **3 phase** e bhag korbo jate har step verify kora jay (golpo na, real data e). Onek field already ache, onek nai — niche details.

---

## Existing data audit (ki ache, ki nai)

`**order_items` (current columns):** id, order_id, product_id, variant_id, product_name, product_image, variant_label, sku, quantity, unit_price, line_total, weight_kg, length_cm, width_cm, height_cm, created_at, updated_at.

Missing for profitability:

- `unit_cost_snapshot`, `line_discount_allocated`, `delivery_charge_allocated`, `courier_cost_allocated`, `packaging_cost_allocated`, `refund_amount_allocated`, `source_type`, `status_snapshot`

`**orders`:** has `source` (text), discount_amount, shipping_fee, total, status, payment_method, brand_id, confirmed_at, delivered_at, paid_at, shipped_at — enough.

`**courier_shipments`:** has provider, cod_amount, delivery_charge (need to verify) → courier cost source.

`**products`:** has `cost_price` → fallback COGS.

**Missing tables:** `erp_product_expense_allocations`, `erp_exchange_cases`, `erp_return_cases`, `erp_ad_product_links` — none exist.

**Existing reusable:**

- `marketing_campaign_products` already links campaign↔product (can extend for adset/ad).
- `erp_transactions` has expense entries (link to product via new allocation table).
- `erp_expense_categories` for marketing categories (Video, Photo, Influencer, etc.).

---

## Phase A — Schema & RPC foundation

### A1. Migration: extend `order_items` (backward-safe)

Add nullable columns:

- `unit_cost_snapshot numeric`, `line_discount_allocated numeric DEFAULT 0`, `delivery_charge_allocated numeric DEFAULT 0`, `courier_cost_allocated numeric DEFAULT 0`, `packaging_cost_allocated numeric DEFAULT 0`, `refund_amount_allocated numeric DEFAULT 0`, `source_type text`, `status_snapshot text`

**Backfill trigger** (on confirm): when order goes `confirmed`, snapshot `unit_cost_snapshot` from `products.cost_price`, allocate `line_discount_allocated` and `delivery_charge_allocated` by **item value ratio** (`line_total / order_subtotal`), set `source_type` from `orders.source`. Idempotent.

Also one-time backfill for already-delivered orders so the report works from day 1.

### A2. New tables (with GRANT + RLS, admin/operations/finance access)

1. `**erp_return_cases**` — exact fields from spec.
2. `**erp_exchange_cases**` — exact fields from spec.
3. `**erp_product_expense_allocations**` — link `erp_transactions` rows to product/SKU with `expense_type` enum-check + `allocation_method` (`direct` / `percent` / `equal_split`).
4. `**erp_ad_product_links**` — link Meta campaign/adset/ad to product/SKU with `allocation_percent`. (Use `marketing_campaign_products` as compatibility view if needed.)

Each table: `brand_id` scoped RLS via `has_role(admin|operations)`, indexes on `(brand_id, product_id)` and reference IDs.

### A3. Helper: courier cost lookup

Function `get_order_courier_cost(_order_id)` → returns `{outbound, return, cod_fee}` from `courier_shipments`. Used for per-item allocation by value ratio.

### A4. Main RPC: `get_product_profitability_report(...)`

Signature exactly as spec'd. Returns one big jsonb:

```jsonc
{
  "product": {...},
  "stock":     { opening, stock_in, current, closing },
  "quantities":{ website_orders, manual_orders, confirmed, delivered, shipped, cancelled, returned, exchanged, damaged, refunded },
  "sources":   [ { source, created, confirmed, shipped, delivered, returned, revenue, delivery_collected, net_payable, delivery_rate } ],
  "revenue":   { gross, delivery_collected, discount, refund, net_payable },
  "cost":      { cogs, courier_out, courier_return, packaging, return_loss, exchange_loss, damage_loss, refund_loss, meta_ads, marketing_content },
  "marketing": { content, influencer, photo, other, meta_ads, breakdown: [...] },
  "profit":    { gross, contribution, net, per_delivered_unit, per_confirmed_unit, return_rate, exchange_rate, damage_rate, delivery_success_rate, break_even_qty },
  "items":     [ per-order-item breakdown ],
  "returns":   [...], "exchanges": [...],
  "warnings":  [ "missing_cost", "missing_source", ... ]
}
```

Filters: `p_source` (array), `p_courier` (array) — handle in `WHERE`.

Date basis: parametrize column (`created_at` / `confirmed_at` / `delivered_at`).

Allocation logic for COGS/courier/delivery (when item_value_ratio missing): fallback to qty ratio.

---

## Phase B — Report page UI

### B1. Route: `src/routes/_authenticated/erp.finance.product-profitability.tsx`

Layout (top → bottom):

1. **Filter bar** (sticky): Brand (from context), Product autocomplete, Variant select (loaded after product), Date range presets + custom, Date basis (radio), Source (multi-select), Courier (multi-select).
2. **Product summary card**: name, image, SKU, brand badge.
3. **Quantity funnel** (horizontal bars): Ordered → Confirmed → Shipped → Delivered → Returned/Exchanged.
4. **KPI cards grid**: Net Revenue, COGS, Total Cost, Net Profit, Profit/Delivered Unit, Return Rate, Delivery Success Rate, Break-even Qty.
5. **Revenue breakdown** (Card with rows): Gross sales, +Delivery collected, −Discount, −Refund, =Net payable.
6. **Cost breakdown** (Card with rows): COGS, Courier (out+return), Packaging, Return loss, Exchange loss, Damage loss, Refund loss, Meta ads, Marketing/content. Each row hide-able if 0 (per memory).
7. **Profit cards** (3-col): Gross Product Profit, Contribution Profit, Net Product Profit + margin %.
8. **Source-wise table**: Source × (Created/Confirmed/Shipped/Delivered/Returned/Revenue/Delivery/Net/Rate).
9. **Order-item detail table**: collapsible, paginated, export CSV.
10. **Return cases table** + **Exchange cases table**: each row shows type, qty, loss, status.
11. **Marketing/Meta breakdown** table: campaign/expense → allocated amount → ROAS.
12. **Data quality warnings panel**: top-right banner, lists each warning with count + "fix" link.

Use recharts for funnel + a small donut for cost composition. Empty sections hide entirely (no "0" cards cluttering — per memory rule).

### B2. Product-page entry: `src/routes/_authenticated/erp.products.$id.profitability.tsx`

Reuse same component with `product_id` pre-filled from route param. (Products route group: need to verify it exists; if not, only add the finance-side route.)

### B3. CSV export

Use existing `downloadCsv` helper from `@/lib/erp/orders`. Buttons on source table, item detail table, return/exchange tables.

---

## Phase C — Companion screens (case management + linking)

These make the report **accurate**. Without C, the report shows warnings but no data to compute return/exchange/marketing loss.

### C1. Return Case dialog

From an order item → "Mark return". Form: type, condition, qty, refund amount, customer paid delivery, packaging loss, note. On save → insert `erp_return_cases` row. Reflected in report instantly.

### C2. Exchange Case dialog

From a delivered order item → "Create exchange". Form: type, old condition, replacement product/variant/qty, exchange charge collected, replacement delivery cost, optional replacement_order_id. Insert `erp_exchange_cases`.

### C3. Product Expense Allocation dialog

From `/erp/finance/simple` expense form → optional "Allocate to product(s)" toggle. Adds rows in `erp_product_expense_allocations` with split %. Expense type dropdown: video_production, photography, influencer, model, content_creator, studio, packaging, other.

### C4. Meta Ad → Product link UI

Extend existing campaign detail page (already at `erp.marketing.campaigns.$campaignId.tsx`) with adset/ad-level product link (uses new `erp_ad_product_links`). Reuses existing `campaign-product-mapping.tsx` component pattern.

---

## Technical notes

- **All RPC**: `SECURITY DEFINER`, `has_role` gate (admin / operations / customer_service for read; admin/operations only for write).
- **Idempotency**: confirm/deliver triggers use `WHERE col IS NULL` guards.
- **No mock data**: every empty section hides; warnings explain what to fill.
- **Performance**: report RPC adds `WHERE brand_id = ... AND product_id = ...` early in every CTE; expected single-product query < 200ms even with 100k orders.

---

## Build order suggestion


| Step | Phase | Why first                                                                       |
| ---- | ----- | ------------------------------------------------------------------------------- |
| 1    | A1+A2 | Schema must exist before RPC.                                                   |
| 2    | A3+A4 | RPC needed before UI can show anything.                                         |
| 3    | B1    | Main report page (read-only — works with whatever data exists, shows warnings). |
| 4    | C1+C2 | Return/exchange capture — unlocks loss numbers.                                 |
| 5    | C3+C4 | Marketing/ad attribution — unlocks net profit.                                  |
| 6    | B2+B3 | Product-page entry + CSV polish.                                                |


---

## Approval question

**Eta huge — 1 shot e shob phase build korle ~15-20 files + 4-5 migration + 1 boro RPC. Tomar memory bole "Quality > speed".**

Bolo kivabe egobo:

- **Option 1 (recommended):** Phase A (schema + RPC) first → review → tarpor Phase B (UI) → review → tarpor Phase C (case dialogs + linking).
- **Option 2:** All-in-one boro shipment.
- **Option 3:** Specific phase shuru: bolo "phase A" / "phase B" etc.

Confirm korle shuru kori.  
Approved for Option 1 only: Phase A first.

Option 1. Phase A only