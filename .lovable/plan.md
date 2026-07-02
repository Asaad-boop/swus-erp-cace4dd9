## Incomplete Orders — Advanced Upgrade

Ekta full feature-set boshabo. 3 phase e delivery, protita self-contained shipping unit.

---

### Phase 1 — Table upgrade (advanced filters + bulk actions)

**Advanced filters bar** (existing search er pashe):
- Date range picker (advanced variant — presets sidebar, typeable From/To, 2-month calendar — same as marketing date picker)
- Subtotal min/max (৳)
- Last step multi-select: cart / shipping / checkout
- City multi-select (distinct list from data)
- Item count range (1–20+)
- Follow-up status: not-sent / sent / responded (new column)

**Bulk actions** (row checkbox + header checkbox):
- Bulk delete (with confirm)
- Bulk WhatsApp send (opens template preview → sends to all selected)
- Bulk SMS send
- Bulk mark "contacted"
- Bulk convert (only for rows with valid phone+address)
- Bulk export CSV

**Row-level quick actions** (icon toolbar):
- WhatsApp icon → opens `wa.me/<phone>?text=<template>` in new tab (client-side, no API cost)
- SMS icon → server fn call to send via chosen provider
- Copy phone/address
- View cart items (expand row)

---

### Phase 2 — WhatsApp/SMS recovery infrastructure

**DB additions:**
- `abandoned_carts.followup_status` enum: `pending | sent | responded | ignored`
- `abandoned_carts.followup_sent_at` timestamp
- `abandoned_carts.followup_count` int (0–3)
- `abandoned_carts.last_followup_channel` text (`whatsapp | sms | manual`)
- `abandoned_cart_messages` table (history: id, cart_id, channel, template, message_body, sent_at, sent_by, delivery_status)
- `abandoned_cart_templates` table (id, brand_id, name, channel, body with `{{name}} {{cart_total}} {{brand}}` placeholders)

**Server fns:**
- `sendCartRecoveryMessageFn` — takes cart_id + template_id + channel; renders template, sends via SMS provider or logs WhatsApp click-to-send URL, inserts into messages table, updates cart status
- `listCartMessagesFn` — history for a cart
- `manageTemplatesFn` — CRUD for templates

**SMS provider:** Ask user which BD provider (SSL Wireless / Alpha Net / bulkSMSbd) — for now scaffold with generic HTTP client + `SMS_API_URL` + `SMS_API_KEY` secrets. WhatsApp shall be click-to-send `wa.me` link (no API cost, works instantly).

**Settings page tab:** `/erp/settings` → "Cart Recovery" tab
- Template editor (per brand)
- SMS provider config
- Auto follow-up toggle + rules (1h/6h/24h)

---

### Phase 3 — Auto follow-up cron + Reports page

**Cron endpoint** `/api/public/cron/cart-recovery-followup`:
- Runs every 30 min
- Finds unconverted carts with valid phone where:
  - `followup_count = 0` AND `updated_at < now() - 1h` → send 1st reminder
  - `followup_count = 1` AND `last_followup_sent_at < now() - 6h` → send 2nd
  - `followup_count = 2` AND `last_followup_sent_at < now() - 24h` → send 3rd (final)
- Only when settings toggle is enabled per brand
- pg_cron schedule: `*/30 * * * *`

**Reports page** at `/erp/orders/incomplete-reports` (last 30 days default, date picker for custom):
- **KPI cards:**
  - Total incomplete carts
  - Converted (auto + manual) count + recovery rate %
  - Lost revenue (৳) — sum of unconverted subtotals
  - Recovered revenue (৳) — sum of converted subtotals
  - Avg cart value
  - Messages sent count + response rate
- No charts / funnels / top products (user selected KPIs only)
- Brand-scoped (respects current brand filter)
- Export button (CSV of daily breakdown)

---

### Technical notes

```text
src/
├── routes/_authenticated/
│   ├── erp.orders.incomplete-reports.tsx       (new — Phase 3)
│   └── erp.settings.tsx                        (add "Cart Recovery" tab — Phase 2)
├── components/erp/orders/
│   ├── incomplete-orders-table.tsx             (upgrade — Phase 1)
│   ├── incomplete-filters-bar.tsx              (new — Phase 1)
│   ├── incomplete-bulk-actions.tsx             (new — Phase 1)
│   ├── send-recovery-dialog.tsx                (new — Phase 2)
│   └── cart-messages-history.tsx               (new — Phase 2)
├── components/erp/settings/
│   └── cart-recovery-settings.tsx              (new — Phase 2)
├── lib/erp/
│   ├── abandoned-carts.functions.ts            (extend)
│   ├── cart-recovery.functions.ts              (new — Phase 2)
│   └── incomplete-reports.functions.ts         (new — Phase 3)
└── routes/api/public/
    └── cron.cart-recovery-followup.ts          (new — Phase 3)
```

DB migrations: 2 total (Phase 2 schema; Phase 3 pg_cron schedule via insert tool).

---

### 2 tini din-of clarifications

1. **"Other" advanced feature** — kichu specific chaao ki? (e.g. cart items expand row, customer purchase history link, priority scoring by cart value, duplicate cart detection)
2. **SMS provider** — kon service use korbo? (SSL Wireless / bulkSMSbd / Alpha Net / onno kichu) — na thakle WhatsApp click-to-send diye shuru kori, SMS pore add korbo.
3. **Delivery order** — Phase 1 (filters+bulk) prothome ship kori, tarpor 2, tarpor 3? Naki ekshate?

Confirm korle shuru kori.
