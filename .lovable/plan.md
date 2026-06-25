# World-Class ERP Dashboard — Plan

Goal: ekta perfect, advance, "command center" style dashboard banano — grey/dark premium KPI tiles, live website visitor, orders/revenue/profit, real-time pulse, ar deep insights. Bloomberg terminal + Linear + Vercel analytics er moto feel.

## Layout (Bento Grid, 12-col)

```text
┌─────────────────────────────────────────────────────────────┐
│ HERO STRIP — Brand • Live clock • Date range • Compare      │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────┤
│ Revenue  │ Profit   │ Orders   │ AOV      │ Conv %   │ ROAS │  ← 6 KPI tiles (grey, sparkline + delta vs prev period)
├──────────┴──────────┴──────────┼──────────┴──────────┴──────┤
│ REVENUE vs PROFIT (area, 30d)  │ LIVE VISITORS (pulse)      │
│  + cost overlay                │  • Active now: 47          │
│                                │  • Top pages list          │
│                                │  • Country dots            │
├────────────────────────────────┼────────────────────────────┤
│ ORDER FUNNEL                   │ ORDER STATUS DONUT         │
│ Visit→Cart→Checkout→Paid       │ new/confirmed/packed/...   │
├────────────────────────────────┼────────────────────────────┤
│ TOP PRODUCTS (table+thumb)     │ LOW STOCK ALERTS           │
├────────────────────────────────┼────────────────────────────┤
│ RECENT ORDERS (live feed)      │ COURIER PERFORMANCE        │
├────────────────────────────────┴────────────────────────────┤
│ MARKETING ROAS BY CAMPAIGN (bar) │ CASHFLOW MINI (in/out)   │
└──────────────────────────────────────────────────────────────┘
```

## KPI Tiles (top row — 6 tiles)

Each tile: uppercase tracked label, hero number (Sora 32px), delta chip (▲ green / ▼ red vs previous period), 40px sparkline at bottom. Grey surface (`--surface-1`), hairline border, hover lift.

1. **Revenue** — sum of paid orders
2. **Net Profit** — revenue − COGS − courier fee − ad spend
3. **Orders** — confirmed + paid count
4. **AOV** — revenue / orders
5. **Conversion %** — paid orders / sessions
6. **ROAS** — revenue / ad spend

## Live Section (real-time)

- **Live visitors** — Supabase realtime on `active_sessions` table, pulse animation, top 5 active pages, country flags
- **Live order feed** — realtime on `orders` insert, slide-in cards last 10
- **Today's pulse** — orders today vs same hour yesterday (mini bar)

## Charts (Recharts)

- Revenue vs Profit area chart, 7/30/90d toggle
- Order status donut
- Funnel (Visit → Cart → Checkout → Paid) with drop-off %
- ROAS by campaign horizontal bar
- Cashflow mini sparkline (in/out)

## Tables

- **Top products** — thumbnail, name, units sold, revenue, margin %
- **Low stock alerts** — product, current, reorder point, days-of-cover
- **Recent orders** — id, customer, total, status pill, timestamp
- **Courier performance** — courier, delivered %, avg days, returns %

## Filters / Controls

- Date range picker (advanced — presets + custom, already exists)
- Compare to: previous period / last year / none
- Brand-scoped (header brand picker)
- Auto-refresh toggle (30s)

## Data Sources


| Section               | Table/Query                                                   |
| --------------------- | ------------------------------------------------------------- |
| Revenue/Profit/Orders | `orders` (status in paid, delivered) + `order_items` for COGS |
| Ad spend              | `mkt_insights_daily`                                          |
| Live visitors         | `active_sessions` (realtime)                                  |
| Funnel                | `analytics_events` + `orders`                                 |
| Stock                 | `products` low_stock view                                     |
| Courier               | `courier_shipments`                                           |
| Cashflow              | `erp_transactions`                                            |


## Tech Approach

- One `useDashboardData(dateRange, brandId, compare)` hook — parallel server functions, returns all KPIs + chart series
- Realtime: separate `useLiveVisitors()` + `useLiveOrders()` hooks with Supabase channels (cleanup in useEffect)
- Skeleton loaders per tile (no blocking)
- Admin-only — staff dashboard already separate

## Design Tokens

- Surface: `--surface-1` (graphite), `--surface-2` (slate)
- Accent: existing primary; positive = emerald, negative = rose
- Font: Sora display, Manrope body (already set)
- Spacing: gap-3 grid, p-5 tiles, rounded-2xl
- Subtle gradient sweep on hero, hairline 1px borders, no heavy shadows

## Build Order

1. Data layer — `dashboard.functions.ts` with `getDashboardMetrics`, `getRevenueProfitSeries`, `getFunnel`, `getTopProducts`, `getCourierPerf`
2. Realtime hooks — `useLiveVisitors`, `useLiveOrders`
3. KPI tile component (sparkline + delta)
4. Bento layout in `erp.index.tsx` (admin branch)
5. Charts + tables
6. Polish — animations, skeletons, empty states

## Out of Scope (for now)

- Custom dashboard builder / drag-rearrange
- Saved views per user
- Export to PDF  
Must Add Advanced Blocks
  **1. Profit Quality Score**
  - Revenue high but profit low kina
  - Return loss + ad cost + courier loss include
  - Green / Yellow / Red score
  **2. Brand Health**
  - HobbyShop vs Toyora
  - Revenue, profit, return rate, stock value, ad spend
  - Which brand growing faster
  **3. Cash Risk Alert**
  - Courier theke koto COD pending
  - Supplier payment due
  - Salary/expense upcoming
  - Available cash runway
  **4. Product Danger Zone**
  - High sale but low stock
  - High order but high return
  - High ad spend but low profit
  - Slow moving dead stock
  **5. Operator Performance**
  - Staff-wise confirmed orders
  - Cancel rate
  - Follow-up pending
  - Average response time
  **6. Area Intelligence**
  - Top cities/areas
  - High return area
  - High delivery success area
  - Courier-wise area performance
  **7. Today Command Panel**  
  Right side e ekta action list:
  ```

  ```
  ```
  Need Confirmation: 42
  Need Packing: 18
  Low Stock: 9
  Courier Issue: 6
  Payment Pending: ৳48,500
  Losing Campaigns: 3
  ```
  ### KPI Tile e aro add kora jay
  Top 6 thik ase, but hidden expandable KPI rakhba:
  -   
  Gross Profit  

  -   
  Product Cost  

  -   
  Courier Cost  

  -   
  Packaging Cost  

  -   
  Return Loss  

  -   
  Paid Return Loss  

  -   
  Net Margin %  

  -   
  COD Pending  

  -   
  Stock Value  

  -   
  Daily Burn  

  ### Dashboard Logic Best Hobe
  **Default view:** All Brands  
    
  **Filter:** HobbyShop / Toyora / Date / Courier / Campaign / Product
  ### Most Important Formula
  ```

  ```
  ```
  Net Profit =
  Delivered Revenue
  - Product Cost
  - Courier Cost
  - Packaging Cost
  - Ad Spend
  - Return Loss
  - Refund / Damage / Exchange Loss
  ```
  ### Final Recommendation
  Dashboard ke just “beautiful analytics” banio na. Eta banaba **decision dashboard**:
  ```

  ```
  ```
  What happened?
  Why happened?
  Where money stuck?
  Which product/campaign/courier is losing money?
  What should I do today?
  ```