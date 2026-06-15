## Marketing Module — Meta Ads (Phase 1)

ERP-er notun ekta **Marketing** module banabo. Multi-platform extensible (Meta, Google, TikTok future), but Phase 1-e shudhu **Meta Ads** integration kora hobe.

---

### 1. Database Schema (new tables)

`**marketing_platforms**` — registry of supported platforms

- `id`, `code` (`meta`, `google`, `tiktok`...), `name`, `is_active`

`**marketing_ad_accounts**` — connected ad accounts per brand

- `id`, `brand_id`, `platform_id`, `external_account_id` (Meta ad account ID), `account_name`, `access_token` (encrypted/secret reference), `token_expires_at`, `currency`, `is_active`, `last_synced_at`

`**marketing_campaigns**` — synced from platform

- `id`, `ad_account_id`, `brand_id`, `external_campaign_id`, `name`, `objective`, `status`, `daily_budget`, `lifetime_budget`, `start_time`, `stop_time`, `raw` (jsonb), `updated_at`

`**marketing_adsets**` & `**marketing_ads**` — optional drilldown (Phase 1 keep campaign-level only, structure ready)

`**marketing_campaign_insights**` — daily metrics snapshot

- `id`, `campaign_id`, `date`, `spend`, `impressions`, `clicks`, `reach`, `ctr`, `cpc`, `cpm`, `purchases` (Meta-reported), `purchase_value` (Meta ROAS numerator), `raw` (jsonb)
- UNIQUE(campaign_id, date)

`**marketing_campaign_products**` — campaign ↔ product mapping (many-to-many)

- `id`, `campaign_id`, `product_id`, `weight` (default 1, for split attribution if multi-product), `created_by`, `created_at`

`**marketing_expense_links**` — link daily spend → erp_transactions (idempotent)

- `id`, `campaign_id`, `date`, `transaction_id`, `amount`, `account_id`
- UNIQUE(campaign_id, date)

All tables: GRANT to authenticated + service_role, RLS enabled, admin/operations can manage, others read brand-scoped.

---

### 2. Meta API Integration

**Secrets needed (user must provide):**

- `META_APP_ID`
- `META_APP_SECRET`
- `META_ACCESS_TOKEN` (long-lived system user token, or OAuth flow)

**Server functions** (`src/lib/erp/marketing/meta.server.ts` + `.functions.ts`):

- `connectMetaAccount(brand_id, ad_account_id, access_token)` — verify + save
- `syncMetaCampaigns(ad_account_id)` — fetch `/act_{id}/campaigns`
- `syncMetaInsights(ad_account_id, since, until)` — fetch `/insights` with fields: `spend, impressions, clicks, ctr, cpc, cpm, actions, action_values, purchase_roas`
- `getLivePerformance(campaign_id)` — today's insight refresh on demand

**Cron** (every 30 min): auto-sync active campaigns' insights (last 3 days rolling window).

---

### 3. ROAS Calculation

