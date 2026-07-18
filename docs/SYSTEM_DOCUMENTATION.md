# SWUS ERP — System Documentation

> Handoff document for a new senior engineer. Last updated: 2026-07-18.
> Source of truth: this repo + Supabase project `bgsspipkjeuceftuatue`.

---

## 1. System Overview

### What it is
SWUS ERP is a multi-brand, single-tenant-database ERP for a Bangladeshi e-commerce operation. It runs the entire order-to-cash lifecycle: intake (web + manual), fulfilment (packing / dispatch / courier), reconciliation (COD / returns / exchanges), finance (double-entry ledger), inventory (WAC costing), imports (China → BD landed cost), marketing (Meta Ads / attribution / P&L), HRM and CRM.

### Architecture
- **Frontend**: React 19 + TanStack Start v1 (SSR + file-based routing under `src/routes/`), TanStack Query for data, TanStack Router for navigation, Tailwind v4 + shadcn/ui.
- **Backend**: Supabase Postgres (project ref `bgsspipkjeuceftuatue`). All business logic lives in Postgres functions/RPCs (SECURITY DEFINER where privileged). App-internal server logic uses `createServerFn` from `@tanstack/react-start`. Webhooks / cron / public APIs use file-based server routes under `src/routes/api/public/*`.
- **Deployment**: Vercel (`vercel.json`, preset `vercel`). Published Lovable URL: `https://swus-erp.lovable.app`. Stable per-project URL: `https://project--ed6f058b-a815-45d2-bb71-e1fc12a02390.lovable.app` (used by pg_cron).
- **Auth**: Supabase Auth. Protected routes live under `src/routes/_authenticated/`. Sign-in at `/auth`. Root redirect (`/`) → `/erp` if signed-in else `/auth`.

### Users / Roles (enum `app_role`)
`admin`, `moderator`, `customer`, `customer_service`, `operations`, `packer`, `accountant`, `marketing_manager`, `warehouse_staff`, `cargo_agent`, `hr_admin`, `hr_manager`, `employee`.

Stored in `user_roles(user_id, role)`. **Never** on `profiles`. Checked via SECURITY DEFINER function `has_role(_user_id, _role)`. HR module wraps this in `useHrAccess()` (`src/lib/erp/hr/role-gate.ts`).

### Multi-brand tenancy
Two active brands: **HobbyShop** (`1f1f366d-ad85-4513-85ab-2dbb6b23c513`) and **Toyora** (`40abf6fa-404e-4c3f-b0df-f35c1535e95d`).

Access control:
- `brands` table lists tenants.
- `user_brand_access(user_id, brand_id)` maps non-admin staff to specific brands.
- Admins see all brands automatically.
- Client-side brand selection lives in `src/contexts/brand-context.tsx` (`useBrand()`), a global brand switcher (`src/components/erp/brand-switcher.tsx`), and a gate (`brand-picker-gate.tsx`).
- Every brand-scoped table has a `brand_id` column; RLS + explicit filters enforce isolation.
- Server functions for grant/revoke: `listUserBrandAccess`, `setUserBrandAccess` in `src/lib/erp/settings/user-brand-access.functions.ts` (admin-only).

---

## 2. Database Schema

> ~140 tables. Grouped by module below. All tables are in `public`. Every table has `id uuid PK`, `created_at`, and (usually) `updated_at` with an update trigger. Only domain-specific columns listed.

### 2.1 Auth / Roles / Tenancy
| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | User profile (name, phone, avatar) — **NEVER** stores roles. | user_id, full_name, phone, avatar_url |
| `user_roles` | Role assignments. Unique(user_id, role). | user_id, role (`app_role` enum) |
| `staff_permissions` | Page-level permission overrides per user. | user_id, page_key, allowed |
| `user_brand_access` | Non-admin brand membership. | user_id, brand_id |
| `brands` | Tenants. | name, slug, logo_url, settings |
| `warehouses` | Physical stock locations (auto-created per brand). | brand_id, name, is_default |
| `admin_audit_log` | Sensitive admin action log. | actor_id, action, target, before/after |
| `activity_log` / `activity_logs` | General staff activity feed. | user_id, action, entity, meta |
| `active_sessions` | Live presence / typing indicators. | user_id, brand_id, route, last_seen |
| `app_settings` | Global key/value config (admin-only). | key, value (jsonb) |

**RLS (plain English):**
- `user_roles`: authenticated read-own; admin writes.
- `brands`: staff read; admin ALL.
- `admin_audit_log`: admin only.
- `user_brand_access`: admin only.

