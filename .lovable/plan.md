
# Marketing Intelligence Module — Full Plan

Marketing module ekdom nicher theke notun vabe banabo. Main lokkho: Meta Ads er **Reported result** vs **Confirmed result** vs **Delivered (Actual) result** — tinta layer alada vabe dekhabo, jate Finance/PnL e kono bhul na hoy.

---

## 1) Core Concept — 3 Layer Result Model

Ekta campaign er against e amra 3 ta number track korbo:

| Layer | Source | Use |
|---|---|---|
| **Meta Reported** | Meta Graph API insights (purchase, leads, spend, CPM, CTR…) | Ad platform er raw view |
| **Confirmed Orders** | ERP `orders` jeguloi confirmed status | Real sales jegula team confirm korse |
| **Delivered (Actual)** | `orders` jeguloi delivered (return bad dile) | Asol revenue + asol profit |

Sob report e ei 3ta column pashapashi dekhabo: `Meta: 10 | Confirmed: 7 | Delivered: 6 | Return: 2`.

---

## 2) Database Schema (new tables)

Sob table `brand_id` scoped + RLS (admin/operations manage, others read).

1. **`mkt_ad_accounts`** — Meta ad account (`act_xxx`, name, currency, access_token_ref, status, last_sync_at).
2. **`mkt_campaigns`** — campaign meta (external_id, name, objective, status, daily_budget, start/stop).
3. **`mkt_adsets`** — adset (campaign_id, targeting summary, budget).
4. **`mkt_ads`** — ad (adset_id, creative name/thumbnail, status).
5. **`mkt_insights_daily`** — per-ad/day metrics (spend, impressions, clicks, reach, cpm, ctr, meta_purchases, meta_purchase_value, meta_leads). Unique: (ad_id, date).
6. **`mkt_campaign_products`** — N:N link `campaign_id ↔ product_id` with `weight` (default 1). Ekta campaign multi-product, ekta product multi-campaign.
7. **`mkt_order_attributions`** — `order_id → campaign_id (+ adset/ad optional)` with `source` enum (`utm`, `pixel`, `manual`, `product_link`, `phone_match`). `confidence` score. Unique (order_id).
8. **`mkt_manual_expenses`** — influencer/video/photoshoot/etc. (brand_id, date, amount, vendor, category enum: `influencer|content|photoshoot|agency|boost|other`, product_id nullable, campaign_id nullable, note, attachment_url). Auto-post to `erp_transactions` as expense.
9. **`mkt_tracking_events`** — website pixel events (session_id, utm_*, fbclid, event_type, product_id, phone, order_id nullable). Feeds attribution.
10. **`mkt_sync_log`** — sync job audit (account_id, kind, started_at, finished_at, status, error, rows).

All tables: `id uuid pk`, `brand_id`, `created_at`, `updated_at`, proper indexes on (brand_id, date), GRANTs (authenticated + service_role), RLS via `has_role`.

---

## 3) Meta Ads Integration

- **Auth**: Project-level `META_SYSTEM_USER_TOKEN` secret (already exists). Per-account override token thakte parbe table e.
- **Sync server functions** (`src/lib/erp/marketing/meta.functions.ts`):
  - `listMyAdAccounts()` — show Meta accounts available for connection.
  - `connectAdAccount(brandId, externalId)` — save to `mkt_ad_accounts`.
  - `syncStructure(accountId)` — pull campaigns/adsets/ads.
  - `syncInsights(accountId, since, until)` — pull daily insights per ad.
  - `disconnectAccount(accountId)`.
- **Cron** at `/api/public/cron.sync-marketing.ts` — every account er last 3 din rolling sync (Meta numbers retroactively update).
- Error logging in `mkt_sync_log`, UI te visible.

---

## 4) Order Attribution Engine

Ekta order kon campaign theke esheche eta resolve korar priority:

1. **UTM/fbclid match** — `mkt_tracking_events` te phone/session match kore order er sathe.
2. **Pixel purchase event** — website e checkout e fire kora event er sathe order_id link.
3. **Product link fallback** — order er products jodi `mkt_campaign_products` e map kora thake, weighted attribute.
4. **Manual override** — operator order drawer theke campaign select kore set korte parbe.

Output: `mkt_order_attributions` row per order. Confidence 0-1.

