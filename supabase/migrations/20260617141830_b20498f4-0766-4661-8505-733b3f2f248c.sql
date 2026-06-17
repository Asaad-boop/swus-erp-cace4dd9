
CREATE TABLE IF NOT EXISTS public.crm_imported_customers (
  customer_key text PRIMARY KEY,
  name text,
  email text,
  source text DEFAULT 'csv',
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_imported_customers TO authenticated;
GRANT ALL ON public.crm_imported_customers TO service_role;

ALTER TABLE public.crm_imported_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage imported customers" ON public.crm_imported_customers;
CREATE POLICY "Admins manage imported customers"
  ON public.crm_imported_customers
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.crm_customers_v AS
WITH order_rows AS (
  SELECT crm_normalize_phone(COALESCE(o.shipping_phone, o.guest_phone)) AS customer_key,
         COALESCE(o.shipping_name, o.guest_name) AS name,
         o.guest_email AS email,
         o.user_id::text AS user_id_text,
         o.brand_id,
         o.total,
         o.created_at,
         o.status::text AS status
    FROM orders o
   WHERE crm_normalize_phone(COALESCE(o.shipping_phone, o.guest_phone)) IS NOT NULL
), agg AS (
  SELECT customer_key,
         max(name) FILTER (WHERE name IS NOT NULL) AS name,
         max(email) FILTER (WHERE email IS NOT NULL) AS email,
         max(user_id_text) FILTER (WHERE user_id_text IS NOT NULL) AS user_id_text,
         count(*) AS orders_count,
         count(*) FILTER (WHERE status <> ALL (ARRAY['cancelled','returned','refunded','failed'])) AS valid_orders_count,
         COALESCE(sum(total) FILTER (WHERE status <> ALL (ARRAY['cancelled','returned','refunded','failed'])), 0::numeric) AS lifetime_value,
         min(created_at) AS first_order_at,
         max(created_at) AS last_order_at,
         array_agg(DISTINCT brand_id) FILTER (WHERE brand_id IS NOT NULL) AS brand_ids
    FROM order_rows
   GROUP BY customer_key
), base AS (
  SELECT a.customer_key,
         COALESCE(p.display_name, a.name) AS name,
         COALESCE(m.internal_email, a.email) AS email,
         a.user_id_text::uuid AS user_id,
         (a.user_id_text IS NOT NULL) AS is_registered,
         a.orders_count,
         a.valid_orders_count,
         a.lifetime_value,
         CASE WHEN a.valid_orders_count > 0 THEN a.lifetime_value / a.valid_orders_count::numeric ELSE 0::numeric END AS avg_order_value,
         a.first_order_at,
         a.last_order_at,
         a.brand_ids,
         p.customer_segment AS profile_segment,
         m.status AS meta_status
    FROM agg a
    LEFT JOIN profiles p ON p.id = a.user_id_text::uuid
    LEFT JOIN crm_customer_meta m ON m.customer_key = a.customer_key
)
SELECT * FROM base
UNION ALL
SELECT i.customer_key,
       i.name,
       COALESCE(m.internal_email, i.email) AS email,
       NULL::uuid AS user_id,
       false AS is_registered,
       0::bigint AS orders_count,
       0::bigint AS valid_orders_count,
       0::numeric AS lifetime_value,
       0::numeric AS avg_order_value,
       NULL::timestamptz AS first_order_at,
       NULL::timestamptz AS last_order_at,
       NULL::uuid[] AS brand_ids,
       NULL::text AS profile_segment,
       m.status AS meta_status
  FROM crm_imported_customers i
  LEFT JOIN crm_customer_meta m ON m.customer_key = i.customer_key
 WHERE NOT EXISTS (SELECT 1 FROM base b WHERE b.customer_key = i.customer_key);

DROP TRIGGER IF EXISTS trg_imported_customers_updated ON public.crm_imported_customers;
CREATE TRIGGER trg_imported_customers_updated
  BEFORE UPDATE ON public.crm_imported_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
