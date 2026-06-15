# Marketing Module Upgrade — Meta Ads Integration & Sync

## Goal
Marketing section kaaj korche but several gap ache:
- Meta token setup er kono UI guide nai
- Settings save korar UI nai (backend ready, frontend missing)
- Insights sync manual trigger korar option nai (shudhu auto cron)
- Date range filter nai, disconnect/deactivate option nai
- Dashboard hard-error dey jokhon service role key missing

Eta sob fix kore proper "Meta Ads Integration + Sync + Settings" experience banabo.

## Scope

### 1. New tab: **Settings** (`/erp/marketing/settings`)
Ekta dedicated settings page jekhane:
- **Meta integration status** card: `META_SYSTEM_USER_TOKEN` secret set ache kina dekhabe (server-side check); na thakle step-by-step Bangla guide diye dekhabe kothay paowa jay (Meta Business → System Users → token generate)
- **Auto-sync toggle** (`auto_sync_enabled`) — every 30 min cron run hobe ki na
- **Auto-create expenses toggle** (`auto_create_expenses`) — sync er somoy ERP transaction auto banabe ki na
- **Default expense account** dropdown (erp_accounts theke)
- **Default expense category** dropdown (erp_expense_categories theke; ba "Marketing — Meta Ads" auto-create)
- **Attribution mode** select: weighted / equal_split / revenue_proportional
- Save button → existing `saveMarketingSettings` call

### 2. Accounts page improvements
- "Sync Insights" button add (current shudhu campaigns sync ache) — last 7 days insights pull korbe
- "Disconnect" action (soft) — `is_active=false` toggle, badge update
- Empty state e Meta token missing hole inline warning + Settings link

### 3. Dashboard improvements
- **Date range presets**: 7d / 30d / 90d / custom (since-until)
- KPI cards already ache — extra hint add (purchases count, avg ROAS)
- Graceful empty/error state — service role key missing hole friendly message + Settings link (currently red destructive banner; better copy)
- Top 5 campaigns mini-table (spend desc) niche

### 4. Campaigns page improvements
- Filter: status (ALL / ACTIVE / PAUSED), ad account dropdown
- Date range share with dashboard (URL search params)
- Sort by spend / ROAS

### 5. Server-side additions
- `disconnectAdAccount` server fn — soft deactivate
- `getMetaIntegrationStatus` server fn — token present check + simple `/me` ping (returns ok/error)
- `syncMetaInsights` already ache, expose via UI button

## Out of Scope (ekhon korbo na)
- Google Ads / TikTok integration (UI e "coming soon" label thakbe)
- Manual ad-set / ad level drill-down (campaign level e thakbo)
- Ad creative preview
- Multi-token per brand (single system user token global)

## Technical Details

**Files to edit:**
- `src/routes/_authenticated/erp.marketing.tsx` — add "Settings" tab
- `src/routes/_authenticated/erp.marketing.index.tsx` — date range, top campaigns, better error
- `src/routes/_authenticated/erp.marketing.accounts.tsx` — sync insights + disconnect buttons + token status banner
- `src/routes/_authenticated/erp.marketing.campaigns.tsx` — filters + sort
- `src/lib/erp/marketing/marketing.functions.ts` — add `disconnectAdAccount`, `getMetaIntegrationStatus`

**Files to add:**
- `src/routes/_authenticated/erp.marketing.settings.tsx`
- `src/components/erp/marketing/meta-status-card.tsx`
- `src/components/erp/marketing/sync-insights-button.tsx`

**DB:** No migration needed — `marketing_settings` table already has all required columns.

**Secret reminder:** `META_SYSTEM_USER_TOKEN` add kora lagbe — Settings page e prominently dekhabo. `SUPABASE_SERVICE_ROLE_KEY` / `ADMIN_SERVICE_ROLE_KEY` fallback already ache.
