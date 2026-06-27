
## Recommendation: Hybrid CAPI (best of both)

Website browser pixel theke PageView/ViewContent/AddToCart fire korbe (real-time, user behavior). **Purchase event ERP server theke CAPI te pathabe** — karon:
- ERP e order confirmed/paid status authoritative (refund/return handle hoy)
- Browser blocked (adblock, iOS) hole o Purchase event miss hobe na
- `event_id` diye dedup — same event browser pixel o server CAPI duitai pathale Meta automatic merge kore
- Result: ROAS data 30-40% beshi accurate

## Scope (4 items confirmed)

### 1. Per-brand Pixel + CAPI config
**New page**: `/erp/settings/tracking` (brand-scoped)
- Per brand (Hobbyshop / Toyora) alada row:
  - Meta Pixel ID
  - CAPI Access Token (secret, masked input)
  - Test Event Code (optional, for debugging)
  - Domain verification status
  - Enable/Disable toggle per event type (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase)
- Save via `setBrandTrackingConfig` server fn → `app_settings` key `tracking:meta:{brand_id}`
- Tokens stored in secrets (`META_CAPI_TOKEN_HOBBYSHOP`, `META_CAPI_TOKEN_TOYORA`)

### 2. Live status / health dashboard
Top of same page:
- Per brand KPI cards: Last event time, Events today, Match quality score, Error count (24h)
- Pulled from new `meta_capi_log` table (server fn logs every send)
- Color: green (<5min ago), amber (<1h), red (>1h or errors)

### 3. UTM capture & attribution view
- Web orders e already `attribution` jsonb ache — verify utm_source/medium/campaign/content/term + fbclid/fbc/fbp capture hocche kina
- New tab in `/erp/marketing/attribution`: brand filter + UTM breakdown table (source/medium → orders, revenue, AOV)
- Top campaigns by brand (last 7/30 days)

### 4. Test event sender + CAPI ping
- "Send Test Event" button per brand → server fn `sendCapiTestEvent`
- Fires `TestEvent` to Meta CAPI with current config + test_event_code
- Shows response: ✅ events_received:1 or ❌ error message + invalid params
- "Verify Pixel" button → opens Meta's Pixel Helper docs link with brand pixel id pre-filled

## Server-side Purchase CAPI (the firing part)

- New server fn `sendOrderPurchaseToCapi(orderId)` 
- Auto-trigger: when order transitions to `paid`/`delivered` status (hook into existing `transition_order_status` flow via DB trigger calling pg_net, OR via existing order update mutation in ERP)
- Payload includes: hashed email/phone, fbp/fbc from `attribution`, order value (BDT→USD via existing fx rate), event_id = order_id (for dedup with browser pixel)
- Logs to `meta_capi_log` table for status dashboard

## Database

New tables:
- `meta_tracking_config` (brand_id, pixel_id, capi_enabled, test_event_code, enabled_events jsonb, updated_at) — token in secrets
- `meta_capi_log` (id, brand_id, event_name, event_id, status, response jsonb, error, created_at) + index on (brand_id, created_at DESC)

## Files to create/modify

**New:**
- `supabase/migrations/*_meta_tracking.sql` (2 tables + RLS + GRANT)
- `src/lib/erp/tracking/meta-capi.functions.ts` — `getBrandTrackingConfig`, `saveBrandTrackingConfig`, `sendCapiTestEvent`, `sendOrderPurchaseToCapi`, `getCapiStatus`, `getUtmBreakdown`
- `src/lib/erp/tracking/meta-capi.server.ts` — actual fetch to `graph.facebook.com/v21.0/{pixel}/events`, SHA-256 hashing helpers
- `src/routes/_authenticated/erp.settings.tracking.tsx` — main UI (config + status + test)
- `src/components/erp/settings/tracking/` — brand-config-card, status-strip, test-event-button, utm-breakdown-table

**Modify:**
- `src/components/erp/erp-sidebar.tsx` — Settings sub-link "Tracking & Pixels"
- `src/routes/_authenticated/erp.marketing.attribution.tsx` — add brand filter + UTM breakdown tab
- Order paid transition handler — call `sendOrderPurchaseToCapi` async

## Secrets needed

- `META_CAPI_TOKEN_HOBBYSHOP`
- `META_CAPI_TOKEN_TOYORA`

(User add korbe via add_secret tool when ready)

## Out of scope (ask later if needed)

- GA4 server-side / Measurement Protocol
- TikTok Events API (separate phase)
- Browser pixel snippet injection in Hobbyshop/Toyora websites (already there ba alada repo te — ekhane shudhu ERP side)