Website pixel tracker: `/api/public/mkt.tracker.js` (already exists pattern) + `/api/public/mkt.track` ingest endpoint.

---

## 5) Product ↔ Campaign Linking UI

- Campaign detail page e "Linked Products" section — search kore product add, weight set, remove.
- Product page e "Linked Campaigns" tab — reverse view.
- Bulk link dialog: ekta campaign e multiple product add ekbar e.

---

## 6) Manual Marketing Expense

- "Marketing Expenses" page — list + add dialog.
- Fields: date, amount, vendor, category, **product (optional)**, **campaign (optional)**, note, attachment.
- Save korle automatic `erp_transactions` te expense entry (category: "Marketing") + linked back via `source_id`.
- Product wise marketing cost e ei amount jog hobe.

---

## 7) Profit / ROAS / POAS Engine

DB function: `mkt_get_campaign_rollup(brand_id, from, to)` returns per campaign:

- `spend` (Meta insights + manual expense allocated to campaign)
- `meta_purchases`, `meta_revenue`
- `confirmed_orders`, `confirmed_revenue`
- `delivered_orders`, `delivered_revenue`, `return_orders`
- `cogs` (delivered orders er product cost from order_items)
- `courier_cost`, `gateway_fee` (proportional)
- `gross_profit = delivered_revenue - cogs - courier_cost`
- `net_profit = gross_profit - spend - allocated_manual_expense`
- `roas = delivered_revenue / spend`
- `poas = net_profit / spend`

Product wise rollup: `mkt_get_product_rollup` — same metrics but per product (using attribution + campaign-product weights + product expense allocations).

---

## 8) UI Pages (under `/erp/marketing`)

| Route | Purpose |
|---|---|
| `/erp/marketing` | Overview: spend, ROAS, POAS, top campaigns, sync health |
| `/erp/marketing/accounts` | Meta ad accounts connect/disconnect, sync status |
| `/erp/marketing/campaigns` | Campaign list with 3-layer metrics |
| `/erp/marketing/campaigns/$id` | Campaign detail: adsets, ads, daily chart, linked products, attributed orders |
| `/erp/marketing/products` | Product-wise marketing performance |
| `/erp/marketing/expenses` | Manual marketing expenses CRUD |
| `/erp/marketing/attribution` | Unattributed orders + manual map tool |
| `/erp/marketing/sync` | Sync log + manual trigger |

Sob page e brand switcher + date range picker.

---

## 9) Finance Integration

- Meta spend daily auto-post option: settings toggle → daily insight sync er por `erp_transactions` e ekta "Meta Ads — {Account}" expense entry create (idempotent per day per account).
- Manual expenses already posted (Section 6).
- `get_brand_profitability_rollup` update — marketing spend ekhon mkt tables theke o ashbe (manual allocations chara o).

---

## 10) Phases & Order

| # | Phase | Deliverable |
|---|---|---|
| 1 | DB schema + RLS + GRANTs + indexes | Migration |
| 2 | Meta API client + sync server fns | `meta.functions.ts`, `meta.server.ts` |
| 3 | Ad accounts connect UI + sync trigger | `/marketing/accounts` |
| 4 | Campaigns/adsets/ads list + detail | `/marketing/campaigns*` |
| 5 | Campaign ↔ product linking | UI + tables |
| 6 | Website tracker + attribution engine | tracker.js + ingest + resolver fn |
| 7 | Manual expenses CRUD + auto-post | `/marketing/expenses` |
| 8 | Rollup DB functions (campaign + product) | SQL |
| 9 | Overview dashboard + product-wise report | `/marketing`, `/marketing/products` |
| 10 | Cron + sync log UI + finance auto-post | cron route + settings |

Each phase er por test + confirm, tarpor next.

---

## Confirm Korar Jonno

1. **Plan approve?** Korle ami **Phase 1 (DB schema)** diye shuru korbo — migration tool diye review er jonno pathabo.
2. **Manual expense auto-post**: `erp_transactions` e jabe — default account hisebe "Marketing" category use korbo, na ki tumi prottek expense add korar shomoy account choose korte chao?
3. **Meta daily spend auto-post to Finance**: default **ON** rakhbo na **OFF** (settings theke toggle)?
4. **Pixel tracker**: website e script tag boshate hobe — eta ki ekhoni scope e, na ki shudhu UTM-based attribution diye start kori?

Approve dile Phase 1 shuru kori.
