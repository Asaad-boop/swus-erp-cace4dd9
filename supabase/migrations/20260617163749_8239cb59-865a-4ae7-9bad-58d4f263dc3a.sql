CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_orders_source_created_at_desc
  ON public.orders (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_shipping_phone_trgm
  ON public.orders USING GIN (shipping_phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_guest_phone_trgm
  ON public.orders USING GIN (guest_phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_customer_tags_key_tag
  ON public.crm_customer_tags (customer_key, tag);

CREATE INDEX IF NOT EXISTS idx_crm_customer_notes_key_created
  ON public.crm_customer_notes (customer_key, created_at DESC);