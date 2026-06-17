## CRM Module — Customer Relationship Management

Users page (`/erp/users`) — staff/employee access — থাকবে যেমন আছে। CRM হবে আলাদা module `/erp/crm` — website customers (profiles + guest orders) দেখা ও manage করার জন্য।

### Scope

**CRM = website customers** (profiles যারা account create করছে + guest orders যারা শুধু checkout করছে phone দিয়ে)। সব brand একসাথে, অথবা active brand অনুযায়ী filter (top brand-switcher use করবে)।

### Pages

1. **`/erp/crm` — Customer List**
   - KPI cards: Total customers, New this month, Active (last 30d), Total LTV, Avg order value
   - Table columns: Name, Phone, Email, Type (registered/guest), Brands shopped, Orders count, Total spent (LTV), Last order date, Status (active/at-risk/lost), Tags
   - Filters: search (name/phone/email), customer type, brand, spend range, order count range, last-order date range, segment (VIP / repeat / one-time / at-risk / lost), tag
   - Sort: LTV, orders, last-order, recent
   - Bulk actions: tag, export CSV
   - Export CSV button (respects current filters)

2. **`/erp/crm/$customerId` — Customer Profile**
   - Header: name, phone, email, registered/guest badge, segment badge, LTV, lifetime orders, avg AOV, first/last order date
   - Tabs:
     - **Overview**: KPIs, brand-wise spend breakdown, recent activity timeline
     - **Orders**: full order history (status, brand, total, date) — link to `/erp/orders/$orderId`
     - **Addresses**: saved addresses (registered users) + shipping addresses used
     - **Notes**: internal CRM notes (add/edit/delete)
     - **Tags**: assign/remove tags (VIP, blacklist, wholesale, etc.)
   - Actions: edit display name/email/phone, merge customers (later), block

### Data model

CRM doesn't need new "customer" table — it derives from `profiles` (registered) + `orders` (guest by phone). Use a server-side aggregator:

- **`crm_customer_notes`** (new table): `id, customer_key (phone), profile_id?, brand_id?, note, created_by, created_at, updated_at`
- **`crm_customer_tags`** (new table): `id, customer_key, tag, created_by, created_at` (unique on customer_key+tag)
- **`crm_customer_meta`** (new table, optional): `customer_key (PK), status (active/at_risk/lost/blocked), internal_email, updated_at` — for blocked/manual overrides

Customer identity = **normalized phone** (primary key for guest+registered unification). Registered profile linked when phone matches.

### Server functions (`src/lib/erp/crm/crm.functions.ts`)

- `listCustomers({ brandIds, filters, sort, page, pageSize })` — aggregates from orders+profiles, returns rows + total + KPIs
- `getCustomer({ customerKey })` — full profile, orders, addresses, notes, tags, brand breakdown
- `exportCustomersCsv({ brandIds, filters })` — returns CSV string
- `addNote`, `deleteNote`, `addTag`, `removeTag`, `setStatus`, `bulkAddTag`

All gated by `requireSupabaseAuth` + admin/staff role.

### Sidebar

Add **CRM** entry (Users icon) between Marketing and Users in `src/components/erp/erp-sidebar.tsx`. Users entry stays as-is for staff.

### Segments (computed)

- **VIP**: LTV ≥ top 10% threshold OR ≥ 5 orders
- **Repeat**: 2–4 orders
- **One-time**: 1 order
- **At-risk**: last order 60–120 days ago, was repeat
- **Lost**: last order > 120 days ago
- **New**: first order < 30 days ago

### Technical details

- All queries server-side with `requireSupabaseAuth`, RLS-respecting via authenticated supabase client. For aggregation, lift to `supabaseAdmin` inside handler after admin role check (since aggregating across all orders needs full read).
- Customer key = `normalize_phone(phone)` — strip non-digits, take last 11 digits (BD format).
- CSV export uses standard `text/csv` blob, downloaded client-side.
- Brand filter respects top `BrandContext` — passes `brandIds` to server fn.

### Migration

Creates `crm_customer_notes`, `crm_customer_tags`, `crm_customer_meta` with proper GRANTs + RLS (admin/staff can manage). Adds index on `orders.shipping_phone` and `orders.guest_phone` for fast aggregation.

### Files

**New:**
- `supabase/migrations/<ts>_crm_module.sql`
- `src/lib/erp/crm/crm.functions.ts`
- `src/lib/erp/crm/types.ts`
- `src/lib/erp/crm/segments.ts` (pure helper)
- `src/routes/_authenticated/erp.crm.tsx` (layout)
- `src/routes/_authenticated/erp.crm.index.tsx` (list)
- `src/routes/_authenticated/erp.crm.$customerId.tsx` (profile)
- `src/components/erp/crm/customer-table.tsx`
- `src/components/erp/crm/customer-filters.tsx`
- `src/components/erp/crm/kpi-cards.tsx`
- `src/components/erp/crm/notes-tab.tsx`
- `src/components/erp/crm/tags-input.tsx`

**Edited:**
- `src/components/erp/erp-sidebar.tsx` — add CRM nav entry

### Out of scope (later)
- Email/SMS campaigns to segments
- Customer merge UI
- Loyalty points / rewards
- Custom segment builder
