# Marketing + Meta Spend Module — Clean Rebuild Plan

## Somossa ki (ekhon ja ache)

Ekhon Marketing module e onek jinis scattered:

- **Duita spend calculation path** — `spend_bdt` (flat FX) + `spend_bdt_fifo` (FIFO), duita e mismatch
- **FIFO consumption logic incomplete** — dollar purchase kora hoy, but ad spend er sathe automatic consume hoy na consistently
- **P&L te Meta cost thik moto dhoke na** — dashboard e ek number, finance e arek number
- **Attribution unreliable** — order↔campaign link auto-resolve kore, kintu 290+ unmatched
- **UI te 8-10 ta page** (accounts, campaigns, expenses, rollup, sync, meta-reports, sku-pnl, ad-account-funding, dollar-purchase, attribution) — user confused kon page e ki
- **Multiple expense entry points** — manual expenses, dollar purchase, ad wallet, direct — kon ta kobe use korbe unclear

## Goal (ki chai)

Ekta jinis: **"Ami ad e joto BDT khoroch korchi, seta accurate P&L te dhukbe, per-brand per-day per-campaign per-SKU dekhte parbo."**

## Approach — 4 Phase

### Phase 1: Foundation clean (Meta Spend → BDT conversion)

**Kaj:**

- FIFO ke single source of truth banano. `spend_bdt` (flat FX) column deprecate.
- Dollar purchase → FIFO lot → daily spend consumption ei chain ta atomic + reliable kora
- Ekta clean RPC: `get_meta_spend_bdt(brand_id, from, to)` — jekhane use hobe shob jaygay ei function call kore

**Deliverables:**

- 1 migration: `spend_bdt` column drop, FIFO consumption trigger fix, RPC create
- 1 file: `src/lib/erp/marketing/meta-cost.functions.ts` — shob spend read hobe ei theke

### Phase 2: Simplified UI (10 page → 4 page)

**Notun structure:**

```text
/erp/marketing/
├── overview       — Dashboard (spend, revenue, ROAS, profit per brand)
├── spend          — Ad Spend Log (dollar purchase + wallet + daily spend, ekta page)
├── campaigns      — Campaigns + per-campaign P&L (SKU rollup expandable)
└── settings       — Ad accounts, brand mapping, sync config
```

**Ja delete/merge hobe:**

- `accounts` + `ad-account-funding` + `dollar-purchase` → `spend` page e merge
- `expenses` + `sync` + `meta-reports` → `overview` er tab
- `rollup` + `sku-pnl` → `campaigns` er inline view
- `attribution` → `campaigns` er "unmatched orders" tab

### Phase 3: Attribution rework (reliable order↔campaign link)

**Notun logic:**

- UTM parameters priority 1
- Facebook click ID (fbclid) priority 2
- Phone number + time window (order create 24h er modhe ad click) priority 3
- Manual override option (admin dashboard e drag-drop)

**Rule:** Auto-resolve confidence score dibe (high/medium/low). Low confidence hole manual review queue e jabe, auto-link kora na.

### Phase 4: Finance integration (P&L accuracy)

**Kaj:**

- `erp_transactions` te ad spend entry auto-post hobe (FIFO BDT amount)
- Ekta expense category: "Meta Ads" — per brand track
- Product profitability page e ei accurate cost dekhabe
- Daily/monthly P&L report e "Ad Spend" ekta clean line item hobe

---

## Order System Safety

**Order table e SHUNNO change hobe.** Shudhu:

- `orders.id`, `orders.brand_id`, `orders.total`, `orders.created_at` — read only
- Order create/update/courier/inventory flow er kono line touch kora hobe na
- Prottek phase er por tumi order create test korbe, kichu break hoyeche kina confirm korbe

## Execution Order

1. **Phase 1 first** (2-3 din er kaj) — eta done hole tumi accurate spend number dekhbe
2. Phase 1 test + approve → **Phase 2** (UI cleanup, 2 din)
3. Phase 2 approve → **Phase 3** (attribution, 1-2 din)
4. Phase 3 approve → **Phase 4** (finance integration, 1 din)

**Prottek phase alada approval nibo.** Ek dhakay shob korbo na.

## Technical Notes

- Purano data delete korbo na, migration reversible thakbe
- `mkt_manual_expenses`, `mkt_insights_daily`, `meta_dollar_purchases` — schema mostly same, shudhu clean up
- Notun `.functions.ts` file, purano gulo phase e phase e deprecate
- Types.ts regenerate hobe prottek migration er por

## Ki dorkar tomar theke

1. **Approval** — ei plan e agree?
2. **Priority confirm** — Phase 1 (Meta Spend accuracy) diye shuru korbo?
3. **Data question** — purano dollar purchase / FIFO lot data ki rakhbo, na fresh start korbo?  
  
**Order first**: Notun sequence follow koro — race condition fix (mkt_order_attributions) → Phase 1 → Phase 4a (aggregate P&L only) → Phase 2 → Phase 3 → Phase 4b (SKU-level profitability). Original doc-er 1-2-3-4 sequential order na, eta follow koro.
4. **Race condition first**: Shuru korar age `mkt_order_attributions` table-er race condition ta explain koro — kothay ache, ki cause korche, fix ki hobe. Amake confirm korte dao age, tarpor code e hat dao.
5. **Phase 1 reconciliation mandatory**: Migration + RPC deploy korar por, purano `spend_bdt` (flat FX) vs notun FIFO-based number — duita compare kore ekta summary dao (kotota % difference, kon date range e koto gap). Eta na dile Phase 1 "done" bolo na.
6. **No data loss**: Purano dollar purchase records, FIFO lot data — kichu delete/overwrite hobe na. Migration fully reversible thakte hobe. Fresh start na, existing data preserve.
7. **Order table untouched**: Shudhu read-only access — `orders.id`, `brand_id`, `total`, `created_at`. Kono order flow logic touch korle age explicit bolo, amar approval lagbe.
8. **Per-phase stop**: Prottek phase complete hole code push/merge korar age amake summary dao — ki change hoise, ki test kora hoise, ki risk ache. Amar approval na paile next phase e jeyo na.