### 2.2 Orders / Fulfilment
| Table | Purpose |
|---|---|
| `orders` (116 cols) | Root order. Every intake source lands here. |
| `order_items` | Line items. Combos are expanded into their children at insert time via `expand_combo_items` trigger. |
| `order_status_history` | Immutable audit of every status transition (`from_status`, `to_status`, `reason`, `changed_by`). Cron-driven transitions insert with `changed_by = NULL`, `reason = 'courier_sync'`. |
| `order_notes` | Threaded internal / customer-visible notes. |
| `order_locks` | Optimistic concurrency lock so two staff don't edit the same order. |
| `coupons` / `coupon_usage` | Discount codes; `trg_coupon_usage_increment` bumps count. |
| `abandoned_carts` / `abandoned_cart_messages` | Cart recovery flow. |
| `analytics_events` | Web funnel events. |
| `addresses` | Customer saved addresses. |
| `bd_cities` / `bd_zones` / `bd_areas` | BD geo lookup (public read). |

**Order status pipeline (enum `order_status`, 27 values)** — see §5.4.

**Confirmation status (`confirmation_status`)**: `pending, confirmed, rejected, fake, on_hold, advance_pending`.
**Payment status (`payment_status`)**: `unpaid, partial, paid, refunded`. Lives on `orders.payment_status` — decoupled from fulfilment status (post-2026-07-12 migration).
**Order priority / source / call_status**: additional enums; see enum table.

**RLS:** orders/order_items — brand-scoped, staff read+write, admin delete. Guest/anon insert allowed for website orders (constrained inserts).

### 2.3 Inventory
| Table | Purpose |
|---|---|
| `products` | Master SKU. `description` is nullable (constraint removed). `cost_price`, `weighted_avg_cost`, `on_hand`, `reorder_point`. |
| `product_variants` | Colour/size variants. Own `weighted_avg_cost`, `stock_qty`, `sku`. |
| `product_variant_values` / `product_option_types` / `product_option_values` | Option definitions. |
| `product_combo_items` | Bundle → child map. `expand_combo_items` trigger explodes at order-insert. |
| `product_brand_listings` | Per-brand price / visibility / listing. |
| `categories`, `brands` (product brand tag) | Catalogue tree. |
| `stock_movements` | Ledger of every stock in/out. Powers WAC. Written by `adjust_stock_v2` RPC only. |
| `stocktake_sessions` / `stocktake_items` | Physical count workflow. |
| `low_stock_alerts` | Auto-generated when on_hand ≤ reorder_point. |
| `reorder_suggestions` | Populated by daily `check_reorder_triggers_all_brands()` cron. |

**RLS:** staff read+write, admin delete.

### 2.4 Purchase Orders / Imports (China → BD)
| Table | Purpose |
|---|---|
| `imp_purchase_orders` (36 cols) | China PO. FX rate locked per PO. Enum `imp_po_status`. |
| `imp_po_items` | PO lines with per-unit USD cost. |
| `imp_po_sequences` | Per-brand PO number counter. |
| `imp_cartons` / `imp_carton_items` | Physical cartons; carton state (`imp_carton_status`) tracks China → in_transit → arrived → in_stock. |
| `imp_cargo_agents` / `imp_cargo_bills` / `imp_cargo_ledger` | Freight forwarder ledger, per-shipment bills, credit/debit ledger. |
| `imp_payments` | Supplier / carton / shipping payments; enum `imp_payment_type`. |
| `imp_status_history` | PO/carton status audit. |
| `local_purchase_orders` / `local_po_items` / `local_po_receipts` / `local_po_receipt_items` | BD-local supplier POs. |

**RLS:** brand-scoped staff. Cargo-agent role has scoped access to their own bills.