- **Meta ROAS** = `purchase_value / spend` (from Meta's pixel-reported data, stored in `purchase_value`)
- **Actual ROAS** = sum of mapped products' delivered order revenue ÷ spend, for the same date range
  - Query: `orders` JOIN `order_items` WHERE `product_id IN (mapped products)` AND `status IN ('delivered','partial_delivered','paid')` AND `created_at::date BETWEEN since AND until`
  - Multi-product campaign: split by `weight` or pro-rata by product revenue
- Both shown side-by-side in UI with delta %

---

### 4. Expense Integration

When daily insight syncs:

- For each `(campaign, date)` with `spend > 0` not yet in `marketing_expense_links`:
  - Auto-find/create `erp_expense_categories` entry: **"Marketing — Meta Ads"** (per brand)
  - Insert `erp_transactions` (type=expense, reference_type='marketing_campaign', reference_id=campaign_id, date=insight date, amount=spend)
  - Insert link row for idempotency
- If insight re-syncs with updated spend → UPDATE the existing transaction amount
- Account selection: configurable default "Marketing Ad Account" in `erp_courier_settings` style new field (or per-platform setting)

---

### 5. UI / Routes

**Sidebar:** add "Marketing" item with `Megaphone` icon → `/erp/marketing`

**Routes:**

- `/erp/marketing` — Dashboard: KPI cards (Total Spend, Total Revenue Attributed, Avg Meta ROAS, Avg Actual ROAS), date range picker, top campaigns table
- `/erp/marketing/accounts` — Connected ad accounts list + "Connect Meta" button (modal)
- `/erp/marketing/campaigns` — All campaigns table: name, status, spend, meta ROAS, actual ROAS, mapped products count, last synced
- `/erp/marketing/campaigns/$campaignId` — Detail: daily chart (spend vs revenue), insights table, **Product Mapping** section (multi-select products), sync button

**Components:**

- `connect-meta-dialog.tsx`
- `campaign-product-mapping.tsx` (searchable multi-select w/ weight)
- `roas-comparison-card.tsx`
- `campaign-insights-chart.tsx` (Recharts)
- `marketing-kpi-cards.tsx`

---

### 6. Phase 1 Delivery Order

1. Migration: all new tables + GRANT/RLS + Marketing expense category seed
2. Sidebar entry + placeholder routes
3. Meta API client (`meta.server.ts`) + connect flow + secrets
4. Sync server functions + manual sync button
5. Campaigns list + detail UI
6. Product mapping UI
7. Actual ROAS calculation + comparison cards
8. Auto-expense sync + cron (every 30 min)
9. Dashboard KPIs

---

### Technical Notes

- Meta Graph API version: `v21.0`
- Insights API rate limits → batch requests, exponential backoff, store `raw` for audit
- Token refresh: long-lived tokens last 60 days; show expiry warning in UI
- Future platforms (Google, TikTok): same schema works — add new `marketing_platforms` row + new `*.server.ts` adapter implementing same interface (`sync`, `getInsights`)

---

### Open Questions (before build)

1. Meta access token: **System User token** (server-side, no expiry issue) naki **OAuth flow** (user login kore connect korbe)? System user simpler, OAuth more user-friendly.
2. Multi-product campaign attribution: **equal split**, **weighted**, naki **pro-rata by actual revenue**?
3. Default expense account: kon account theke marketing spend deduct hobe (e.g., "Business Bank", "Cash")? Per-brand configurable?

Confirm korle migration + skeleton diye shuru kori.  
ERP Marketing Module — Meta Ads Integration (Phase 1)

Build a new **Marketing** module for the ERP system.

This module must be architected as a **multi-platform marketing system** from day one, even though **Phase 1 only supports Meta Ads (Facebook/Instagram Ads)**.

Future platforms:

- Google Ads
- TikTok Ads
- Snapchat Ads
- YouTube Ads

The architecture, database design, server adapters, and UI must be extensible.

Use existing ERP architecture patterns:

- Multi-brand support
- Supabase PostgreSQL
- RLS-enabled tables
- Brand-scoped access
- TanStack Router
- React + TypeScript
- Existing ERP transaction/accounting system
- Existing product/order tables
- Existing auth/role system

---

# PHASE 1 GOAL

Phase 1 must support:

1. Connect Meta Ad Accounts
2. Sync Campaigns
3. Sync Daily Insights
4. Product ↔ Campaign Mapping
5. Meta ROAS calculation
6. Estimated Actual ROAS calculation
7. Auto-create accounting expense entries from ad spend
8. Marketing dashboard with KPIs
9. Manual sync + auto sync
10. Production-safe architecture for future expansion

---

# DATABASE DESIGN

Create the following tables.

All tables:

- Enable RLS
- Brand scoped
- Grant authenticated + service_role
- Admin/operations can manage
- Other users read-only where appropriate
- Add created_at / updated_at timestamps where missing
- Use indexes on all foreign keys + external ids

---

## 1. marketing_platforms

Registry of supported platforms.

Columns:

- id
- code (`meta`, `google`, `tiktok`)
- name
- is_active

Seed:

- Meta
- Google
- TikTok

---

## 2. marketing_settings

Per-brand marketing configuration.

Columns:

- id
- brand_id
- default_expense_account_id
- default_expense_category_id
- attribution_mode (`weighted`, `equal_split`, `revenue_proportional`)
- auto_create_expenses boolean default true
- auto_sync_enabled boolean default true
- sync_interval_minutes default 30
- created_at
- updated_at

One row per brand.

---

## 3. marketing_ad_accounts

Connected ad accounts.

Columns:

- id
- brand_id
- platform_id
- external_account_id
- account_name
- currency
- timezone_name
- token_secret_ref
- token_expires_at
- is_active
- last_synced_at
- metadata jsonb
- created_by
- created_at
- updated_at

IMPORTANT:  
Never store raw access tokens directly in plaintext database columns.

Use:

- encrypted storage
- vault
- secret reference pattern

---

## 4. marketing_campaigns

Synced campaigns.

Columns:

- id
- brand_id
- ad_account_id
- external_campaign_id
- name
- objective
- status
- buying_type
- daily_budget
- lifetime_budget
- start_time
- stop_time
- last_insight_sync_at
- raw jsonb
- created_at
- updated_at

Indexes:

- external_campaign_id
- ad_account_id
- brand_id

---

## 5. marketing_adsets

Prepare structure for future expansion.

Columns:

- id
- campaign_id
- external_adset_id
- name
- status
- raw jsonb
- created_at
- updated_at

Do not fully implement UI yet.

---

## 6. marketing_ads

Prepare structure for future expansion.

Columns:

- id
- adset_id
- external_ad_id
- name
- status
- raw jsonb
- created_at
- updated_at

Do not fully implement UI yet.

---

## 7. marketing_campaign_insights

Daily metrics snapshots.

Columns:

- id
- campaign_id
- date
- spend
- impressions
- clicks
- reach
- ctr
- cpc
- cpm
- purchases
- purchase_value
- purchase_roas
- outbound_clicks
- landing_page_views
- raw jsonb
- synced_at
- created_at

Constraints:  
UNIQUE(campaign_id, date)

Purpose:  
Store immutable daily insight snapshots.

IMPORTANT:  
Use upsert behavior during sync.

---

## 8. marketing_campaign_products

Campaign ↔ Product mapping.

Columns:

- id
- campaign_id
- product_id
- weight default 1
- notes
- created_by
- created_at

Purpose:  
Used for estimated actual ROAS attribution.

---

## 9. marketing_expense_links

Idempotent expense tracking.

Columns:

- id
- campaign_id
- insight_date
- transaction_id
- amount
- account_id
- created_at

Constraint:  
UNIQUE(campaign_id, insight_date)

Purpose:  
Prevent duplicate accounting expense creation.

---

# META ADS INTEGRATION

Use:

- Meta Graph API v21.0

Create:

- `src/lib/erp/marketing/providers/meta/meta.server.ts`
- `src/lib/erp/marketing/providers/meta/meta.functions.ts`

Create a provider architecture.

Example interface:

```ts
interface MarketingProvider {
  connectAccount()
  syncCampaigns()
  syncInsights()
  getLivePerformance()
}

```

Future platforms must plug into same interface.

---

# REQUIRED ENV VARIABLES

- META_APP_ID
- META_APP_SECRET
- META_SYSTEM_USER_TOKEN

Use System User token approach for Phase 1.

DO NOT implement OAuth yet.

---

# SERVER FUNCTIONS

Implement:

## connectMetaAccount

Input:

- brand_id
- ad_account_id

Behavior:

- Validate account access via Meta API
- Fetch account info
- Save account
- Save token reference securely

---

## syncMetaCampaigns

Behavior:

- Fetch campaigns from:  
`/act_{id}/campaigns`

Store:

- status
- objective
- budgets
- start/end dates
- raw payload

Use pagination support.

---

## syncMetaInsights

Input:

- since
- until

Fetch:  
`/insights`

Fields:

- spend
- impressions
- clicks
- ctr
- cpc
- cpm
- reach
- actions
- action_values
- purchase_roas
- outbound_clicks
- landing_page_views

Requirements:

- Parse purchase actions safely
- Parse purchase value safely
- Handle missing fields
- Handle rate limits
- Retry with exponential backoff
- Batch requests when possible

Store raw response JSON for audit/debugging.

---

## getLivePerformance

Behavior:

- Refresh today's insights only
- Used for manual refresh button

---

# CRON SYSTEM

Create automatic sync cron.

Interval:  
Every 30 minutes.

Behavior:

- Find active marketing accounts
- Sync campaigns
- Sync insights for last 3 days rolling window

Why:  
Meta attribution updates retroactively.

Requirements:

- Queue-safe
- Idempotent
- Retry-safe

---

# ROAS SYSTEM

## Meta ROAS

Formula:

Meta ROAS = purchase_value / spend

Source:  
Meta pixel reported data.

---

## Estimated Actual ROAS

Formula:

Estimated Actual ROAS =  
Delivered revenue from mapped products ÷ ad spend

Join:

- orders
- order_items
- marketing_campaign_products

Allowed statuses:

- delivered
- partial_delivered
- completed
- paid

IMPORTANT:  
This is NOT true attribution.

In UI label it clearly:

"Estimated Actual ROAS"

---

# ATTRIBUTION MODES

Support 3 modes:

## weighted

Use manual product weights.

Example:  
Product A weight 70  
Product B weight 30

---

## equal_split

Revenue split equally.

---

## revenue_proportional

Revenue split proportionally.

Prepare architecture even if only weighted is used initially.

---

# ACCOUNTING INTEGRATION

When insights sync:

For each campaign/date:  
if spend > 0:

1. Find existing marketing_expense_links row
2. If not exists:
  - Create ERP expense transaction
  - Link it
3. If exists:
  - Update transaction amount if spend changed

Transaction rules:

- type = expense
- reference_type = marketing_campaign
- reference_id = campaign_id

Expense category:  
Auto-create:  
"Marketing — Meta Ads"

Use marketing_settings.default_expense_account_id.

Must be fully idempotent.

No duplicate expenses allowed.

---

# UI / ROUTES

Add sidebar item:

- Marketing
- Icon: Megaphone

Route:  
`/erp/marketing`

---

# ROUTES

## /erp/marketing

Dashboard page.

Include:

- Total Spend
- Estimated Revenue
- Avg Meta ROAS
- Avg Estimated Actual ROAS
- Active Campaigns
- Top Performing Campaigns
- Date range picker
- Spend vs Revenue chart

---

## /erp/marketing/accounts

Features:

- Connected account list
- Last sync time
- Token expiry warning
- Sync button
- Connect Meta button

---

## /erp/marketing/campaigns

Table columns:

- Campaign Name
- Status
- Objective
- Spend
- Meta ROAS
- Estimated Actual ROAS
- Products mapped
- Last Synced

Features:

- Search
- Filter
- Pagination
- Sync selected
- Status badges

---

## /erp/marketing/campaigns/$campaignId

Detail page.

Sections:

- KPI cards
- Spend vs Revenue chart
- Daily insights table
- Product mapping
- Manual sync
- Raw insight debug viewer

Charts:  
Use Recharts.

---

# COMPONENTS

Create:

- connect-meta-dialog.tsx
- marketing-kpi-cards.tsx
- campaign-insights-chart.tsx
- campaign-product-mapping.tsx
- roas-comparison-card.tsx
- marketing-date-range-picker.tsx
- marketing-status-badge.tsx

---

# PRODUCT MAPPING UI

Requirements:

- Searchable product selector
- Multi-select
- Adjustable weights
- Real-time total weight preview
- Save mapping button

Show:

- mapped SKU
- product image
- weight %

---

# DASHBOARD REQUIREMENTS

Dashboard must support:

- Brand switch
- Date filtering
- Campaign filtering
- Cached aggregations
- Fast loading

KPI calculations must be server-side.

---

# SECURITY

IMPORTANT REQUIREMENTS:

- Never expose Meta tokens client-side
- Never store raw plaintext tokens
- Service-role operations only on server
- Brand isolation mandatory
- Validate ownership before sync
- Log sync failures

---

# PERFORMANCE

Requirements:

- Use indexes aggressively
- Use batch upserts
- Avoid N+1 queries
- Paginate large campaign lists
- Use cached KPI aggregation where possible

---

# ERROR HANDLING

Must handle:

- expired tokens
- Meta rate limits
- missing permissions
- partial sync failures
- malformed insight payloads
- duplicate sync attempts

Show friendly UI errors.

---

# PHASE 1 DELIVERY ORDER

1. Database migrations
2. RLS policies
3. Sidebar + routes
4. Provider architecture
5. Meta integration
6. Account connect flow
7. Campaign sync
8. Insights sync
9. Dashboard UI
10. Product mapping
11. Estimated Actual ROAS
12. Accounting integration
13. Cron automation
14. Final optimization + audit

---

