## Goal
Order list (Web Orders + main Order List) er protita order e useful tag automatically boshbe, color coded thakbe, ar tag onujayi filter kora jabe.

## Auto-tags (computed on-the-fly, no DB change needed)

| Tag | Condition | Color |
|---|---|---|
| 🆕 New | Customer er ager kono order nai | sky |
| 🔁 Repeat | 2-4 ager order achhe | violet |
| ⭐ VIP | 5+ successful delivery | amber/gold |
| ⚠️ Risky | Courier cancel/return rate > 30% (min 3 order) | rose |
| 🚫 Fraud Risk | 5+ cancelled, 0 success | red |
| 💰 High Value | Order total ≥ ৳5000 | emerald |
| 📦 Bulk | 3+ items OR total qty ≥ 5 | indigo |
| 📞 No Response | call_attempt_count ≥ 3 | orange |
| 🕐 Stale | processing/incomplete tab e 24h+ | yellow |
| 🏙️ Outside Dhaka | shipping_city ≠ Dhaka | slate |
| 🎁 Has Note | customer_note thakle | pink |

Existing manual tags (database `tags` column) o pashapashi dekhabe.

## UI changes

**Web Orders page (`erp.orders.web.tsx`)**:
1. Per-row `computeAutoTags(row, breakdown, courier)` function — already-loaded data theke derive korbe, kono notun query nai.
2. Tags column e auto-tags + manual tags ekshathe render — chip e icon + label, hover e tooltip with reason.
3. Row left-border color most-critical tag (Fraud > Risky > VIP > Repeat > New) theke.
4. Status tab row er nichey ekta tag filter bar — multi-select chips. Selected hole rows filter hobe client-side.
5. "Repeat", "VIP", "Risky" 3ta quick-filter button shob shomoy visible — count badge soho.

**Main Order List (`orders-table.tsx`)**:
- Same `computeAutoTags` helper share — ekta common file e (`src/lib/erp/order-tags.ts`).
- Existing tags cell e auto-tags add hobe (manual tags er age).
- Same row left-border accent.

## Technical layout

```
src/lib/erp/order-tags.ts
  - type AutoTag = { key, label, icon, color, priority, reason }
  - computeAutoTags(row, customerBreakdown, courierBreakdown) → AutoTag[]
  - tagPriority() → highest priority tag for row accent

src/components/erp/orders/auto-tag-chips.tsx
  - <AutoTagChips tags={...} max={3} />
  - tooltip with reason on hover

src/components/erp/orders/tag-filter-bar.tsx
  - chip multi-select with counts
  - controlled by parent state
```

Then wire both Web Orders + Order List pages to use these.

## Out of scope (next iteration)
- Persisting computed tags in DB
- Manual tag editor / blacklist management UI
- Auto-rule triggers (e.g. auto-cancel fraud)
- Analytics dashboard by tag

Confirm korle implement kora shuru kori. Kichu tag baad dite chaile ba notun add korte chaile bolun.