### 2.5 Finance (double-entry)
| Table | Purpose |
|---|---|
| `erp_chart_accounts` | Chart of Accounts. Hierarchical (`parent_id`), `normal_balance` DR/CR, `is_cogs_category` flag drives P&L exclusions. |
| `erp_accounts` | Cash / bank / MFS wallets. `wallet_type` distinguishes COD Cash vs bKash Advance etc. |
| `erp_journal_entries` + `erp_journal_lines` | Immutable double-entry journal. Balanced check enforced. |
| `erp_transactions` | Ledger view / simplified P&L rows (revenue, expense, transfer). Every row has `reference_type` (e.g. `order_delivery`, `meta_ad_spend_daily`, `imp_payment`, `cod_remittance`). |
| `erp_ar_payments` | Customer AR. |
| `erp_bills` | Supplier bills (AP). |
| `erp_suppliers` | Vendor master. |
| `erp_budgets` | Budget rows per category / month. |
| `erp_expense_categories` | Expense taxonomy. `excluded_from_pnl` and `is_cogs_category` control reporting. |
| `erp_tax_rates` / `erp_tax_entries` | Tax handling. |
| `erp_fx_rates` | Daily USD→BDT reference rate (locked per PO at creation). |
| `erp_cod_remittances` | Legacy invoice-based COD reconciliation (see §5.5). |
| `erp_courier_settings` | Per-courier fee schedule. |
| `erp_courier_settlement_lines` | New COD Settlement system — line-level from courier statements. |
| `erp_reconciliation_runs` / `erp_reconciliation_rows` | Bulk reconciliation batches. |
| `erp_recurring_rules` / `erp_recurring_runs` | Recurring bill / expense scheduler. |
| `erp_finance_attachments` / `erp_finance_audit` | Attachments + audit trail. |
| `erp_settings` | Finance module settings. |
| `erp_exchange_cases` / `erp_return_cases` / `erp_return_timeline` | Return/exchange finance state (linked to Returns module). |
| `erp_product_expense_allocations` | Per-product expense allocation. |

**RLS:** finance staff (accountant / admin / operations) read+write; brand-scoped. Journal entries immutable once posted.

### 2.6 Marketing
| Table | Purpose |
|---|---|
| `mkt_ad_accounts` | Meta Ad Account per brand. `auto_post_to_finance` flag (defaults `false` after the double-post bug). |
| `mkt_ad_account_brands` | Multi-brand link. |
| `mkt_campaigns` / `mkt_adsets` / `mkt_ads` | Meta structure mirror. |
| `mkt_insights_daily` (27 cols) | Daily per-ad insights. UTC-dated at source; converted to Dhaka in canonical RPCs. |
| `mkt_campaign_products` | Manual "this campaign promotes this SKU" links. |
| `mkt_order_attributions` | Attribution result per order. |
| `mkt_attribution_candidates` | Pre-match candidates. |
| `mkt_tracking_events` | Pixel + custom tracker events (from `mkt.track` endpoint). |
| `mkt_manual_expenses` | Non-Meta marketing costs (influencer / photoshoot etc). Enum `mkt_expense_category`. |
| `mkt_sync_log` | Every sync run (structure / insights / attribution / finance_post). |
| `meta_dollar_purchases` | USD purchases funding the ad wallet. Rate locked at purchase. |
| `meta_fifo_lots` | FIFO lots for USD → BDT conversion. |
| `meta_spend_consumptions` | Which FIFO lot funded which spend row. `insight_id` FK is `ON DELETE SET NULL` (post-dup-fix). |
| `meta_ad_wallet_ledger` | Ledger view of wallet balance. Unique `source_spend_ref` (post-dup-fix). |
| `meta_capi_log` | CAPI purchase event send log. |
| `meta_tracking_config` | Per-brand Pixel ID / access token / test event code. |

**RLS:** marketing_manager / admin write; staff read. `_mkt_require_staff()` guard used in some server functions.

### 2.7 CRM
| Table | Purpose |
|---|---|
| `crm_customer_meta` | Enriched customer record (RFM, churn, custom fields). Keyed by `customer_key` (phone normalised). Refreshed by `crm_customers_mv` MV. |
| `crm_customer_notes` / `crm_customer_tags` | Notes and tags. |
| `crm_activities` | Touchpoint log (call, SMS, email). |
| `crm_tasks` | Follow-up tasks. |
| `crm_custom_field_definitions` | Per-brand custom field schema. |
| `crm_saved_filters` | Saved segment filters. |
| `crm_imported_customers` | Bulk import staging. |

**RLS:** admin only (broad — will need per-role tightening).

### 2.8 Returns / Exchanges
| Table | Purpose |
|---|---|
| `erp_return_cases` (34 cols) | Return workflow: request → picked → received → refunded. `assign_return_case_number` trigger auto-numbers. |
| `erp_exchange_cases` (33 cols) | Exchange workflow with old + new SKU. `assign_exchange_case_number` trigger. |
| `erp_return_timeline` | Status history for both. |

**RLS:** staff ALL.

### 2.9 Courier
| Table | Purpose |
|---|---|
| `courier_shipments` | One row per booking with Pathao/Steadfast. `raw` (jsonb) is last API response. `updated_at` bumped every cron sync (even on `raw=null`, post queue-starvation fix). |
| `courier_credentials` | Per-brand courier API creds (**admin-only**, never exposed to frontend). |
| `courier_history_cache` | Cached tracking events. |
| Status mapping | Not a table — `src/lib/erp/courier-status-mapping.ts` (`DEFAULT_PATHAO_MAP`, `DEFAULT_STEADFAST_MAP`). |

