
CREATE OR REPLACE FUNCTION public.crm_normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL OR length(regexp_replace(p, '\D', '', 'g')) = 0 THEN NULL
    ELSE right(regexp_replace(p, '\D', '', 'g'), 11)
  END
$$;

CREATE TABLE public.crm_customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key text NOT NULL,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_customer_notes_key_idx ON public.crm_customer_notes(customer_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_customer_notes TO authenticated;
GRANT ALL ON public.crm_customer_notes TO service_role;
ALTER TABLE public.crm_customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm notes" ON public.crm_customer_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.crm_customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key text NOT NULL,
  tag text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_key, tag)
);
CREATE INDEX crm_customer_tags_key_idx ON public.crm_customer_tags(customer_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_customer_tags TO authenticated;
GRANT ALL ON public.crm_customer_tags TO service_role;
ALTER TABLE public.crm_customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm tags" ON public.crm_customer_tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.crm_customer_meta (
  customer_key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','at_risk','lost','blocked','vip')),
  internal_email text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_customer_meta TO authenticated;
GRANT ALL ON public.crm_customer_meta TO service_role;
ALTER TABLE public.crm_customer_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm meta" ON public.crm_customer_meta
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER crm_notes_updated_at BEFORE UPDATE ON public.crm_customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
CREATE TRIGGER crm_meta_updated_at BEFORE UPDATE ON public.crm_customer_meta
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

CREATE INDEX IF NOT EXISTS orders_shipping_phone_idx ON public.orders(shipping_phone);
CREATE INDEX IF NOT EXISTS orders_guest_phone_idx ON public.orders(guest_phone);

CREATE OR REPLACE VIEW public.crm_customers_v AS
WITH order_rows AS (
  SELECT
    public.crm_normalize_phone(COALESCE(o.shipping_phone, o.guest_phone)) AS customer_key,
    COALESCE(o.shipping_name, o.guest_name) AS name,
    o.guest_email AS email,
    o.user_id::text AS user_id_text,
    o.brand_id,
    o.total,
    o.created_at,
    o.status::text AS status
  FROM public.orders o
  WHERE public.crm_normalize_phone(COALESCE(o.shipping_phone, o.guest_phone)) IS NOT NULL
),
agg AS (
  SELECT
    customer_key,
    MAX(name) FILTER (WHERE name IS NOT NULL) AS name,
    MAX(email) FILTER (WHERE email IS NOT NULL) AS email,
    MAX(user_id_text) FILTER (WHERE user_id_text IS NOT NULL) AS user_id_text,
    COUNT(*) AS orders_count,
    COUNT(*) FILTER (WHERE status NOT IN ('cancelled','returned','refunded','failed')) AS valid_orders_count,
    COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled','returned','refunded','failed')), 0) AS lifetime_value,
    MIN(created_at) AS first_order_at,
    MAX(created_at) AS last_order_at,
    array_agg(DISTINCT brand_id) FILTER (WHERE brand_id IS NOT NULL) AS brand_ids
  FROM order_rows
  GROUP BY customer_key
)
SELECT
  a.customer_key,
  COALESCE(p.display_name, a.name) AS name,
  COALESCE(m.internal_email, a.email) AS email,
  a.user_id_text::uuid AS user_id,
  (a.user_id_text IS NOT NULL) AS is_registered,
  a.orders_count,
  a.valid_orders_count,
  a.lifetime_value,
  CASE WHEN a.valid_orders_count > 0 THEN a.lifetime_value / a.valid_orders_count ELSE 0 END AS avg_order_value,
  a.first_order_at,
  a.last_order_at,
  a.brand_ids,
  p.customer_segment AS profile_segment,
  m.status AS meta_status
FROM agg a
LEFT JOIN public.profiles p ON p.id = a.user_id_text::uuid
LEFT JOIN public.crm_customer_meta m ON m.customer_key = a.customer_key;

GRANT SELECT ON public.crm_customers_v TO authenticated;
GRANT SELECT ON public.crm_customers_v TO service_role;
