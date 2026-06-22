
-- C3a: Set security_invoker on all public views
ALTER VIEW public.customer_stats_by_phone SET (security_invoker = on);
ALTER VIEW public.reviews_public SET (security_invoker = on);
ALTER VIEW public.v_product_incoming SET (security_invoker = on);
ALTER VIEW public.v_ar_outstanding SET (security_invoker = on);
ALTER VIEW public.v_ap_outstanding SET (security_invoker = on);
ALTER VIEW public.crm_customers_v SET (security_invoker = on);

-- C3b: Revoke EXECUTE from anon/public on internal SECURITY DEFINER functions; grant to authenticated where they are called via RLS/RPC.
REVOKE EXECUTE ON FUNCTION public.get_user_brand_ids(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_rfm_all_brands() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_reorder_triggers_all_brands() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_recurring_rules(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_brand_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_rfm_all_brands() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_reorder_triggers_all_brands() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_recurring_rules(uuid) TO service_role, authenticated;

-- C3d: Materialized views can't enforce RLS in Postgres. Hide crm_customers_mv from anonymous Data API access; keep authenticated reads (filtered server-side).
REVOKE ALL ON public.crm_customers_mv FROM anon, PUBLIC;
GRANT SELECT ON public.crm_customers_mv TO authenticated;