**Trigger `trg_sync_order_status_from_courier`** on `courier_shipments`: mirrors mapped status to `orders.status` AND writes to `order_status_history` with `reason='courier_sync'`, `changed_by=NULL`.

### 2.10 HRM
| Table | Purpose |
|---|---|
| `hr_employees` (50 cols) | Employee master (banking, salary, brand_ids array). |
| `hr_departments` / `hr_designations` | Org structure. |
| `hr_employment_history` | Job change history. |
| `hr_attendance` (31 cols) | Daily check-in/out, GPS, selfie, OT, late. |
| `hr_shifts` / `hr_employee_shifts` | Shift definitions + roster. |
| `hr_leave_types` / `hr_leave_requests` / `hr_leave_balances` / `hr_holidays` | Leave workflow. |
| `hr_payroll_runs` / `hr_payslips` | Monthly payroll. |
| `hr_documents` | Employee documents (NID scan etc). |
| `hr_settings` | Per-brand HR config. |

**RLS:** helpers in `useHrAccess()`. Salary/payroll: admin + hr_admin + operations. Attendance-mark: warehouse_staff also.

### 2.11 Dashboard / misc
| Table | Purpose |
|---|---|
| `homepage_versions` | Storefront homepage versions. |
| `site_settings` | Storefront-wide config. |
| `reviews` | Product reviews. |
| `_backup_*` | Point-in-time backup snapshots from big migrations (do not query in app code). |

---

## 3. Database Functions & Triggers

> Full function list is queryable: `SELECT proname, pg_get_function_identity_arguments(oid), prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname;`. Highlights below — **all are SECURITY DEFINER unless noted**, because they cross RLS boundaries.

### 3.1 Orders / Fulfilment
- `assign_order_invoice_no()` — trigger; assigns `invoice_no` on insert.
- `expand_combo_items()` — trigger on `order_items` insert; if line is a combo product, inserts child rows and marks parent.
- `acquire_order_lock(order_id, force)` — pessimistic edit lock.
- `add_order_note(order_id, body, is_internal)` — appends to `order_notes`.
- `append_order_status_log(order_id, log_field, entry)` — jsonb log append.
- `sync_order_status_from_courier()` — trigger on `courier_shipments`; maps courier status → `orders.status` **and** logs `order_status_history(reason='courier_sync', changed_by=NULL)`.
- `reserve_stock(order_id, items jsonb)` — the ONLY overload; deducts stock and writes `stock_movements`. The 1-arg overload was dropped 2026-07-15 to prevent double-decrement.
- `adjust_stock_v2(product_id, variant_id, delta, reason, note, unit_cost, source, reference_type, reference_id, idempotency_key)` — canonical stock adjust. Idempotent via key. Recomputes WAC.
- `adjust_product_stock(product_id, delta, reason, note)` — legacy wrapper.

### 3.2 Inventory / WAC
- `check_and_create_low_stock_alert()` — trigger; watches on_hand vs reorder_point.
- `check_reorder_triggers(brand_id)` / `check_reorder_triggers_all_brands()` — daily cron; populates `reorder_suggestions`.
- (WAC math lives inside `adjust_stock_v2`.)

### 3.3 Finance
- `_imp_post_journal(...)` — internal DR/CR poster used by imports RPCs.
- `create_bill(brand_id, supplier_id, bill_no, ...)` — supplier bill + AP journal.
- `cargo_advance_deposit`, `cargo_bill_create`, `cargo_manual_adjustment`, `cargo_po_payment` — cargo agent ledger + finance journal.
- `adjust_account_balance(account_id, delta, reason)` — direct wallet adjust (audited).
- `apply_settlement_variance_action(line_id, action)` — accept/waive/reject a settlement line variance.
- `fn_post_order_delivery_to_finance(order_id)` — on delivery, posts revenue + COGS + shipping. **Post-fix**: uses COD Cash wallet (not bKash Advance) for COD income.
- `erp_profit_loss(brand_id, from, to)` — P&L report. Applies `excluded_from_pnl` and `is_cogs_category` filters.
- `reconcile_courier_settlement(...)` — the ONLY authorised path to move an order into `payment_status='paid'` post-delivery.

