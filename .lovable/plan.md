## Goal

`/erp/settings` route ke complete VS Code-style settings hub baniye dewa — left sidebar (10 sections) + right content panel, existing tables er upor wired, admin-gated sensitive fields.

## Architecture

```
src/routes/_authenticated/erp.settings.tsx          (shell + left nav + section router)
src/components/erp/settings/
  ├── settings-shell.tsx                            (layout, unsaved-warning, role gate)
  ├── sections/
  │   ├── business-profile.tsx                      (per-brand)
  │   ├── brands.tsx                                (list/add/edit/default)
  │   ├── invoice-orders.tsx                        (per-brand, reuses invoice-settings.tsx)
  │   ├── courier.tsx                               (per-brand, reuses pathao/steadfast settings)
  │   ├── finance.tsx                               (per-brand erp_finance_settings)
  │   ├── notifications.tsx                         (app_settings JSON)
  │   ├── integrations.tsx                          (meta accounts + gemini/lovable keys + webhooks)
  │   ├── users-permissions.tsx                     (profiles + user_roles + user_brand_access)
  │   ├── data-system.tsx                           (exports, activity_logs, system info)
  │   └── danger-zone.tsx                           (admin only, typed-confirm modal)
  └── masked-secret-input.tsx                       (password + eye toggle, admin-only render)
```

State per section: own React Query + own "Save" button. Unsaved tracking via `dirty` ref per section; warning on nav-away via `useBlocker`.

## Data Mapping (existing tables, no schema breaks)


| Section             | Reads / Writes                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Business Profile    | `brands` (name, logo_url, slug) + `app_settings` key `business_profile:<brand_id>` (address, phone, email, trade_license, tin_vat, socials)      |
| Brands              | `brands` table CRUD; default brand → `app_settings.default_brand_id`                                                                             |
| Invoice & Orders    | `erp_settings` (invoice_prefix, footer, default_status, auto_confirm, cod_fee, return_window) per `brand_id`                                     |
| Courier             | `erp_courier_settings` (existing); test buttons → existing `pathao.functions.ts` / `steadfast.functions.ts`                                      |
| Finance             | `erp_settings` (extend rows with finance JSON column, or app_settings key `finance:<brand>`) — uses existing tables only                         |
| Notifications       | `app_settings` key `notifications:<brand_id>` JSON                                                                                               |
| Integrations        | `mkt_ad_accounts` (existing), `app_settings` keys `gemini`, `lovable_ai`, `webhook_inbound`                                                      |
| Users & Permissions | `profiles` (list), `user_roles` (role CRUD), `user_brand_access` (brand mapping CRUD) — all admin-only via existing `has_role`                   |
| Data & System       | Server fns: `exportOrdersCsv`, `exportProductsCsv`, `exportFinanceCsv` (per brand); `activity_logs` last 100; system info from `import.meta.env` |
| Danger Zone         | Admin-only; type "DELETE" confirm; calls new server fns `clearTestData`, `resetSettings` (both gated by `has_role('admin')`)                     |


**Naya server functions** (sob `requireSupabaseAuth` + admin check):

- `src/lib/erp/settings/business-profile.functions.ts` — get/save per-brand profile JSON
- `src/lib/erp/settings/notifications.functions.ts` — get/save notifications JSON
- `src/lib/erp/settings/integrations.functions.ts` — get/save Gemini/Lovable/webhook keys (writes to env-backed secrets table or `app_settings` encrypted column; values masked on read for non-admin)
- `src/lib/erp/settings/users.functions.ts` — list profiles+roles+brand_access, invite, set role, set brand_access, deactivate
- `src/lib/erp/settings/exports.functions.ts` — CSV exports per brand
- `src/lib/erp/settings/danger.functions.ts` — clear test data, reset settings (admin-gated)

**Test connection buttons** — reuse existing server fns:

- Pathao: existing `testPathaoConnection` (or call `pathao.functions.ts` lookup with current creds)
- Steadfast: existing test fn in `steadfast.functions.ts`
- Meta: existing `meta.functions.ts` health check

## Security

- `useUserRole()` hook (new, wraps `has_role` RPC via server fn) — section components check before rendering sensitive fields
- `<MaskedSecretInput>` — only renders actual value if `role === 'admin'`; otherwise shows `••••••••` + "Admin only"
- All API key writes go through admin-gated server fns; client never touches service tokens directly
- Sensitive table reads (mkt_ad_accounts, erp_courier_settings) already restricted by RLS to admin (done in Tier 1)

## Sections needing manual setup (will be flagged in summary)

- Gemini / Lovable AI keys — stored as runtime secrets, not in DB; UI will say "Set via Lovable Cloud secrets" if not configured
- Webhook secret — auto-generated on first save
- DB backup export — Supabase doesn't expose this via SDK; UI will link to Supabase dashboard

## Out of scope (kept as-is)

- UI of existing `business-settings.tsx`, `courier-mapping-settings.tsx`, `invoice-settings.tsx`, `pathao-settings.tsx`, `steadfast-settings.tsx` components — reused, not rewritten
- No DB schema changes except optional `app_settings` rows (existing key/value table)
- No changes to courier sync logic, finance posting logic, or marketing sync logic

## Build order

1. Shell + left nav + role hook + masked input
2. Sections 1-4 (Business, Brands, Invoice, Courier) — wire to existing tables/components
3. Sections 5-7 (Finance, Notifications, Integrations)
4. Section 8 (Users & Permissions) + new server fns
5. Sections 9-10 (Data/System + Danger Zone)
6. Unsaved-changes blocker + per-section save buttons
7. Smoke test each section as admin and as non-admin

## Deliverable summary (after build)

Per-section status table: ✅ wired / ⚠️ needs secret setup / 🔒 admin-only / 📋 manual data entry required.

---

**Confirm korben?** Ekta bishesh prosno:

**Finance & Notifications settings** kothay store korbo? Dui option:

- **(A)** `app_settings` table-e key-value JSON (`finance:<brand_id>`, `notifications:<brand_id>`) — no schema change, simple
- **(B)** Notun `erp_finance_settings` + `erp_notification_settings` tables — typed columns, cleaner queries, ekta migration lagbe

Default-e Option **A** dhore agacchi (no schema change, faster). Option B chaile bolun.  
**Option A** — `app_settings` key-value JSON। No migration, faster।

Build করো। ✅