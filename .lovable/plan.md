
# Cross-Brand Product Sharing — Toyra ↔ Hobishop

Ekhon `products` table e ekta product ekta `brand_id` er sathe tightly bound. Toyra-r product Hobishop e sell korte gele duplicate banate hocche → stock, cost, review, image sob split hoye jay. Amra ekta clean "shared catalog + per-brand listing" pattern banabo, jekhane **product = single source of truth (inventory + cost)** ar **listing = per-brand shop face (price, active, slug, override title/image)**.

## Core concept

```text
products (physical SKU, stock, cost)          ← owner_brand_id (who created/stocks it)
   │
   └── product_brand_listings (M:N)           ← per-brand: price, is_active, slug, title_override, image_override
           ├── Toyra listing     (৳1,200, active)
           └── Hobishop listing  (৳1,350, active)
```

Ekta product 1..N brand e list hote pare. Stock shared — Toyra 1 unit sell korle Hobishop-eo stock kome. Cost/COGS/reorder single product theke ashbe. Public website (Toyra/Hobishop) nijer listing dekhabe with own price + slug.

## Step 1 — Schema (migration)

New table `product_brand_listings`:
- `id uuid pk`
- `product_id uuid → products.id`
- `brand_id uuid → brands.id`
- `price numeric` (override; null → fallback to `products.price`)
- `compare_at_price numeric null`
- `slug text` (brand-scoped unique — allows different slug per brand)
- `title_override text null`, `image_override text null`, `description_override text null`
- `is_active bool default true`
- `display_order int default 0`
- `created_at`, `updated_at`
- Unique: `(product_id, brand_id)` and `(brand_id, slug)`

Products table:
- `brand_id` → rename intent to `owner_brand_id` (physical stock owner). Keep column name to avoid breaking 100+ files; treat semantically as "primary/owner brand".
- Add helper view `v_brand_catalog` = listings joined with product data, resolved fields (COALESCE overrides).

Backfill: for every existing product, auto-create ekta listing row for its current `brand_id` with `price = products.price`, `slug = products.slug`, `is_active = products.is_active`.

RLS + GRANTS: authenticated full CRUD (scoped by brand access in policy using `user_brand_access`), anon SELECT where `is_active = true` (public website reads).

## Step 2 — Inventory UI (ERP)

`src/routes/_authenticated/erp.inventory.tsx` + `product-edit-dialog.tsx`:
- Product form e notun section: **"List on brands"** — multi-select checkbox (Toyra / Hobishop / …), prottek ta te collapsible row: price override, slug, active toggle, title/image override.
- Default: owner brand auto-listed with product-level price.
- Inventory list: brand switcher e "Toyra" select korle Toyra-r listing gulai dekhabo (owner + shared). Ekta badge dekhabo: `Shared with Hobishop` jodi 2+ brand e listed.

Query change: `useInventoryQuery` `.eq("brand_id", ...)` er bodole join `product_brand_listings` diye `brand_id IN (...)`. Owner brand column alada dekhabe.

## Step 3 — Order creation

`erp.orders.new.tsx` line 150/339 e `.eq("brand_id", effectiveBrandId)` → listing table diye product lookup. Order create hole:
- `orders.brand_id = effectiveBrand.id` (which storefront sold it — for P&L/marketing attribution)
- `order_items.product_id` = shared product id
- Stock decrement holo shared product theke (already product-level, kono change lage na)

## Step 4 — Public website

Toyra/Hobishop storefront (jodi ei repo tei thake ba alada) `products` table theke pore. Change: read `product_brand_listings` where `brand_id = current_storefront_brand AND is_active`. COALESCE(listing.price, product.price), listing.slug, etc. SEO/OG data listing-scoped.

## Step 5 — Reports & scoping

- **Sales/Revenue per brand**: already `orders.brand_id` diye split — kaj korbe.
- **Inventory value**: single product, so owner brand er under. Alternative: split by "which brand sold last N units" — over-engineering, ekhon skip.
- **Cost/COGS**: shared, product-level — no change.
- **Marketing attribution**: `orders.brand_id` diye — no change.

## Step 6 — Edge cases

- Product delete: cascade delete listings.
- Brand access: user jodi shudhu Toyra e access rakhe, Hobishop-only product edit korte parbe na, but Toyra listing manage korte parbe (RLS scoped).
- Slug conflict: `(brand_id, slug)` unique — same slug duita brand e allowed, ekta brand er moddhe unique.
- Existing duplicate products (jodi already Toyra + Hobishop e same product duplicate kora thake): manual merge tool later — ekhon scope er baire.

## Files to touch

**New:**
- Migration: `product_brand_listings` table + backfill + RLS + grants + `v_brand_catalog` view
- `src/components/erp/inventory/brand-listings-editor.tsx` — reusable multi-brand editor
- `src/hooks/erp/use-product-listings.ts` — query/mutate listings

**Edit:**
- `src/hooks/erp/use-inventory-query.ts` — read via listings
- `src/components/erp/inventory/product-add-dialog.tsx` + `product-edit-dialog.tsx` — listings section
- `src/routes/_authenticated/erp.orders.new.tsx` — product lookup via listings
- Public storefront pages (jodi ei repo te thake — kon route bolo)

## Verification

1. Toyra brand e ekta product create → auto ekta Toyra listing → visible on Toyra shop only
2. Same product e "Also list on Hobishop" tick + price override → Hobishop shop e dekha jabe with own price + slug
3. Toyra theke 1 unit sell → shared stock kombe → Hobishop stock-eo kombe
4. Orders report: Toyra order Toyra revenue e, Hobishop order Hobishop revenue e
5. User with Toyra-only access can't edit Hobishop-only listing

## Open questions

1. Public storefront (Toyra/Hobishop website) ki ei same repo te ache, na alada project? Alada hole schema + API contract dibo, oi repo alada handle korbe.
2. Reviews — brand-scoped na product-scoped? (Recommend: product-scoped, shared across brands, but filterable by brand.)
3. Price default behavior: listing price null hole product.price fallback — OK, na proti listing e explicit price mandatory?

Confirm korle Step 1 migration diye shuru korbo.