### 3.4 Marketing (canonical)
- `mkt_delivered_line_costs(brand, from, to)` — per-line delivered rows with cost fallback chain. Dhaka TZ boundaries.
- `get_campaign_profit(brand, from, to)` — aggregated per campaign.
- `get_sku_profit(brand, from, to)` — aggregated per product.
- `get_meta_spend_bdt(brand, from, to)` — ad spend in BDT.
- `consume_meta_spend_fifo(ad_account_id, spend_ref, usd_spend, spend_date, insight_id)` — FIFO USD lot consumption + wallet ledger insert. Idempotent via unique `source_spend_ref`.
- `confirm_meta_dollar_purchase`, `cancel_meta_dollar_purchase`, `adjust_meta_dollar_purchase` — USD purchase lifecycle.
- `post_meta_ad_spend_all_brands(from, to)` — nightly Finance posting for Meta spend.

**Cost fallback chain used by `mkt_delivered_line_costs`:**
1. `order_items.unit_cost_snapshot`
2. `product_variants.weighted_avg_cost`
3. `products.weighted_avg_cost`
4. `products.cost_price`
5. NULL → `cost_missing = true` (surfaced as `cost_missing_units` badge in UI)

See `mem/features/marketing-canonical-profit.md` for the rule that all marketing surfaces MUST use these RPCs — never hand-rolled cost calc.

### 3.5 CRM
- `calculate_rfm_all_brands()` — nightly; RFM scoring per customer.
- `auto_convert_abandoned_cart()` — trigger; links cart to eventual order.
- `abandoned_carts_autotag_brand`, `set_abandoned_cart_brand` — brand inference from cart items.
- `crm_customers_mv` (materialized view) — refreshed every 6h by cron.

### 3.6 Returns / Exchanges
- `assign_return_case_number()` / `assign_exchange_case_number()` — trigger; sequential per brand.

### 3.7 Meta CAPI
- `send_meta_capi_purchase()` — trigger on `orders` status → delivered; queues to `meta_capi_log` and calls the CAPI endpoint using `meta_tracking_config` credentials.

### 3.8 Roles / Access
- `has_role(_user_id uuid, _role app_role) returns boolean` — SECURITY DEFINER. **The** canonical role check. Used in every RLS policy that needs role gating.
- `_imp_has_any_role(_user, VARIADIC _roles)` — variadic form for imports.
- `_mkt_require_staff()` — trigger guard.

### 3.9 Utility triggers (fired on many tables)
- `update_updated_at_column()` / `set_updated_at()` — bump `updated_at`.
- `brand_create_default_warehouse()` — auto-create default warehouse when a brand is inserted.
- `_active_sessions_auto_brand`, `_analytics_auto_brand` — infer `brand_id` from session/route.
- `increment_coupon_usage()` — bump `coupons.used_count`.
- `auto_flag_preorder()` — flag order as pre-order if any item is out of stock.
- `auto_link_attribution_products()` — link tracking events to matching SKUs.

---

## 4. Cron Jobs (`cron.job`)

| Job | Schedule | Purpose |
|---|---|---|
| `sync-courier-status` | `* * * * *` (every minute) | POSTs to `/api/public/cron/sync-courier` on `swus-erp.lovable.app`, limit 20 shipments. Bumps `updated_at` even on `raw=null` so queue rotates. |
| `meta-insights-auto-sync` | `*/10 * * * *` (every 10 min) | POSTs `/api/public/cron/sync-marketing`. Pulls Meta insights → `mkt_insights_daily`. |
| `sync-pathao-status-15min` | `*/15 * * * *` | Legacy Pathao sync (older project URL — candidate for removal). |
| `cleanup-integration-logs` | `0 3 * * *` | Purges `integration_logs` and `courier_stats_cache` > 30 days old. |
| `meta-ad-spend-post-daily` | `30 3 * * *` | `SELECT post_meta_ad_spend_all_brands(current_date - 5, current_date)` — nightly Finance posting for last 5 days of ad spend. |
| `run-recurring-daily` | `0 4 * * *` | POSTs `/api/public/cron.run-recurring` — recurring bills / expenses. |
| `reorder-check` | `0 6 * * *` | `check_reorder_triggers_all_brands()`. |
| `rfm-calculate` | `0 2 * * *` | `calculate_rfm_all_brands()`. |
| `refresh-crm-mv` | `0 */6 * * *` | `REFRESH MATERIALIZED VIEW CONCURRENTLY crm_customers_mv`. |

All HTTP cron jobs authenticate with the Supabase anon key in the `apikey` header (see `useful-context/schedule-jobs-modern`).

---

## 5. Business Logic Rules (critical)

### 5.1 Inventory costing — Weighted Average Cost (WAC)
- Maintained on **both** `products.weighted_avg_cost` and `product_variants.weighted_avg_cost`.
- Updated inside `adjust_stock_v2` **only on positive deltas** (stock in) using:
  `new_wac = (old_qty * old_wac + delta * unit_cost) / (old_qty + delta)`.
