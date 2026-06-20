## Pathao Reconciliation Upgrade — Plan

Boro additive feature. Existing apply/revert flow untouched. 6 ta feature, 3 phase e bhag korbo.

---

### PHASE 1 — Database Foundation (Migration)

**1 ta migration**, sob additive:

```sql
-- orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reconciliation_status text DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_orders_recon_status ON orders(reconciliation_status, delivered_at);

-- Auto-set pending jokhon delivered hoy
CREATE FUNCTION set_reconciliation_pending() ...
CREATE TRIGGER trg_reconciliation_pending BEFORE UPDATE ON orders ...

-- erp_reconciliation_rows
ALTER TABLE erp_reconciliation_rows
  ADD COLUMN IF NOT EXISTS match_type text DEFAULT 'paid',  -- paid|return|partial
  ADD COLUMN IF NOT EXISTS return_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_amount numeric DEFAULT 0;

-- payment_status enum e 'partial_paid' add (jodi enum hoy; text hole skip)
```

Backfill: existing reconciled rows → `reconciliation_status='reconciled'` jate already-applied data clean thake.

---

### PHASE 2 — Server Functions (Logic)

**File: `src/lib/erp/reconciliation.functions.ts**` (existing edit)

- `parsePathaoCsv` — `Invoice_type` detect kore `rowType` set: `paid|return|partial`
- `createPathaoReconciliationRun` — per row:
  - **return**: `match_type='return'`, `cod_amount=0`, `return_fee=fee`
  - **partial**: `match_type='partial'`, `partial_amount=actual`, variance track
  - **paid**: existing logic
- `applyPathaoReconciliationRun` — branch per match_type:
  - **paid**: existing (status=delivered, paid)
  - **return**: status=returned, `reconciliation_status='reconciled'`, expense txn for return_fee, link to erp_return_cases (jodi thake), **paid mark koro na**
  - **partial**: income txn for partial amount only, `payment_status='partial_paid'`, `reconciliation_status='partial'`
  - Fail-soft: per-row try/catch, partial success possible

**New file: `src/lib/erp/reconciliation-queue.functions.ts**`

- `getPendingCodQueue({ brandId, courier?, dateFrom?, dateTo? })` — delivered orders where `reconciliation_status='pending'`, sorted by days pending desc
- `getOutstandingCod({ brandId })` — pending + delivered > 14 days ago
- `getReconciliationDashboard({ brandId, month })` — KPIs: pending total, reconciled MTD, outstanding >14d, return fees, net COD + daily series (last 30d) for chart
- `waiveOrders({ orderIds: string[] })` — bulk set `reconciliation_status='waived'`, audit log

Authenticated middleware sob jaygay.

---

### PHASE 3 — UI

**Existing routes update:**

1. `erp.reconciliation.index.tsx` (dashboard upgrade)
  - 5 KPI cards (Pending/Reconciled MTD/Outstanding/Return Fees/Net COD)
  - Recharts bar chart: COD collected vs expected (30 days)
  - Quick action buttons → Upload / Pending Queue / Outstanding
2. `erp.reconciliation.tsx` (layout) — tabs nav: Dashboard | Pending COD | Outstanding | Upload Invoice | History
3. **New leaf routes:**
  - `erp.reconciliation.pending.tsx` — Pending COD queue table, filters (courier, date), bulk select, color code (red >7 days)
  - `erp.reconciliation.outstanding.tsx` — Outstanding table, Mark Waived bulk action, Copy Consignment IDs to clipboard, big red total
4. `erp.reconciliation.invoice.tsx` (existing) — keep upload UI, but result preview ekhon return/partial rows ke alada section e dekhabe
5. **Run detail page** (jodi thake — `erp.reconciliation.$runId.tsx`) — tabs add: Matched / Mismatch / Unmatched / Returns / Partial; "Apply Returns" button Returns tab e

---

### Tech notes / constraints

- All brand-scoped via existing brand context
- Reconciliation_status backfill safe (default 'pending', delivered+paid orders ke 'reconciled' set korbo)
- Trigger `BEFORE UPDATE` — no recursion risk
- Server-side journal/transaction creation reuse existing finance helpers (`createTransaction`, journal posting from completeQC pattern)
- Charts: Recharts (already installed)
- No edge functions, all `createServerFn`

---

### Order of execution

1. Migration (approval needed)
2. After approval: server functions
3. UI routes + dashboard
4. Verify with browser (Playwright screenshot of new pending tab)

---

### Confirm before proceeding

- Trigger condition: spec e bola `OR 'partial_delivered'` — orders.status e ki `partial_delivered` value exist kore, na `partial_delivery`? Existing data check kore confirm korbo migration write korar age.
- `payment_status` column type: enum na text — check kore decide korbo `partial_paid` add korte hobe naki sudhu value write korlei hobe.

Approve korle migration likhe submit korbo.  
Trigger condition: `partial_delivered` — existing status check করে confirm করো before migration। ✅