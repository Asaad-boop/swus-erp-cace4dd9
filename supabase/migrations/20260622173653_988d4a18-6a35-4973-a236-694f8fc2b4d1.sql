REVOKE EXECUTE ON FUNCTION public.reserve_stock(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid) TO authenticated, service_role;