- Negative deltas (sales / adjust-out) use the current WAC as `unit_cost_snapshot` on the `order_items` row (immutable per line — this is the cost source used by all P&L / Marketing profit reports).
- Cost fallback chain is defined in §3.4.
- **Never reference `order_items.cost_price` — the column does not exist**; use `unit_cost_snapshot`.

### 5.2 Accounting — double-entry
- Chart of Accounts (`erp_chart_accounts`): hierarchical, `normal_balance` = DR or CR.
- Every financial event writes a balanced `erp_journal_entries` with 2+ `erp_journal_lines` (sum(debit) = sum(credit)).
- `erp_transactions` is a denormalised P&L view (one row per real-world event) used for reports; it references its journal entry via `reference_type` + `reference_id`.
- P&L exclusions: `erp_expense_categories.excluded_from_pnl = true` (owner draws, transfers) OR `is_cogs_category = true` (COGS categories are counted in COGS bucket, not opex).
- Wallet types (`erp_accounts.wallet_type`): `cod_cash`, `bkash_advance`, `bank`, `ad_wallet_usd`, etc. **COD income posts to `cod_cash`** (fixed 2026-07-16; previously mis-posted to `bkash_advance`).

### 5.3 FX rate locking — China imports
- `imp_purchase_orders.fx_rate_bdt_per_usd` is captured at PO creation.
- All landed-cost math in the imports module uses that locked rate — daily rate changes in `erp_fx_rates` do NOT retro-adjust in-flight POs.
- Carton-level landed cost = (goods_cost_usd × PO_fx) + shipping_bdt + customs_bdt + agent_fees_bdt, allocated per unit by weight/qty.
- USD ad-wallet purchases (`meta_dollar_purchases`) also lock their own rate at confirmation (see `confirm_meta_dollar_purchase`).

### 5.4 Order status flow (`order_status` — 27 values)

```
                     ┌── cancelled
                     │
  new ──► confirmed ──► ready_to_pack ──► packed ──► ready_to_ship ──► shipped ──► in_transit ──► delivered ──► completed
           │                                                                                       │
           │                                                                                       ├─► partial_delivered
           │                                                                                       ├─► pending_return ─► return_in_transit ─► returned
           │                                                                                       ├─► exchange ─► exchanged
           │                                                                                       └─► partial_return
           └─► on_hold  (also: rejected/fake via confirmation_status)
```

Also present (legacy or specific flows): `packaging`, `damaged`, `advance_payment_pending`, `incomplete`, `courier_entry`, `paid`, `paid_return`, `unpaid_return`, `fake`.

**Rules:**
- **Payment state (`orders.payment_status`) is orthogonal to fulfilment status.** Nothing except `reconcile_courier_settlement` should flip `payment_status` to `paid`. The legacy status values `paid`, `paid_return`, `unpaid_return` remain in the enum only for pre-migration history rows — do not write them from new code.
- Courier-driven transitions land via `sync_order_status_from_courier` trigger; the mapping table lives in `src/lib/erp/courier-status-mapping.ts`. Failure/loss keys map to `on_hold` (never to `ready_to_ship` — this was a fix).
- Every transition is logged in `order_status_history` (post-fix: courier-driven writes with `changed_by=NULL, reason='courier_sync'`).
- Statuses `pending_return`, `return_in_transit`, `returned`, `exchange`, `exchanged`, `partial_return` are settlement statuses too — see `isSettlementStatus()` in `src/lib/erp/orders.ts`.

### 5.5 COD Reconciliation — **BOTH systems coexist**

**Why both:** the legacy Invoice Reconciliation was tied to per-invoice files uploaded by finance. It works but doesn't scale to line-level variance analytics. The new COD Settlement system parses the raw courier statement into per-line records and drives auto-matching. Both are still active because ~6 months of history live in the legacy tables and finance staff still audit against those.

| System | Tables | Flow |
|---|---|---|
| **Legacy — Invoice Reconciliation** | `erp_cod_remittances`, `erp_reconciliation_runs`, `erp_reconciliation_rows` | Finance uploads courier remittance sheet → creates a `erp_cod_remittances` row with `expected_amount` vs `amount`, moves cash into the receiving wallet via a journal entry. UI: `erp.reconciliation.*` routes. |
| **New — COD Settlement** | `erp_courier_settlement_lines`, `erp_courier_settings` | Courier statement is parsed line-by-line into `erp_courier_settlement_lines` (per consignment: `collected_amount`, `cod_fee`, `delivery_fee`, `payout`, `variance`, `match_status`). The `reconcile_courier_settlement` RPC posts the journal entry and flips `orders.payment_status='paid'`, `orders.reconciliation_status='reconciled'`. Variance handled via `apply_settlement_variance_action`. UI: same routes, "Settlement" tab. |

