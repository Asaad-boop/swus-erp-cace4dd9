ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS color_name text,
  ADD COLUMN IF NOT EXISTS color_hex text;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_color_hex_chk;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_color_hex_chk
    CHECK (color_hex IS NULL OR color_hex ~* '^#[0-9a-f]{6}$');

CREATE INDEX IF NOT EXISTS product_variants_product_active_idx
  ON public.product_variants (product_id, is_active, display_order);