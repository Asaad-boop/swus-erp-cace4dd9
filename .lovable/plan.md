# Marketing Intelligence & Meta Ads — Full Rebuild Plan

## Goal

Purano marketing module (UI + tables minus access token data) sorate hobe. Notun "Marketing Intelligence" module banate hobe ja Meta Ads spend, website UTM tracking, ERP orders, courier delivery, returns, product/courier/packaging cost, accounting — shob ek jaygay connect kore **real ROAS, POAS, net profit** dekhabe. Mock data thakbe na — sob real Supabase query.

---

## Current State (audit done)

- **Existing marketing tables (drop/replace korbo)**: `marketing_platforms`, `marketing_ad_accounts`, `marketing_campaigns`, `marketing_adsets`, `marketing_ads`, `marketing_campaign_insights`, `marketing_campaign_products`, `marketing_expense_links`, `marketing_settings`, `erp_ad_product_links`.
- **Reuse korbo (touch korbo na)**: `orders`, `order_items`, `courier_shipments`, `products`, `product_variants`, `brands`, `erp_transactions`, `erp_accounts`, `erp_chart_accounts`, `erp_expense_categories`, `erp_settings`, `user_roles`, `staff_permissions`.
- **Preserve korbo**: ad account access token + `external_account_id` + metadata (notun schema te migrate kore).

---

## Preservation Strategy (token data harabo na)

Migration shurute:

```sql
CREATE TEMP TABLE _meta_token_backup AS
SELECT brand_id, external_account_id, account_name, currency,
       access_token_secret_ref, token_expires_at, last_synced_at
FROM marketing_ad_accounts;
```

Notun `marketing_ad_accounts` tairi howar por backup theke insert kore debo. Token name secret-ref hisebe `secrets` tool e nai — column ei thake (encrypted-at-rest by Supabase). Frontend e kokhono expose hobe na — server fn only.

---

## Phase Breakdown

### Phase 1 — Database Foundation (1 migration)

Spec moto **11 ta table** create:

1. `marketing_platforms` (seed: meta, google, tiktok)
2. `marketing_ad_accounts`
3. `marketing_campaigns`
4. `marketing_adsets`
5. `marketing_ads`
6. `marketing_insights_daily`
7. `marketing_sessions`
8. `marketing_events`
9. `marketing_order_attributions` (most important)
10. `marketing_order_profit_snapshots`
11. `marketing_cost_rules`

Protyek table e:

- `brand_id` + FK to `brands(id)`
- RLS enabled
- GRANT to `authenticated` + `service_role`
- Policies: `has_brand_access(brand_id)` security-definer function diye (jodi exist na kore, banabo `user_roles`/`staff_permissions` theke)
- Indexes: brand_id, external_*_id, date, session_id, mobile_normalized, fbclid
- `updated_at` trigger

Old marketing tables `DROP CASCADE` korar age token backup → restore.

### Phase 2 — DB Functions & RPC

- `has_brand_access(_brand_id, _user_id)` security definer
- `rebuild_order_attribution(p_order_id uuid)` — 5-tier priority (exact_utm → session → customer → manual → unknown)
- `rebuild_all_marketing_attributions(p_brand_id, p_from, p_to)`
- `rebuild_marketing_profit_snapshot(p_order_id)` — revenue/cost/profit calc with allocated ad spend proportional to attributed orders per day per campaign
- `rebuild_marketing_profit_snapshots(p_brand_id, p_from, p_to)`
- `get_marketing_overview(p_brand_id, p_from, p_to)` — overview cards
- `get_campaign_report(p_brand_id, p_from, p_to)` — campaign table with all KPIs + health badge
- `get_adset_report`, `get_ad_report`
- `get_actual_roas_daily`, `get_product_campaign_report`, `get_courier_campaign_report`

Trigger: order status change → enqueue snapshot rebuild (defer kora hobe; phase 5 e implement).

### Phase 3 — Meta API Sync (TanStack server functions, NOT edge functions)

Existing `src/lib/erp/marketing/meta.server.ts` Meta Graph client reuse. Notun functions:

- `metaSyncStructure(brandId, adAccountId)` — accounts/campaigns/adsets/ads/creatives
- `metaSyncInsights(brandId, adAccountId, from, to)` — daily by campaign+adset+ad → upsert `marketing_insights_daily`
- `metaTestConnection(adAccountId)`
- `metaSyncSingleAccount(adAccountId)` — manual UI button
- After insights sync: optional auto-post to accounting (phase 6)

Cron route `/api/public/cron.sync-marketing` update kore daily insights sync korbe.

### Phase 4 — Website Tracking

- `src/lib/marketing/tracker.client.ts` — root e mount korbo. URL params (utm_*, fbclid, meta_*_id, placement) capture → localStorage + cookie (`mkt_session`) + server fn `recordMarketingSession`
- `recordMarketingEvent(name, payload)` — PageView/ViewContent/Purchase etc.
- Order creation flow (`src/lib/erp/orders.ts` `createOrder`) — optional `marketing_attribution` parameter accept korbe; create howar pore `rebuild_order_attribution(order_id)` call.
- Manual order form e "Marketing source" selector add.

### Phase 5 — Profit Snapshot Engine

- Order lifecycle hooks: confirm/ship/deliver/return/cancel — trigger snapshot rebuild (pg trigger → mark dirty; server fn or cron e batch rebuild — 10k+ orders e safe).
- Cost sources:
  - product_cost: `order_items.unit_cost_snapshot` fallback `product_variants.cost_price` fallback `products.cost_price`
  - courier_cost: `courier_shipments.delivery_fee` fallback `marketing_cost_rules`
  - packaging/COD/PG fee/return_cost: `marketing_cost_rules`
  - allocated_ad_spend: daily campaign spend ÷ # of attributed orders that day

