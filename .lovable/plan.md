## Project Audit (ja paisi)

**Stack & conventions**
- TanStack Start + Supabase, routes `src/routes/_authenticated/erp.*`, server logic in `src/lib/erp/*.functions.ts` + `*.server.ts`, brand context via `useBrand`, `app_role` enum + `has_role()` security definer already present.
- shadcn UI, BDT format `৳`, react-query, sonner toasts — patterns dekhechi `erp.suppliers.tsx`, `erp.finance.*`, `erp.orders.*`.

**Existing tables ja reuse korbo**
- `erp_suppliers` (brand-scoped, basic) — **extend** with `source_link, country, currency, payment_terms_days, credit_limit_bdt, supplier_type`. Notun import-only table banabo na.
- `erp_accounts` (wallets) — payment outflow uthano hobe ekhan theke; balance update via existing pattern.
- `erp_chart_accounts` + `erp_journal_entries` + `erp_journal_lines` — accounting journal post hobe. Account resolve hobe `code` diye (CoA seed migration e Supplier Advance, Supplier Payable, Import Clearing, Inventory Asset, Local Freight, Import Loss seed korbo per brand).
- `product_variants` + `products` (`stock`, `cost_price`) — landed cost diye weighted avg update hobe.
- `stock_movements` — **schema gap**: currently per `product_id` only, kono `variant_id`, `warehouse_id`, `unit_cost`, `reference_type/id`, `idempotency_key` nei. Notun `erp_stock_movements_v2` create na kore, existing `stock_movements` e nullable columns add korbo (variant_id, unit_cost_bdt, total_cost_bdt, reference_type, reference_id, idempotency_key UNIQUE) — backward compatible.
- `user_roles` + `has_role(_user_id, _role)` — use hobe authorization e.

**Gaps (ja nei)**
- **No warehouses table.** Project single-warehouse pattern e cholche. MVP scope er jonno ekta minimal `warehouses` table banabo (id, brand_id, name, is_active, is_default), default warehouse auto-seed per brand. Postings ei default warehouse e jabe; future multi-warehouse ready.
- No cargo agent, no import PO/carton table — sob notun.

---

## Phased Plan

### Phase 1 — DB foundation (migration #1)
1. `warehouses` (brand-scoped, default per brand auto-seeded via trigger).
2. Extend `erp_suppliers`: `source_link, country DEFAULT 'CN', currency DEFAULT 'BDT', payment_terms_days, credit_limit_bdt, supplier_type DEFAULT 'both'`.
3. Extend `stock_movements`: `variant_id, warehouse_id, unit_cost_bdt, total_cost_bdt, reference_type, reference_id, idempotency_key UNIQUE NULLS NOT DISTINCT`. Add `import_receive` reason.
4. New tables (numeric(18,4) for money, all brand-scoped, RLS via `has_role` or brand membership):
   - `imp_cargo_agents`
   - `imp_purchase_orders` (status enum)
   - `imp_po_items`
   - `imp_cartons` (status enum, `UNIQUE(po_id, carton_number)`, `UNIQUE(barcode)`)
   - `imp_carton_items`
   - `imp_payments` (payment_type enum, `UNIQUE(idempotency_key)`, links to wallet + journal)
   - `imp_status_history`
5. RLS: SELECT for `authenticated` scoped to brand (using existing brand-access pattern); INSERT/UPDATE via security-definer RPCs only. GRANTs for `authenticated` + `service_role`.
6. Seed CoA codes per brand (idempotent): `1200-INV`, `1310-IMP-CLR`, `1320-SUP-ADV`, `2100-SUP-AP`, `5200-IMP-FRT`, `5210-IMP-LOC`, `5900-IMP-LOSS`.

### Phase 2 — Server functions (`src/lib/erp/imports/*.functions.ts` + `.server.ts`)
All `createServerFn` + `requireSupabaseAuth`. Brand & role checked server-side. Idempotency key required on every mutating op. Money math in JS using `Decimal`-style helpers (cents-int) — `numeric` in DB.

