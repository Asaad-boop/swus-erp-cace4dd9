# Dashboard Rebuild Plan — SWUS ERP

Boro scope, tai age plan confirm kori. Ei kaj `src/routes/_authenticated/erp.index.tsx` + `src/components/erp/dashboard-command-center.tsx` (partial delete) + notun widget files er upor porbe. Layout grid + color scheme same thakbe.

## Step 1 — Remove (dashboard theke shorai)
- `LiveVisitors` render + import (component file rakhbo, just dashboard e use korbo na)
- `AttendancePunchCard` render + import
- `TodayCommandPanel` render + import (Today's Actions block)
- `ProductDangerZone` render (conditional re-add possible later, tobe ekhon dashboard theke fele debo)
- KPI strip theke kono "Losing Days" nei — check kore confirm korbo, thakle shorabo
- "Created vs Confirmed" chart — `TrendChart` er moddhe khujbo, thakle shorabo
- `ProfitQuality` (Net Margin Score) → notun `NetProfit` widget diye replace

## Step 2 — Fix (existing widgets)
Single source of truth helper banabo `src/lib/erp/dashboard-metrics.ts`:
- `activeOrdersFilter` = `.not("status","in","(cancelled,returned)")`
- `codPendingFilter` = `payment_method='cod'` + `payment_status!='paid'` + status in shipped/in_transit/delivered/partial_delivered
- `revenueQuery(brandIds, range)` → same query top KPI + BrandComparison duitai use korbe
- `codPendingQuery(brandIds, range)` → top KPI + `CodOutstandingCard` duitai use
- `lowStockQuery(brandIds)` → `products` theke `available_stock <= low_stock_threshold OR stock=0`, `low_stock_alerts` bad
- `TopProducts` / `TopCustomers` — active status filter align korbo, empty hole "no sales in this range" show korbe
- "Orders by Day" chart — recharts fill CSS variable/hsl issue fix (indigo hex, already partially fixed — verify)
- Pipeline counts — current status snapshot, sum ≤ total orders confirm

## Step 3 — Real Net Profit widget (replaces ProfitQuality)
Notun file `src/components/erp/dashboard/net-profit-card.tsx`:
- Revenue = orders.total (active)
- Product Cost = Σ `order_items.cost_price × quantity` (fallback `unit_cost_snapshot`)
- Courier Cost = Σ `order_items.courier_cost_allocated`, fallback `orders.actual_shipping_cost`
- Packaging = Σ `order_items.packaging_cost_allocated`
- Ad Spend = Σ `mkt_insights_daily.spend_bdt_fifo`, fallback `spend × usd_to_bdt_rate`
- Return/Exchange loss = Σ `erp_return_cases.product_cost_loss` + `erp_exchange_cases.product_cost_loss`
- Ekta boro net number + collapsible breakdown; kono component er data missing hole oi line "no data" dekhabe (silent 0 na)

## Step 4 — Must-have widgets (above the fold, priority order)
Notun files under `src/components/erp/dashboard/`:

1. `cash-position-card.tsx` — `erp_accounts.current_balance` grouped by `wallet_type` (cash/bank/mfs) + total on top
2. `cod-remittance-pipeline.tsx` — `erp_cod_remittances` + `courier_shipments`: pending / received / reconciled × courier. Table empty hole "not yet tracked" + CTA
3. `roas-comparison-card.tsx` — Meta ROAS (`meta_purchase_value/spend`) vs Real ROAS (`mkt_order_attributions` join `orders` where paid/delivered ÷ `spend_bdt_fifo`); gap % highlight
4. `ad-wallet-balance-card.tsx` — `meta_fifo_lots.usd_remaining` per ad account, USD + BDT; `< $50` warning
5. `stuck-orders-alert.tsx` — status in (on_hold, advance_payment_pending, confirmed) AND `updated_at < now()-24h`, sorted longest first
6. `return-rate-by-product.tsx` — `erp_return_cases` + `erp_exchange_cases` grouped by product_id, ranked
7. `courier-performance-card.tsx` — Pathao vs Steadfast: delivery success %, avg delivery time (`shipped_at → delivered_at`), COD fee % from `erp_reconciliation_rows`

## Step 5 — Good-to-have widgets (below must-haves)
8. Trend chart axis fix (dual y-axis: revenue + orders)
9. `order-source-donut.tsx` — `orders.source` grouped
10. Brand Comparison — Step 2 er fix reuse
11. `new-vs-returning-card.tsx` — using existing customer aggregation
12. `abandoned-cart-recovery.tsx` — `abandoned_carts` where `followup_status='pending'`, count + subtotal sum + CTA

## Layout (final order in `erp.index.tsx`)
```text
Header (greeting + refresh + date range)
─────────────────────────────────
KPI Strip (Step 2 fixed)
─────────────────────────────────
[ NetProfit ] [ CashPosition ]                  ← Step 3 + 4.1
[ CodRemittance ] [ RoasComparison ]            ← 4.2 + 4.3
[ AdWallet ] [ StuckOrders ]                    ← 4.4 + 4.5
[ CourierPerformance ] [ ReturnRateByProduct ]  ← 4.7 + 4.6
─────────────────────────────────
Trend chart (fixed dual-axis)                   ← 5.8
[ OrderSourceDonut ] [ NewVsReturning ]         ← 5.9 + 5.11
BrandComparison (if isAllBrands)                ← 5.10
─────────────────────────────────
Existing supporting: Courier / COD Outstanding / Returns / Imports cards
FinanceSection
InventoryHealth + LowStockList
MarketingCard
TopProducts + TopCustomers
AbandonedCartRecovery                           ← 5.12
NeedsAttention
LiveOrdersFeed
SystemFooter
```

## Technical notes
- Sob widget e strict empty-state: `data === null/empty` → "No data yet" / "Not tracked", never `0` silent
- Sob query `applyBrandScope` diye brand filter
- Reusable metric helpers `src/lib/erp/dashboard-metrics.ts` e — top KPI + BrandComparison + CodOutstanding same helper call korbe
- `date-range-picker` current advanced variant reuse
- Removed components (`LiveVisitors`, `TodayCommandPanel`, `ProductDangerZone`, `ProfitQuality`) file gulo delete korbo na — just dashboard theke unmount, future re-use er jonno rakhbo

## Verification (before done)
- Same date range e Revenue / COD / Order count number top KPI, BrandComparison, CodOutstanding, NetProfit sob jaigai match korbe (console e log kore verify)
- Playwright diye `/erp` er screenshot niye layout + numbers cross-check
- Empty tables (jodi `erp_cod_remittances` blank thake) → "not tracked" show hocche kina verify

Confirm korle implement start korbo. Kono widget priority swap ba drop korte chaile bolo.
