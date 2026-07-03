
-- 1. Table
CREATE TABLE public.product_brand_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  price numeric,
  compare_at_price numeric,
  slug text NOT NULL,
  title_override text,
  image_override text,
  description_override text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, brand_id),
  UNIQUE (brand_id, slug)
);

CREATE INDEX idx_pbl_product ON public.product_brand_listings(product_id);
CREATE INDEX idx_pbl_brand_active ON public.product_brand_listings(brand_id) WHERE is_active;

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_brand_listings TO authenticated;
GRANT SELECT ON public.product_brand_listings TO anon;
GRANT ALL ON public.product_brand_listings TO service_role;

-- 3. RLS
ALTER TABLE public.product_brand_listings ENABLE ROW LEVEL SECURITY;

-- Anon: only active listings
CREATE POLICY "Public can view active listings"
  ON public.product_brand_listings FOR SELECT TO anon
  USING (is_active = true);

-- Authenticated: can see everything (dashboard needs full view)
CREATE POLICY "Authenticated can view all listings"
  ON public.product_brand_listings FOR SELECT TO authenticated
  USING (true);

-- Authenticated: can manage listings for brands they have access to (or admin)
CREATE POLICY "Users can manage listings for their brands"
  ON public.product_brand_listings FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_brand_access uba
      WHERE uba.user_id = auth.uid() AND uba.brand_id = product_brand_listings.brand_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_brand_access uba
      WHERE uba.user_id = auth.uid() AND uba.brand_id = product_brand_listings.brand_id
    )
  );

-- 4. updated_at trigger
CREATE TRIGGER update_pbl_updated_at
  BEFORE UPDATE ON public.product_brand_listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Backfill: one listing per existing product using its current brand_id
INSERT INTO public.product_brand_listings (product_id, brand_id, price, slug, is_active, display_order)
SELECT id, brand_id, price, slug, is_active, display_order
FROM public.products
WHERE brand_id IS NOT NULL
ON CONFLICT (product_id, brand_id) DO NOTHING;

-- 6. Resolved catalog view
CREATE OR REPLACE VIEW public.v_brand_catalog AS
SELECT
  l.id            AS listing_id,
  l.brand_id,
  l.product_id,
  COALESCE(l.price, p.price)                    AS price,
  l.compare_at_price,
  l.slug,
  COALESCE(l.title_override, p.title)           AS title,
  COALESCE(l.image_override, p.image)           AS image,
  COALESCE(l.description_override, p.description) AS description,
  l.is_active                                   AS listing_active,
  p.is_active                                   AS product_active,
  p.stock,
  p.available_stock,
  p.category_id,
  p.sku,
  p.barcode,
  p.brand_id                                    AS owner_brand_id,
  l.display_order,
  l.created_at,
  l.updated_at
FROM public.product_brand_listings l
JOIN public.products p ON p.id = l.product_id;

GRANT SELECT ON public.v_brand_catalog TO anon, authenticated;