- `createImportPurchaseOrder` — single PL/pgSQL RPC `imp_create_po(payload jsonb)` invoked inside server fn for atomicity (PO + items + cartons + carton_items + optional payment + journal + history). Verifies carton totals == item quantities. Generates `po_number` via sequence per brand.
- `updateCartonStage` — pre-arrival only (`ordered → at_china_warehouse → in_transit`). PO status auto-rolls when all cartons same stage.
- `markImportArrivedInBangladesh` — RPC: weight × rate, prorated allocation with rounding to last carton, set `arrived_bd`, optional shipping payment + journal (Dr Import Clearing / Cr Wallet).
- `releaseImportCarton` — payment optional, role gate for release-without-payment (`admin`/`super_admin`/`accountant`), journal Dr Supplier Payable / Cr Wallet (or Supplier Advance offset).
- `approveImportCartonToInventory` — RPC: locks row, validates QC sums, computes landed unit cost, inserts `stock_movements` row with idempotency_key, upserts `product_variants.stock` + weighted `cost_price`, updates `products.stock` + aggregate cost, posts journal Dr Inventory / Cr Import Clearing (+ Supplier Payable settlement if due payment supplied), rolls PO to `partially_received`/`completed`.
- `recordImportPayment` — canonical payment fn used by ops above & standalone; recalculates PO `paid_bdt`/`due_bdt` from active payments only (never trust client).
- `reverseImportPosting` — admin only; inserts reversing stock movement + reversing journal; never deletes rows.

### Phase 3 — Read APIs & hooks
- `src/lib/erp/imports/queries.ts` — list POs, PO detail, dashboard aggregates, reports aggregates (single RPCs `imp_dashboard_stats`, `imp_report_aggregates` for speed).
- React-query hooks under `src/hooks/erp/use-imports-*.ts`.

### Phase 4 — UI pages (sob `src/routes/_authenticated/erp.imports.*`)
- `erp.imports.tsx` (layout) + sidebar entry `Imports` icon `Container`.
- `erp.imports.index.tsx` — Dashboard (KPI cards, pipeline funnel, recent POs, top suppliers, alerts, brand+date+supplier+agent filters with preset chips).
- `erp.imports.orders.index.tsx` — PO list with search/filter/sort.
- `erp.imports.orders.new.tsx` — multi-section form (Order Info → Supplier picker+inline create → Items with live BDT preview → Cartonization with auto-split + manual edit + reconciliation warning → Initial payment with wallet balance preview). Live wallet/inventory/landed preview blocks before submit.
- `erp.imports.orders.$orderId.tsx` — header, pipeline, items table, payments timeline, cartons accordion with per-stage actions (Mark Arrived, Release, QC & Post to Inventory) — each opens a dialog with confirm-preview.
- `erp.imports.reports.tsx` — charts (Recharts already in project) + CSV export.
- `erp.imports.settings.tsx` — Cargo Agents tab + Suppliers tab (extends existing supplier mgmt, inactive-toggle instead of delete when referenced).

Shared components: `imports/po-pipeline.tsx`, `imports/carton-row.tsx`, `imports/wallet-preview.tsx`, `imports/landed-cost-preview.tsx`, `imports/cargo-agent-form.tsx`, `imports/supplier-inline-form.tsx`, `imports/qc-dialog.tsx`.

### Phase 5 — Validation, edge cases, audit
- Zod schemas client + server.
- All ops write to `imp_status_history` with before/after + reason.
- DB triggers: auto-update PO totals on payment insert; auto-update PO status when all cartons reach a terminal stage.

### Phase 6 — Tests
- Vitest unit tests for money math, shipping allocation rounding, weighted-avg cost, carton reconciliation, QC sum validation.
- Integration tests against Supabase (auth as a seeded user) for the 30 listed scenarios — run via `bunx vitest run` in a dedicated `src/lib/erp/imports/__tests__/` folder. Idempotency + brand isolation + role gating prioritised.

---

## Key decisions (jodi different chao bolo)
1. **Warehouses**: minimal table + auto default per brand — multi-warehouse future ready, MVP single-WH friendly. (Alternative: skip table, hard-code "main" — but spec explicitly chayse warehouse-aware.)
2. **Stock ledger**: extend existing `stock_movements` (nullable cols) instead of new `erp_stock_movements_v2`. Onno code bhangbe na, future migration easy.
3. **Suppliers**: ekta canonical `erp_suppliers` table extend kora — separate `imp_suppliers` banano hobe na (spec o etai bolse).
4. **Money**: PostgreSQL `numeric(18,4)`, JS side integer paisa math via small helper to avoid float drift.
5. **Atomicity**: complex flows (create PO, arrive, QC-post) PL/pgSQL RPCs e — single transaction guarantee.
6. **CoA seeding**: per-brand idempotent seed in migration + on-demand resolver `imp_get_or_create_account(brand_id, code)` so future brands kaaj kore.

Approve hole Phase 1 migration diye shuru korbo, tarpor ek ek phase implement + verify.
