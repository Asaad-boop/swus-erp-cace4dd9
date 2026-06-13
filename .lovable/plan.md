
# Multi-Brand ERP — Build Plan

আপনার existing Hobby Shop Supabase database-এর উপর ERP build হবে। Existing tables (orders, products, courier_shipments, user_roles, profiles ইত্যাদি) **touch করা হবে না** — শুধু `brand_id` column add করা হবে multi-brand support-এর জন্য। ERP-specific নতুন tables আলাদা ভাবে add হবে।

---

## Architecture Principles

- **Stack:** TanStack Start + existing Supabase (project ref: `bgsspipkjeuceftuatue`)
- **Auth:** existing Supabase Auth + `user_roles` table (already exists with `has_role()` function)
- **Server logic:** `createServerFn` (TanStack server functions), NOT new Edge Functions
- **Brand isolation:** every queryable table gets `brand_id`; RLS + UI filters scope by selected brand
- **Modular routes:** `/_authenticated/erp/<module>` — each module self-contained
- **Role-based access:** Admin / Manager / Operator / Accountant via existing `app_role` enum + `staff_permissions`

---

## Phase 0 — Foundation (this turn)

**Database migration:**
1. New table `brands` (id, name, slug, logo_url, is_active, settings jsonb)
2. Seed Hobby Shop + Playora
3. Add `brand_id uuid` (nullable, default = Hobby Shop) to: `orders`, `products`, `categories`, `courier_shipments`, `coupons`, `stock_movements`, `low_stock_alerts`
4. Extend `app_role` enum: add `manager`, `operator`, `accountant` (already has `admin`, `customer_service`, `operations`)
5. New table `erp_transactions` — financial ledger (id, brand_id, type [income/expense/transfer], category, amount, payment_method [cash/bank/bkash/nagad], reference_type, reference_id, description, created_by, transaction_date)
6. New table `erp_accounts` — cash/bank/bkash/nagad balances per brand
7. New table `erp_expense_categories`
8. New table `erp_suppliers` (id, brand_id, name, phone, address, notes)
9. New table `erp_supplier_payments`
10. New table `erp_settings` — brand-scoped ERP config
11. RLS policies on all new tables: role-based via `has_role()`
12. GRANTs for authenticated + service_role

**App shell:**
- Auth route + login (using existing Supabase Auth)
- `_authenticated/erp/` layout with sidebar nav, brand switcher (top-right dropdown)
- React Context for active brand → persisted to localStorage
- Replace placeholder index → redirect to `/erp` if logged in, else `/auth`
- shadcn-based clean dashboard shell (Tailwind, semantic tokens, dark mode ready)

---

## Phase 1 — Dashboard + Orders (next turn)

- **Dashboard:** KPI cards (Today/Pending/Confirmed/Delivered/Cancelled orders, Revenue, Expense, Profit, Cash/Bank/bKash balances, Low Stock count, Courier status pie, Brand-wise performance bar), Recent Activities feed
- **Orders → Website Orders:** TanStack Table — search, advanced filters (status, brand, date range, courier, payment), bulk actions (status update, assign staff, courier book), inline status update, drawer with full order detail + timeline (uses existing `order_status_history` + `activity_log`), print invoice, CSV export
- **Orders → Create Manual Order:** multi-step form — customer search/create, product search with SKU + stock check, qty/price/discount, delivery charge per zone (uses `bd_zones`/`bd_cities`/`bd_areas`), advance payment, courier select, notes → writes to existing `orders` + `order_items`

---

## Phase 2 — Inventory

- Product list (brand-scoped), variants (uses existing `product_variants`)
- Stock In / Stock Out forms → writes to existing `stock_movements`
- Low stock alerts page (existing `low_stock_alerts`)
- Supplier management + purchase price tracking
- Inventory history per SKU

---

## Phase 3 — Financial Accounting

- Account balances dashboard per brand (cash/bank/bkash/nagad)
- Income & Expense entry forms → `erp_transactions`
- Daily transactions list + filters
- Profit/Loss report (revenue from delivered orders − expenses − courier charges − supplier payments)
- Brand-wise financial reports + CSV export
- Manual balance adjustments
- Supplier payment tracking

---

## Phase 4 — Courier Integration

- Pathao API client (server function, uses existing `PATHAO_*` secrets)
- Auto-fetch & cache access token
- Book consignment from order detail / bulk action → updates `courier_shipments`
- Tracking status sync (cron-style server function, manual refresh button)
- Delivery/return status → auto-update order status via existing `transition_order_status()`
- Courier charge tracking → auto-entry to `erp_transactions`
- Steadfast + RedX scaffolded but disabled until later

---

## Technical Notes (for reference)

- **File layout:** `src/routes/_authenticated/erp/{dashboard,orders,inventory,finance,courier,settings}/*`
- **Server fns:** `src/lib/erp/{orders,inventory,finance,courier,pathao}.functions.ts` + matching `.server.ts` helpers
- **Brand context:** `src/contexts/brand-context.tsx` — selected brand id flows through all queries
- **Permissions:** `usePermission('orders.update')` hook → checks `has_role` + `staff_permissions`
- **Realtime:** subscribe to `orders` table for live dashboard updates
- **Existing functions reused:** `transition_order_status`, `acquire_order_lock`, `add_order_note`, `reserve_stock`, `release_stock`, `has_role`, `has_permission`

---

## এই Plan Approve করলে — আমি শুরু করব Phase 0:
1. একটা single migration যা সব schema changes করবে (brands, brand_id columns, ERP tables, RLS, grants)
2. ERP app shell (login, layout, sidebar, brand switcher, dashboard placeholder)
3. Phase 1 (Dashboard + Orders) পরের turn-এ — সেটা একাই বড় build

**আপনি approve করুন বা যেকোনো module-এ change বলুন** (যেমন: "Playora seed কোরো না এখন", "Manager role বাদ দাও", "phase order change কোরো")।