### Phase 6 — Accounting Integration

- Setting in `marketing_cost_rules` (or extend): `auto_post_meta_spend`, `meta_expense_account_id`, `meta_payment_account_id`.
- Daily insight sync er por: ekta `erp_transactions` row per (brand, ad_account, date) — idempotent key `meta_spend:{ad_account}:{date}` (notun column `external_ref` ba `marketing_expense_links` style table). Duplicate prevent.
- "Accounting Sync" UI page — manual repost button.

### Phase 7 — UI Pages (sob real query, no mock)

Sidebar e "Marketing" parent + 12 sub-route under `/erp/marketing`:

1. `/erp/marketing` — Overview (15 KPI cards + 4 charts, real RPC)
2. `/erp/marketing/accounts` — Meta Ad Accounts (token masked)
3. `/erp/marketing/campaigns` — Campaign table with health badges
4. `/erp/marketing/campaigns/$id` — Campaign detail
5. `/erp/marketing/adsets` — Adset report
6. `/erp/marketing/ads` — Creative report (thumbnails)
7. `/erp/marketing/attribution` — 4 tabs: Mapped / Unattributed / Low Confidence / Manual
8. `/erp/marketing/roas` — Actual ROAS daily table with formula display
9. `/erp/marketing/products` — Product × Campaign
10. `/erp/marketing/courier` — Courier × Campaign
11. `/erp/marketing/accounting` — Accounting sync
12. `/erp/marketing/settings` — UTM template / Attribution / Cost rules / CAPI / Accounting

Reusable components:

- `MetricCard`, `MarketingDateFilter`, `CampaignHealthBadge`, `AttributionBadge`, `ProfitBreakdownCard`, `SyncStatusBadge`, `DataQualityAlert`

Empty states + loading + error boundary every page.

### Phase 8 — Polish

- Health badge logic (Profitable / Losing / Meta-Looks-Good-ERP-Bad / High Return / Low Delivery / Hidden Winner / No Attribution)
- Data quality alerts (missing product cost, missing courier cost, unmapped orders, expired token)
- Sidebar "Quick Actions" e "Sync Meta Now" button
- Test with real Toyora + HobbyShop data

---

## Phase Order & Approval

Bhai eta onek boro — ami **phase by phase** korbo, protyek phase shesh hole ektu check kore tumi next bolte parba. Suggestion:


| Order | Phase                          | Risk                     |
| ----- | ------------------------------ | ------------------------ |
| 1     | DB foundation + token preserve | High (old tables drop)   |
| 2     | DB functions/RPC               | Medium                   |
| 3     | Meta API sync                  | Low (existing client)    |
| 4     | Website tracking               | Low                      |
| 5     | Profit snapshot engine         | Medium                   |
| 6     | Accounting integration         | Medium (touches finance) |
| 7     | UI pages (12)                  | Low — biggest chunk      |
| 8     | Polish + badges + QA           | Low                      |


---

## Technical Notes

- Server fns: `src/lib/erp/marketing/*.functions.ts` (auth middleware), `*.server.ts` for Meta Graph helpers.
- All token reads stay in `.server.ts` files — never returned to client.
- Existing finance/orders/courier code **untouched** except `orders.ts createOrder` (add optional attribution param) and finance trigger compatibility.
- Routes lazy split — `_authenticated/erp.marketing.*.tsx`.
- Use existing `useBrand()` context for brand_id everywhere.

---

## Confirmation Needed

1. **Approve plan?** (yes/no)
2. **Phase 1 (DB + drop old tables with token preserve) start korbo akhon, naki shudhu plan dekhe rakhbo?**
3. Old `erp_ad_product_links` data ki preserve korte chao naki delete?

Bolo, then ami Phase 1 migration likhe shuru kori.  
Yes, approve the full plan, but start with Phase 1 only.

Before Phase 1 migration, apply these safety rules:

1. Do NOT directly DROP CASCADE old marketing tables first.  
Instead:
  - Create permanent backup tables for old marketing data.
  - Rename old tables with `_legacy` suffix if needed.
  - Create the new Marketing Intelligence tables.
  - Restore/migrate preserved data.
  - Only after verification we will decide whether to delete legacy tables.
2. For Meta ad account token preservation, do not use only TEMP backup.  
Create a permanent backup table first:
  `marketing_ad_accounts_legacy_backup`
  Preserve:
  - brand_id
  - external_account_id
  - account_name
  - currency
  - access_token_secret_ref
  - token_expires_at
  - last_synced_at
  - created_at / updated_at if available
  Then restore this data into the new `marketing_ad_accounts` table.
3. Preserve `erp_ad_product_links`.  
Do not delete it now.  
If it is old/legacy, either:
  - keep it untouched, or
  - migrate it later into the new Product × Campaign mapping/reporting structure.  
  For Phase 1, no data loss is allowed.
4. Phase 1 scope only:
  - Database backup/rename safety
  - New 11 marketing tables
  - RLS
  - indexes
  - updated_at triggers
  - seed marketing_platforms
  - restore preserved ad account metadata/token secret refs
5. Do not touch order creation, finance, courier, Meta sync, website tracking, or UI yet.  
Those are later phases.
6. After Phase 1, show me:
  - migration summary
  - old tables backed up/renamed list
  - new tables created list
  - token/ad account data restoration result
  - RLS policies added
  - any errors or warnings

Now implement Phase 1 safely.