`orders.reconciliation_status` values: `pending`, `reconciled`, `waived`, `needs_review` — surfaced as the `reconcileBadge()` chip on delivered orders.

### 5.6 Other derived metrics
- **Real ROAS vs ROAS**: ROAS = ad-reported revenue ÷ spend (leading indicator, uses attribution). **Real ROAS = delivered_revenue ÷ spend** (post-delivery, canonical). Marketing dashboard shows both; only Real ROAS feeds Finance.
- **RFM scoring** (`calculate_rfm_all_brands`, nightly): scores 1–5 for Recency / Frequency / Monetary, stored on `crm_customer_meta`. Churn risk derived (`churn_score`, `churn_risk` = low/med/high).
- **Return rate**: computed in-app (`returned + partial_return + pending_return`) ÷ delivered-family, per product/campaign.
- **Success rate**: delivered ÷ (delivered + returned family), used in Marketing daily view and product reports.

---

## 6. Integrations

### 6.1 Supabase
- Project ref: `bgsspipkjeuceftuatue`
- URL: `https://bgsspipkjeuceftuatue.supabase.co`
- Auth: email/password.
- Storage buckets: brand logos, product images, HR documents, courier statement uploads.
- Realtime: enabled on `orders`, `order_status_history`, `active_sessions` (used by global new-order notifier + presence).
- Client: `src/integrations/supabase/client.ts` (browser), `client.server.ts` (admin, server-only), `auth-middleware.ts` (`requireSupabaseAuth` for server functions), `auth-attacher.ts` (attaches bearer to server-fn calls via `functionMiddleware` in `src/start.ts`).

### 6.2 Vercel — Environment Variables
All values are set in the Vercel project (dev + prod) and mirrored as Supabase secrets where server functions need them.

| Name | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | client + server | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client + server | Anon/publishable key. |
| `VITE_SUPABASE_PROJECT_ID` | client | Project ref. |
| `SUPABASE_URL` | server | Same as VITE (server context). |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Admin client. **Never in client bundle.** |
| `META_APP_ID` / `META_APP_SECRET` | server | Meta OAuth. |
| `META_ACCESS_TOKEN_<BRAND>` | server | Per-brand long-lived Meta token (Pixel + Ads). |
| `META_PIXEL_ID_<BRAND>` | server | Per-brand Pixel ID (also in `meta_tracking_config`). |
| `META_CAPI_TEST_EVENT_CODE_<BRAND>` | server | Optional CAPI test-mode code. |
| `PATHAO_CLIENT_ID` / `PATHAO_CLIENT_SECRET` / `PATHAO_USERNAME` / `PATHAO_PASSWORD` | server | Pathao API. |
| `STEADFAST_API_KEY` / `STEADFAST_SECRET_KEY` | server | Steadfast API. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | server | New-order Telegram notifier (`supabase/functions/notify-order-telegram`). |
| `LOVABLE_API_KEY` | server | Lovable AI Gateway (rotated via `lovable_api_key--rotate`). |
| `NITRO_PRESET` | build | Fixed to `vercel` (in `vercel.json`). |

**Courier credentials** are additionally stored in `courier_credentials` table per brand (admin-only RLS) so brand-level overrides are possible.

