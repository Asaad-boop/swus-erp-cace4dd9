
-- Materialized version of crm_customers_v for fast list queries on Vercel
DROP MATERIALIZED VIEW IF EXISTS public.crm_customers_mv;
CREATE MATERIALIZED VIEW public.crm_customers_mv AS
SELECT * FROM public.crm_customers_v;

CREATE UNIQUE INDEX crm_customers_mv_key_idx ON public.crm_customers_mv (customer_key);
CREATE INDEX crm_customers_mv_brand_idx ON public.crm_customers_mv USING GIN (brand_ids);
CREATE INDEX crm_customers_mv_ltv_idx ON public.crm_customers_mv (lifetime_value DESC NULLS LAST);
CREATE INDEX crm_customers_mv_last_idx ON public.crm_customers_mv (last_order_at DESC NULLS LAST);
CREATE INDEX crm_customers_mv_first_idx ON public.crm_customers_mv (first_order_at DESC NULLS LAST);
CREATE INDEX crm_customers_mv_orders_idx ON public.crm_customers_mv (orders_count DESC);
CREATE INDEX crm_customers_mv_user_idx ON public.crm_customers_mv (user_id);

GRANT SELECT ON public.crm_customers_mv TO authenticated;
GRANT ALL ON public.crm_customers_mv TO service_role;

-- Refresh helper
CREATE OR REPLACE FUNCTION public.refresh_crm_customers_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.crm_customers_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_crm_customers_mv() TO authenticated, service_role;

-- Useful indexes for any direct orders queries used by CRM detail page
CREATE INDEX IF NOT EXISTS idx_orders_brand_created ON public.orders (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders (user_id, created_at DESC) WHERE user_id IS NOT NULL;
