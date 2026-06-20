## Returns & Exchanges Module — Full Build Plan

Boro scope, tai implementation shuru korar age plan confirm korte chai. Sob additive, existing dialogs/profitability bhangbe na.

---

### PHASE 0 — Database Migration (additive only)

**Extend `erp_return_cases**` (9 new columns):

- `return_status` (default `'initiated'`), `courier_tracking_id`, `courier_name`
- `qc_condition`, `qc_notes`, `qc_done_by` (FK auth.users), `qc_done_at`
- `stock_updated` (default false), `refund_status` (default `'pending'`)

**Extend `erp_exchange_cases**` (4 new columns):

- `exchange_status` (default `'initiated'`), `new_order_id` (FK orders)
- `courier_tracking_id`, `exchange_type_detail`

**New table `erp_return_timeline**`:

- `id`, `case_id`, `case_type` (return|exchange), `status`, `note`, `created_by`, `created_at`
- GRANTs to authenticated + service_role, RLS scoped to brand access
- Index on `(case_id, case_type, created_at desc)`

**New helper functions** (SQL):

- `generate_case_number(_type text)` → returns `RET-YYYYMM-XXXX` / `EXC-YYYYMM-XXXX`
- Trigger on `erp_return_cases` / `erp_exchange_cases` insert → auto add timeline entry
- Trigger on status change → auto add timeline entry

---

### PHASE 1 — Dedicated Module `/erp/returns`

**New routes** under `_authenticated/`:

- `erp.returns.tsx` — layout with `<Outlet />`
- `erp.returns.index.tsx` — list page (tabs: All / Returns / Exchanges / Pending QC / Restocked / Closed)
- `erp.returns.$caseId.tsx` — case detail page

**List page**:

- Header + [New Return] [New Exchange] [Export CSV] buttons
- Filter bar: date range, brand, status, type
- Combined table (returns + exchanges) with status badges
- Tab counts pulled with brand scoping

**Case detail page** (2/3 + 1/3 layout):

- Left: Timeline (vertical, icons + staff + time), QC section (when status=received), Product info
- Right: Case summary, Financial impact, Courier info, Exchange-specific actions

**Sidebar**: Add "Returns & Exchanges" under Operations group → `/erp/returns`

---

### PHASE 2 — Order Detail Integration

In existing Order Detail right sidebar, new "Returns" section:

- **[Initiate Return]** button (shown only for delivered / partial_delivered orders) → opens improved ReturnCaseDialog (order items auto-loaded from THIS order, not last-50 flat list; courier tracking field added; auto-fill refund+WAC kept)
- **[Initiate Exchange]** button → opens improved ExchangeCaseDialog (exchange_type_detail selector added)
- **Mini list** of all existing return/exchange cases for this order with [View] deep-link to `/erp/returns/$caseId`

Existing dialogs stay functional from Product Profitability page (no breaking changes).

---

### PHASE 3 — QC & Stock Integration

QC section in case detail (visible when `return_status='received'`):

1. Condition selector: Sellable / Damaged / Missing
2. QC notes textarea
3. [Complete QC] button:
  - **Sellable** → `supabase.rpc('adjust_stock_v2', { delta=+qty, unit_cost=WAC, source='return', idempotency_key='return_restock_${id}' })` → status=`restocked`, `stock_updated=true`
  - **Damaged** → activity_log entry, status=`qc_done`
  - **Missing** → activity_log entry (courier loss), status=`qc_done`
4. Timeline entry auto-created

---

### PHASE 4 — Exchange Order Creation

[Create Exchange Order] button on exchange case detail (when type ≠ refund_only):

- Pre-fills new order: same customer, new product/variant, COD=exchange_charge, note=`"Exchange for order #XXXX"`
- On create → links `new_order_id`, exchange status → `new_order_created`
- Shows link to new order

---

### PHASE 5 — Server Functions

New file: `src/lib/erp/returns/returns.functions.ts`

All `createServerFn` + `requireSupabaseAuth`, brand-scoped:

- `listReturnCases`, `getReturnCaseDetail`, `createReturnCase`, `updateReturnStatus`
- `completeQC` (triggers stock RPC if sellable)
- `listExchangeCases`, `getExchangeCaseDetail`, `createExchangeCase`
- `createExchangeOrder` (uses existing order creation flow internally)
- `closeCase`, `exportReturnCases` (CSV)

---

### Files To Create / Edit

**New (10 files)**:

- 1 migration (PHASE 0)
- `src/lib/erp/returns/returns.functions.ts`
- `src/routes/_authenticated/erp.returns.tsx` (layout)
- `src/routes/_authenticated/erp.returns.index.tsx`
- `src/routes/_authenticated/erp.returns.$caseId.tsx`
- `src/components/erp/returns/returns-table.tsx`
- `src/components/erp/returns/case-timeline.tsx`
- `src/components/erp/returns/qc-section.tsx`
- `src/components/erp/returns/case-summary-panel.tsx`
- `src/components/erp/returns/return-status-badge.tsx`

**Edit (3-4 files)**:

- `src/components/erp/orders/order-detail-extras.tsx` — add Returns section
- `src/components/erp/orders/return-case-dialog.tsx` — order-scoped items + tracking field
- `src/components/erp/orders/exchange-case-dialog.tsx` — exchange_type_detail field
- Sidebar nav file (find + add Operations entry)

---

### Confirmation needed before I start

1. **Migration approval**: Apply PHASE 0 migration first (kichu hoyar age)?
2. **Exchange order creation**: Existing manual order creation flow ache (`/erp/orders/new` ba similar)? Naki ami simple POS-style create function likhbo?
3. **Brand scoping**: All queries `brand_id IN (user_brand_access)` — confirmed pattern?
4. **CSV export**: Server-side generate kore download, naki client-side?

Confirm korle PHASE 0 migration diye shuru kori.  
6:36 PM

**Confirm. Answers:**

1. **Migration** — Phase 0 age apply koro ✅
2. **Exchange order** — simple create function likho (existing flow complex) ✅
3. **Brand scoping** — confirmed ✅
4. **CSV export** — client-side ✅

**Phase 0 migration shuru koro.** 🚀

&nbsp;