### 6.3 Meta Pixel + CAPI
- **Pixel** (client-side): loaded per brand via `meta_tracking_config.pixel_id`. Tracked events: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`.
- **CAPI** (server-side): trigger `send_meta_capi_purchase` fires on `orders.status → delivered`, writes to `meta_capi_log`, and the app POSTs to Meta's `/events` endpoint with the SHA-256 hashed customer email/phone. Test mode uses `test_event_code`.
- Multi-brand: each brand has its own row in `meta_tracking_config` with `pixel_id`, `access_token`, `test_event_code`, `is_active`.

### 6.4 Couriers
- **Pathao**: OAuth2 token auth. Booking creates a row in `courier_shipments` with `provider='pathao'`, `consignment_id`. Status sync: `/api/public/cron/sync-courier` polls Pathao every minute for the 20 oldest non-terminal shipments. Response cached in `raw` jsonb.
- **Steadfast**: API key auth. Same table, `provider='steadfast'`.
- **Reconciliation flow**: courier weekly statement (CSV/XLSX) uploaded via the Reconciliation UI → parsed into `erp_courier_settlement_lines` → auto-matched by `consignment_id` to `courier_shipments.consignment_id` → `matched_order_id` populated → finance user reviews variances → `reconcile_courier_settlement` RPC posts journal and flips `orders.payment_status='paid'`.

### 6.5 Other
- **Telegram**: legacy Supabase Edge Function `notify-order-telegram` (kept because it must live at a Supabase URL for the webhook secret).
- **MCP server**: `src/routes/[.mcp]/` — Lovable MCP tools (ping only currently).
- **Public catalog API**: `/api/public/catalog/$brandSlug` — read-only product feed for storefront.
- **Tracker JS**: `/api/public/mkt.tracker.js` — 1st-party pixel served from same-domain (privacy / iOS 14+ workaround). Events land in `/api/public/mkt.track`.

---

## 7. Known Issues / Deferred Items

| Item | Why deferred |
|---|---|
| `erp_profit_loss` RPC not fully canonical | Doesn't yet share the exact exclusion filters used by the app-side P&L view — Finance vs Marketing numbers can drift. Migration planned. |
| Legacy `sync-pathao-status-15min` cron job | Points at an old project URL (`project--2c26f5f9...`). Redundant with the per-minute `sync-courier-status`. Safe to unschedule after verification. |
| Enum values `paid`, `paid_return`, `unpaid_return`, `packaging`, `damaged`, `advance_payment_pending`, `courier_entry`, `fake` in `order_status` | Kept for historical rows post-2026-07-12 migration. New code must never write them. |
| CRM RLS is admin-only across the board | Needs per-role tightening once CS/marketing_manager surfaces are finalised. |
| `mkt_ad_accounts.auto_post_to_finance = false` | Hotfix to stop the double-posting bug caused by a stale published bundle. Re-enable only after confirming the new `postMetaSpendToFinance` disabled flag is deployed and cron logs show no duplicates. |
| Meta spend cap sync for Hobby Shop | Blocked by missing `ads_management` OAuth scope on the current Meta token — needs a re-auth flow with expanded scopes. |
| `_backup_*` tables | Snapshots from big migrations. Do NOT reference from app code — they are read-only breadcrumbs for rollback. |
| Duplicate triggers `set_updated_at` / `trg_*_updated_at` / `update_*_updated_at` on some tables | Harmless (idempotent bump). Cleanup pass pending — leave for now to avoid churn. |
| CSS badge hide | The Lovable badge is CSS-hidden in `src/styles.css`. Remove if publish visibility changes. |

---

## 8. How to Deploy Changes

### TypeScript / UI changes (frontend + server functions)
1. Save the change in Lovable (autocommits).
2. **Click "Update" in the Publish dialog** to promote to the published URL (`swus-erp.lovable.app`). Without this step, the preview URL updates but the published URL — which is what pg_cron and external webhooks call — keeps serving the old bundle. This exact deployment gap caused the Meta double-posting bug (fix "shipped" 3× before it took effect).
3. Confirm by hitting the affected endpoint on `swus-erp.lovable.app` and checking `mkt_sync_log` / cron logs.

### SQL migrations
1. Use the `supabase--migration` tool. It creates the migration file, shows a diff, and applies it after the user approves.
2. **Migrations run instantly** on approval — no publish step needed. The change is live in Postgres immediately.
3. If the migration changes types (new columns, enum values), `src/integrations/supabase/types.ts` is regenerated automatically after apply. Frontend code that consumes new fields still needs step 1 (Update) to reach the published URL.
4. Every `CREATE TABLE public.*` migration MUST include `GRANT` statements — see the `public-schema-grants` rule.

### Cron jobs
- Live in the Postgres `cron.job` table. Add / edit via `supabase--insert` (not migrations — user-specific URLs/keys don't belong in migrations).
- URL choice matters: `https://swus-erp.lovable.app` = published slug (breaks if slug changes); `https://project--ed6f058b-a815-45d2-bb71-e1fc12a02390.lovable.app` = stable per-project URL. Prefer the stable URL for new jobs.

### Secrets
- Use `secrets--add_secret` (opens a secure form for the user), `secrets--generate_secret` (mints + stores random), or `secrets--set_secret` (agent-supplied known value).
- Publishable/anon keys can live in the codebase; anything else must be a secret.

### Manual steps after a Lovable change goes live
- **Nothing** for pure SQL migrations.
- **Click Publish → Update** for any TS/TSX change that affects a cron endpoint, webhook, server function, or the published UI. Frontend changes stop here.
- If Vercel env vars changed, redeploy Vercel from the dashboard (or push an empty commit) so the Worker picks up the new env.
- If a new cron job posts to a new server route, wait ≥1 cycle then check `mkt_sync_log` or the route's Vercel logs to confirm 200 responses.

---

*End of document.*