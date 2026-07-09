# Phase 3 — Attribution Rework (Delta Plan)

Bro, existing `attribution.functions.ts` explore korlam — Phase 3 er 70% already ache. Duplicate na kore delta ta explicit kore dilam. Approve dile implement kore dry-run report dibo, tarpor tumi review kore push approve korba.

## Ki already ache (touch korbo na)

- Priority order: UTM → fbclid → phone → product_link (matches exactly Phase 3 P1/P2/P3 + bonus P4)
- Confidence scores: 0.95 / 0.85 / 0.65 / 0.40
- Guard: `mkt_upsert_order_attribution` RPC (Phase 0) — sob write ei RPC diyei jai, manual protect + confidence tie-breaker kaj kore
- `setManualAttribution`, `clearAttribution`, `listAttributionOrders` server fns — manual override backend ready
- Product auto-link idempotent

## Ki nai / weak — Phase 3 delta

### 1. Phone match e 24h window nai

Ekhon: `mkt_tracking_events` er latest matching row (no time bound). Phase 3 spec: order.created_at er 24h aage porjonto only. Fix: `resolveOne` phone branch e filter add — `created_at BETWEEN order.created_at - 24h AND order.created_at`.

### 2. Confidence tier labels + low-conf review gate nai

Ekhon: sob confidence auto-write hoy (even 0.40 product_link). Phase 3 spec: low → review queue, no auto-link.
Fix:

- Tier: high ≥0.85, medium 0.60–0.85, low <0.60
- Low-conf hits: write hobe na `mkt_order_attributions` e; boro dhora e new table `mkt_attribution_candidates` (order_id, suggested_campaign_id, source, confidence, created_at) e insert
- Order thakbe unattributed list e + candidate suggestion sathe dekhabe

### 3. Dry-run / preview nai

New server fn `previewBulkResolve(brandId, days)` — resolveOne logic run kore, but write kore na. Return: `{ scanned, would_attribute_high, would_attribute_medium, would_queue_low, would_flip_existing: [ {order_id, old_campaign, new_campaign, old_conf, new_conf} ] }`. Ei ta run kore tumi review korba, tarpor bulk apply approve.

### 4. Manual review + drag-drop UI (Unmatched Orders tab)

Ekhon: `attribution` route ache but plain list. Add:

- Toggle: "Unmatched" | "Low-conf candidates" | "Attributed"
- Row drag-drop → campaign column (calls existing `setManualAttribution`)
- Candidate row: "Accept suggestion" button = manual confirm = high conf write

## Files & migration

- **Migration**: create `mkt_attribution_candidates` table (id, order_id UNIQUE, brand_id, suggested_campaign_id nullable, source, confidence, matched_signal jsonb, created_at) + RLS (admin/ops read+write) + GRANT
- `**attribution.functions.ts**`: add 24h window; tier gating in `resolveOne`; new `previewBulkResolve`, `listAttributionCandidates`, `acceptCandidate`, `dismissCandidate` server fns
- `**erp.marketing.attribution.tsx**` (or its component): add candidate tab + drag-drop (use `@dnd-kit/core` — already installed check korbo)

## Constraints re-confirm

- `orders` table: read-only ✅
- Existing attributed rows: **kono bulk re-resolve auto-run hobe na** — dry-run only, apply toggle behind explicit button after your review
- Phase 4a backlog tracking: `dashboard.functions.ts` / `campaigns.functions.ts` / `sku-pnl.functions.ts` ke `getMetaSpendBdt` RPC te migrate — tracked, drop korchi na, Phase 4a te explicit korbo ✅

## Delivery sequence

1. Migration (candidates table) — approve chao
2. Backend: 24h window + tier gate + preview fn
3. Run `previewBulkResolve` on your main brand, report flip count + example rows
4. Tumi review kore approve → bulk apply
5. UI (candidate tab + drag-drop) — separate push

Approve? Naki kono tier threshold / 24h → 48h type adjustment chao?  


---

**Phase 3 approved — proceed with delta plan. 2 additions before/with the preview report:**

1. **Migration**: Create `mkt_attribution_candidates` table (id, order_id UNIQUE, brand_id, suggested_campaign_id nullable, source, confidence, matched_signal jsonb, created_at) + RLS (admin/ops read+write) + GRANT. Proceed.
2. **Backend delta**:
  - Phone match: add 24h window filter (`created_at BETWEEN order.created_at - 24h AND order.created_at`)
  - **Before hardcoding 24h**: query existing phone-matched attributions' actual gap-time (ad-click → order-create). Report median and p90 gap in the preview report. Amar business COD-heavy, high-value items e decision time beshi lagte pare — jodi p90 24h theke onek beshi hoy, flag koro, ami 48h e extend korte pari.
  - Tier gating in `resolveOne`: high ≥0.85, medium 0.60–0.85, low <0.60. Low-conf → write to `mkt_attribution_candidates`, NOT to `mkt_order_attributions`.
  - New server fns: `previewBulkResolve`, `listAttributionCandidates`, `acceptCandidate`, `dismissCandidate`
3. **Existing low-confidence rows**: `mkt_order_attributions`-e already-written 0.40-confidence (product_link) rows-er ki hobe under new tier gate — auto-demote/move to candidates table? Report the count in preview, but **do NOT auto-apply retroactive changes**. Just propose.
4. `previewBulkResolve(brandId, days)` **report must include:**
  - `scanned`, `would_attribute_high`, `would_attribute_medium`, `would_queue_low`
  - `would_flip_existing` (order_id, old_campaign, new_campaign, old_conf, new_conf)
  - Phone-match gap-time distribution (median/p90)
  - Existing low-conf row count + retroactive demote proposal (count only, not applied)

**Constraints unchanged:**

- Orders table: read-only
- No bulk re-resolve auto-applied — dry-run only until I explicitly approve apply
- Phase 4a backlog (RPC migration for dashboard/campaigns/sku-pnl functions) — tracked, bundle with Phase 4a

**Delivery sequence**: Migration → backend (24h + tier gate + preview fn) → run preview on main brand → report back with full stats above → I review → approve bulk apply → then UI (candidate tab + drag-drop) as separate push.

Threshold values (0.85/0.60) confirmed, no change needed. Proceed with migration first.

&nbsp;